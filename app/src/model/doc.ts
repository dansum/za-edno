// Модел на данните върху Yjs.
// Плоска карта от възли с указател към родител (вж. PLAN.md §3) —
// избягва конфликтите при местене, характерни за вложени масиви.

import * as Y from "yjs";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { YKeyValue } from "y-utility/y-keyvalue";

export const ROOT_ID = "root";

export type Side = "left" | "right" | null;

export interface NodeStyle {
  /** Цвят на текста (CSS низ, напр. "#b3392b"). */
  color?: string;
  /** Цвят на фона на клетката. */
  background?: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
  /** Цвят на „облака" — рамка около клетката и цялото ѝ поддърво (§8.2). */
  cloud?: string;
  /** Икони по клетката, в реда на добавяне — вж. src/model/icons.ts. */
  icons?: string[];
}

/** Връзка (стрелка) между произволни две клетки, не само родител-дете (§8.2). */
export interface LinkInfo {
  id: string;
  from: string;
  to: string;
}

/** Плоско, само-за-четене представяне на възел — удобно за React рендер. */
export interface NodeSnapshot {
  id: string;
  parent: string | null;
  order: string;
  text: string;
  note: string;
  collapsed: boolean;
  side: Side;
  style: NodeStyle;
}

/**
 * Полето `style` на клетката се променя често и многократно за същия ключ
 * (bold/italic превключвания, undo/redo при тестване) - Y.Map пази история
 * от всички стойности, писани за даден ключ, и никога не я освобождава, дори
 * с активиран GC, затова размерът на стаята расте неограничено с броя
 * промени, не с реалното съдържание (виж инцидента с Liveblocks квотата в
 * PLAN.md §7.6). YKeyValue съхранява само последната стойност на ключ и я
 * заменя изцяло при запис, затова стилът тук е ЕДНА цяла стойност на клетка,
 * не вложена Y.Map структура.
 */
const styleStoreCache = new WeakMap<Y.Doc, YKeyValue<NodeStyle>>();

function getStyleStore(doc: Y.Doc): YKeyValue<NodeStyle> {
  let store = styleStoreCache.get(doc);
  if (!store) {
    store = new YKeyValue(doc.getArray<{ key: string; val: NodeStyle }>("styles"));
    styleStoreCache.set(doc, store);
  }
  return store;
}

/** Суровият Y.Array зад стиловете - за observeDeep/UndoManager scope (вж. useYDoc.ts, useUndo.ts). */
export function getStylesArray(doc: Y.Doc): Y.Array<unknown> {
  return doc.getArray("styles");
}

function pruneStyle(style: NodeStyle): NodeStyle {
  const out: NodeStyle = {};
  if (style.color) out.color = style.color;
  if (style.background) out.background = style.background;
  if (style.bold) out.bold = true;
  if (style.italic) out.italic = true;
  if (style.link) out.link = style.link;
  if (style.cloud) out.cloud = style.cloud;
  if (style.icons?.length) out.icons = style.icons;
  return out;
}

function readStyle(doc: Y.Doc, nodeId: string): NodeStyle {
  return getStyleStore(doc).get(nodeId) ?? {};
}

function writeStyle(doc: Y.Doc, nodeId: string, style: NodeStyle, origin?: unknown): void {
  const store = getStyleStore(doc);
  const pruned = pruneStyle(style);
  doc.transact(() => {
    if (Object.keys(pruned).length) store.set(nodeId, pruned);
    else store.delete(nodeId);
  }, origin);
}

/** Записва целия стил на клетка наведнъж - използва се при внос (вж. importExport/freemind.ts). */
export function setNodeStyle(doc: Y.Doc, nodeId: string, style: NodeStyle | undefined, origin?: unknown): void {
  writeStyle(doc, nodeId, style ?? {}, origin);
}

/** Маха записа за клетка от хранилището - при трайно изтриване на възела. */
export function removeNodeStyle(doc: Y.Doc, nodeId: string): void {
  getStyleStore(doc).delete(nodeId);
}

export function createMindMapDoc(): Y.Doc {
  const doc = new Y.Doc();
  const meta = doc.getMap("meta");
  const nodes = doc.getMap<Y.Map<unknown>>("nodes");

  if (!meta.get("rootId")) {
    doc.transact(() => {
      meta.set("schemaVersion", 1);
      meta.set("rootId", ROOT_ID);
      meta.set("title", "Нова карта");
      meta.set("createdAt", Date.now());
      const root = new Y.Map<unknown>();
      root.set("parent", null);
      root.set("order", "a0");
      const text = new Y.Text();
      text.insert(0, "Централна тема");
      root.set("text", text);
      root.set("note", new Y.Text());
      root.set("collapsed", false);
      root.set("side", null);
      nodes.set(ROOT_ID, root);
    }, "init");
  }

  return doc;
}

export function getNodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap("nodes");
}

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("meta");
}

/** Обхожда от даден възел до корена; връща true ако targetId е сред предците. */
export function isAncestor(doc: Y.Doc, candidateAncestorId: string, nodeId: string): boolean {
  const nodes = getNodesMap(doc);
  let current: string | null = nodeId;
  const seen = new Set<string>();
  while (current) {
    if (current === candidateAncestorId) return true;
    if (seen.has(current)) return false; // защита при вече съществуващ цикъл
    seen.add(current);
    const n = nodes.get(current);
    current = (n?.get("parent") as string | null) ?? null;
  }
  return false;
}

export function getChildren(doc: Y.Doc, parentId: string): NodeSnapshot[] {
  const nodes = getNodesMap(doc);
  const out: NodeSnapshot[] = [];
  nodes.forEach((n, id) => {
    if ((n.get("parent") as string | null) === parentId) {
      out.push(toSnapshot(doc, id, n));
    }
  });
  out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return out;
}

export function toSnapshot(doc: Y.Doc, id: string, n: Y.Map<unknown>): NodeSnapshot {
  const stored = getStyleStore(doc).get(id);
  // Докато ensureStyleMigrated не е минал по този възел, стилът може все още
  // да е в старото вложено Y.Map поле - четем и него, за да не мигне UI-ят.
  const legacy = stored ? undefined : (n.get("style") as Y.Map<unknown> | undefined);
  const legacyIcon = legacy?.get("icon") as string | undefined;
  const style: NodeStyle = stored ?? {
    color: legacy?.get("color") as string | undefined,
    background: legacy?.get("background") as string | undefined,
    bold: legacy?.get("bold") as boolean | undefined,
    italic: legacy?.get("italic") as boolean | undefined,
    link: legacy?.get("link") as string | undefined,
    cloud: legacy?.get("cloud") as string | undefined,
    icons: (legacy?.get("icons") as string[] | undefined) ?? (legacyIcon ? [legacyIcon] : undefined),
  };
  return {
    id,
    parent: (n.get("parent") as string | null) ?? null,
    order: (n.get("order") as string) ?? "a0",
    text: (n.get("text") as Y.Text)?.toString() ?? "",
    note: (n.get("note") as Y.Text)?.toString() ?? "",
    collapsed: Boolean(n.get("collapsed")),
    side: (n.get("side") as Side) ?? null,
    style,
  };
}

export function getAllSnapshots(doc: Y.Doc): Record<string, NodeSnapshot> {
  const nodes = getNodesMap(doc);
  const out: Record<string, NodeSnapshot> = {};
  nodes.forEach((n, id) => {
    out[id] = toSnapshot(doc, id, n);
  });
  return out;
}

/**
 * Страната се задава веднъж, при създаването на възела, и остава непроменена.
 * Ако се изчисляваше наум при всяко рисуване, добавянето на нов възел би
 * разместило вече съществуващите от другата страна на корена.
 */
function pickBalancedSide(doc: Y.Doc): Side {
  const children = getChildren(doc, ROOT_ID);
  let left = 0;
  let right = 0;
  for (const c of children) {
    if (c.side === "left") left++;
    else right++; // липсващата страна се смята за дясна (вж. ensureRootSides)
  }
  return left < right ? "left" : "right";
}

/** Добавя нов възел като последно дете на parentId. */
export function addChild(doc: Y.Doc, parentId: string, text = "", origin?: unknown): string {
  const nodes = getNodesMap(doc);
  const siblings = getChildren(doc, parentId);
  const lastOrder = siblings.length ? siblings[siblings.length - 1].order : null;
  const order = generateKeyBetween(lastOrder, null);
  const id = nanoid(10);
  // само преките деца на корена имат страна; по-надълбоко тя се наследява при рисуването
  const side: Side = parentId === ROOT_ID ? pickBalancedSide(doc) : null;

  doc.transact(() => {
    const n = new Y.Map<unknown>();
    n.set("parent", parentId);
    n.set("order", order);
    const t = new Y.Text();
    if (text) t.insert(0, text);
    n.set("text", t);
    n.set("note", new Y.Text());
    n.set("collapsed", false);
    n.set("side", side);
    nodes.set(id, n);
  }, origin);

  return id;
}

/** Добавя нов брат веднага след afterId (същия родител). */
export function addSiblingAfter(doc: Y.Doc, afterId: string, text = "", origin?: unknown): string | null {
  const nodes = getNodesMap(doc);
  const after = nodes.get(afterId);
  if (!after) return null;
  const parentId = after.get("parent") as string | null;
  if (parentId === null) return null; // коренът няма братя

  const siblings = getChildren(doc, parentId);
  const idx = siblings.findIndex((s) => s.id === afterId);
  const nextOrder = idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1].order : null;
  const order = generateKeyBetween(siblings[idx]?.order ?? null, nextOrder);
  const id = nanoid(10);
  // новият брат остава от същата страна като този, след който се добавя,
  // за да не прескача от другата страна на корена
  const side: Side =
    parentId === ROOT_ID ? ((after.get("side") as Side) ?? "right") : null;

  doc.transact(() => {
    const n = new Y.Map<unknown>();
    n.set("parent", parentId);
    n.set("order", order);
    const t = new Y.Text();
    if (text) t.insert(0, text);
    n.set("text", t);
    n.set("note", new Y.Text());
    n.set("collapsed", false);
    n.set("side", side);
    nodes.set(id, n);
  }, origin);

  return id;
}

/**
 * Еднократно мигриране за карти, създадени преди страната да се записва явно.
 * Раздава страна на всички преки деца на корена, които нямат такава, по същото
 * правило (първата половина вдясно), за да не се разместят визуално. След
 * първото минаване не пише нищо повече.
 */
export function ensureRootSides(doc: Y.Doc, origin?: unknown): boolean {
  const nodes = getNodesMap(doc);
  const children = getChildren(doc, ROOT_ID);
  const missing = children.filter((c) => c.side !== "left" && c.side !== "right");
  if (missing.length === 0) return false;

  const mid = Math.ceil(children.length / 2);
  doc.transact(() => {
    children.forEach((c, i) => {
      if (c.side === "left" || c.side === "right") return;
      nodes.get(c.id)?.set("side", i < mid ? "right" : "left");
    });
  }, origin ?? "assign-sides");
  return true;
}

export function deleteNodeSubtree(doc: Y.Doc, nodeId: string, origin?: unknown): void {
  if (nodeId === ROOT_ID) return; // коренът не се трие
  const nodes = getNodesMap(doc);
  const toDelete: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    toDelete.push(id);
    nodes.forEach((n, cid) => {
      if ((n.get("parent") as string | null) === id) stack.push(cid);
    });
  }
  const deletedSet = new Set(toDelete);
  doc.transact(() => {
    for (const id of toDelete) {
      nodes.delete(id);
      removeNodeStyle(doc, id); // без това стилът на изтрити възли би останал завинаги в хранилището
    }
    for (const link of getAllLinks(doc)) {
      if (deletedSet.has(link.from) || deletedSet.has(link.to)) deleteLink(doc, link.id);
    }
  }, origin);
}

export function setNodeText(doc: Y.Doc, nodeId: string, text: string, origin?: unknown): void {
  const nodes = getNodesMap(doc);
  const n = nodes.get(nodeId);
  if (!n) return;
  const t = n.get("text") as Y.Text;
  doc.transact(() => {
    t.delete(0, t.length);
    if (text) t.insert(0, text);
  }, origin);
}

export function toggleBold(doc: Y.Doc, nodeId: string, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, bold: !current.bold }, origin);
}

export function toggleItalic(doc: Y.Doc, nodeId: string, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, italic: !current.italic }, origin);
}

export function setTextColor(doc: Y.Doc, nodeId: string, color: string | null, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, color: color ?? undefined }, origin);
}

export function setBackgroundColor(
  doc: Y.Doc,
  nodeId: string,
  color: string | null,
  origin?: unknown,
): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, background: color ?? undefined }, origin);
}

/** „Облак" около клетката и цялото ѝ поддърво (§8.2); `null`/липса маха облака. */
export function setCloud(doc: Y.Doc, nodeId: string, color: string | null, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, cloud: color ?? undefined }, origin);
}

/** Клетката като линк (§8.1); `null`/липса маха линка. */
export function setLink(doc: Y.Doc, nodeId: string, url: string | null, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, link: url ?? undefined }, origin);
}

/**
 * Само http(s)/mailto - блокира `javascript:` и други протоколи, с които
 * линк, споделен през чужд файл/карта, би могъл да изпълни код при клик.
 */
export function isSafeLinkUrl(url: string): boolean {
  try {
    // БЕЗ base адрес: относителен низ без протокол (напр. счупен "LINK" от
    // внесен файл) трябва да хвърли, не да се "разреши" тихо спрямо текущата
    // страница - иначе всеки низ минава за "безопасен".
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

export const RED_TEXT_COLOR = "#c0392b";
const RED = RED_TEXT_COLOR;

/**
 * Кратък клавиш за червен текст (§7.4): превключвател, не еднопосочно действие -
 * повторно натискане връща цвета по подразбиране.
 */
export function toggleRedText(doc: Y.Doc, nodeId: string, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  writeStyle(doc, nodeId, { ...current, color: current.color === RED ? undefined : RED }, origin);
}

/** Добавя или маха икона от списъка на клетката (превключвател по вид икона). */
export function toggleIcon(doc: Y.Doc, nodeId: string, iconId: string, origin?: unknown): void {
  const current = readStyle(doc, nodeId);
  const icons = current.icons ?? [];
  const next = icons.includes(iconId) ? icons.filter((i) => i !== iconId) : [...icons, iconId];
  writeStyle(doc, nodeId, { ...current, icons: next }, origin);
}

/**
 * Еднократно мигриране на стари карти: премества стила от вложеното Y.Map
 * поле `node.style` (отпреди YKeyValue хранилището, вж. коментара горе) в
 * новото хранилище, и по същия повод превръща старото единично поле
 * `style.icon` в списъка `style.icons` (вж. PLAN.md §7.5). Идемпотентно.
 */
export function ensureStyleMigrated(doc: Y.Doc, origin?: unknown): boolean {
  const nodes = getNodesMap(doc);
  const store = getStyleStore(doc);
  let migrated = false;
  doc.transact(() => {
    nodes.forEach((n, id) => {
      const legacy = n.get("style") as Y.Map<unknown> | undefined;
      if (!legacy) return;
      const legacyIcon = legacy.get("icon") as string | undefined;
      const icons = (legacy.get("icons") as string[] | undefined) ?? (legacyIcon ? [legacyIcon] : undefined);
      const style = pruneStyle({
        color: legacy.get("color") as string | undefined,
        background: legacy.get("background") as string | undefined,
        bold: legacy.get("bold") as boolean | undefined,
        italic: legacy.get("italic") as boolean | undefined,
        link: legacy.get("link") as string | undefined,
        cloud: legacy.get("cloud") as string | undefined,
        icons,
      });
      if (Object.keys(style).length && !store.has(id)) store.set(id, style);
      n.delete("style");
      migrated = true;
    });
  }, origin ?? "migrate-style");
  return migrated;
}

/**
 * Прехвърля пряко дете на корена от едната страна на другата, без да го мести
 * в дървото (§8.13). Отделно от `moveNode`, защото той нарочно ПАЗИ страната
 * при непроменен родител (§8.5) - тук точно смяната на страната е целта.
 * За по-навътрешни възли страната няма смисъл и извикването се пренебрегва.
 */
export function setNodeSide(doc: Y.Doc, nodeId: string, side: Side, origin?: unknown): void {
  const n = getNodesMap(doc).get(nodeId);
  if (!n || (n.get("parent") as string | null) !== ROOT_ID) return;
  doc.transact(() => n.set("side", side), origin);
}

export function toggleCollapsed(doc: Y.Doc, nodeId: string, origin?: unknown): void {
  const nodes = getNodesMap(doc);
  const n = nodes.get(nodeId);
  if (!n) return;
  doc.transact(() => {
    n.set("collapsed", !n.get("collapsed"));
  }, origin);
}

export interface MoveResult {
  ok: boolean;
  reason?: "self" | "descendant";
}

/**
 * Мести nodeId под newParentId, вмъкнат между beforeId и afterId (по избор).
 * Отказва местенето, ако newParentId е в поддървото на nodeId — вж. PLAN.md §3.2.
 */
export function moveNode(
  doc: Y.Doc,
  nodeId: string,
  newParentId: string,
  beforeOrder: string | null,
  afterOrder: string | null,
  origin?: unknown,
): MoveResult {
  if (nodeId === newParentId) return { ok: false, reason: "self" };
  if (isAncestor(doc, nodeId, newParentId)) {
    // newParentId е потомък на nodeId -> би създало цикъл
    return { ok: false, reason: "descendant" };
  }
  const nodes = getNodesMap(doc);
  const n = nodes.get(nodeId);
  if (!n) return { ok: false };

  const order = generateKeyBetween(beforeOrder, afterOrder);
  // Страната се преизчислява само при истинска смяна на родителя (напр.
  // влачене към нов клон). Чисто пренареждане между братя от СЪЩИЯ родител
  // (Ctrl+нагоре/надолу, §8.5) трябва да пази досегашната страна - иначе
  // pickBalancedSide може да прехвърли възела на другата страна на корена,
  // само защото в момента там има по-малко деца, макар местенето да не е
  // имало нищо общо със смяна на страна.
  const currentParentId = n.get("parent") as string | null;
  const side: Side =
    newParentId === currentParentId ? (n.get("side") as Side) : newParentId === ROOT_ID ? pickBalancedSide(doc) : null;
  doc.transact(() => {
    n.set("parent", newParentId);
    n.set("order", order);
    n.set("side", side);
  }, origin);
  return { ok: true };
}

/**
 * Защитна проверка при зареждане/отдалечена промяна: намира възли, чийто път
 * до корена е прекъснат (изтрит предшественик или откъснат цикъл), и ги
 * закача обратно към корена. Връща списък презакачени id-та (за известие в UI).
 */
export function reattachOrphans(doc: Y.Doc, origin?: unknown): string[] {
  const nodes = getNodesMap(doc);
  const rootId = (getMeta(doc).get("rootId") as string) ?? ROOT_ID;
  const reattached: string[] = [];

  const ids = Array.from(nodes.keys()).filter((id) => id !== rootId);
  for (const id of ids) {
    const seen = new Set<string>();
    let current: string | null = id;
    let broken = false;
    while (current !== rootId) {
      if (current === null || !nodes.has(current)) {
        broken = true;
        break;
      }
      if (seen.has(current)) {
        broken = true; // цикъл
        break;
      }
      seen.add(current);
      current = (nodes.get(current)!.get("parent") as string | null) ?? null;
    }
    if (broken) reattached.push(id);
  }

  if (reattached.length) {
    doc.transact(() => {
      for (const id of reattached) {
        const n = nodes.get(id);
        if (!n) continue;
        n.set("parent", rootId);
        n.set("order", generateKeyBetween(null, null));
      }
    }, origin ?? "reattach-orphans");
  }

  return reattached;
}

// ---------------------------------------------------------------------------
// Връзки (стрелки) между произволни клетки, не само родител-дете (§8.2).
// Създават/трият се рядко (за разлика от стила) - обикновена Y.Map е достатъчна,
// без риска от трупане на история като при §7.6.
// ---------------------------------------------------------------------------

export function getLinksMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap("links");
}

export function getAllLinks(doc: Y.Doc): LinkInfo[] {
  const out: LinkInfo[] = [];
  getLinksMap(doc).forEach((l, id) => {
    out.push({ id, from: l.get("from") as string, to: l.get("to") as string });
  });
  return out;
}

/** Създава връзка от `fromId` към `toId`; връща `null` при опит за връзка на клетка към себе си. */
export function addLink(doc: Y.Doc, fromId: string, toId: string, origin?: unknown): string | null {
  if (fromId === toId) return null;
  const links = getLinksMap(doc);
  const id = nanoid(10);
  doc.transact(() => {
    const l = new Y.Map<unknown>();
    l.set("from", fromId);
    l.set("to", toId);
    links.set(id, l);
  }, origin);
  return id;
}

export function deleteLink(doc: Y.Doc, linkId: string, origin?: unknown): void {
  doc.transact(() => getLinksMap(doc).delete(linkId), origin);
}
