// Модел на данните върху Yjs.
// Плоска карта от възли с указател към родител (вж. PLAN.md §3) —
// избягва конфликтите при местене, характерни за вложени масиви.

import * as Y from "yjs";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";

export const ROOT_ID = "root";

export type Side = "left" | "right" | null;

export interface NodeStyle {
  color?: string;
  icon?: string;
  bold?: boolean;
  link?: string;
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
      root.set("style", new Y.Map());
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
      out.push(toSnapshot(id, n));
    }
  });
  out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return out;
}

export function toSnapshot(id: string, n: Y.Map<unknown>): NodeSnapshot {
  const styleMap = n.get("style") as Y.Map<unknown> | undefined;
  return {
    id,
    parent: (n.get("parent") as string | null) ?? null,
    order: (n.get("order") as string) ?? "a0",
    text: (n.get("text") as Y.Text)?.toString() ?? "",
    note: (n.get("note") as Y.Text)?.toString() ?? "",
    collapsed: Boolean(n.get("collapsed")),
    side: (n.get("side") as Side) ?? null,
    style: {
      color: styleMap?.get("color") as string | undefined,
      icon: styleMap?.get("icon") as string | undefined,
      bold: styleMap?.get("bold") as boolean | undefined,
      link: styleMap?.get("link") as string | undefined,
    },
  };
}

export function getAllSnapshots(doc: Y.Doc): Record<string, NodeSnapshot> {
  const nodes = getNodesMap(doc);
  const out: Record<string, NodeSnapshot> = {};
  nodes.forEach((n, id) => {
    out[id] = toSnapshot(id, n);
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
    n.set("style", new Y.Map());
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
    n.set("style", new Y.Map());
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
  doc.transact(() => {
    for (const id of toDelete) nodes.delete(id);
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
  // страна има смисъл само за преките деца на корена
  const side: Side = newParentId === ROOT_ID ? pickBalancedSide(doc) : null;
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
