// Копиране, изрязване и поставяне на клетки (§8.20).
//
// В клипборда се слагат три представяния наведнъж:
//  - собствен MIME тип с пълните данни (текст, бележка, стил, сгънатост,
//    поддърво и стрелките между копираните клетки) - за поставяне обратно в
//    карта, включително в друга стая/таб на същия браузър;
//  - text/plain: списък с отместване с табулации - за текстов редактор;
//  - text/html: вложен списък - за Word, Google Docs и т.н.

import * as Y from "yjs";
import {
  ROOT_ID,
  addChild,
  addLink,
  getAllLinks,
  getChildren,
  getNodesMap,
  isAncestor,
  isSafeLinkUrl,
  setNodeStyle,
  toSnapshot,
} from "../model/doc";
import type { NodeStyle } from "../model/doc";
import type { PlainNode } from "../importExport/freemind";
import { iconById } from "../model/icons";

export const MAP_CLIPBOARD_MIME = "application/x-zaedno-cells+json";
export const MAX_PASTE_NODES = 2000;

/**
 * Избраните клетки без тези, чийто прародител също е избран (те и без това
 * влизат в поддървото му), подредени както се срещат в дървото.
 */
export function topLevelSelection(doc: Y.Doc, ids: Iterable<string>): string[] {
  const selected = new Set(ids);
  const ordered: string[] = [];
  (function walk(id: string) {
    ordered.push(id);
    for (const c of getChildren(doc, id)) walk(c.id);
  })(ROOT_ID);
  return ordered.filter(
    (id) => selected.has(id) && ![...selected].some((other) => other !== id && isAncestor(doc, other, id)),
  );
}

/** Поддърветата на дадените клетки като прости дървета, със стрелките само МЕЖДУ тях. */
export function subtreesToPlain(doc: Y.Doc, topIds: string[]): PlainNode[] {
  const nodes = getNodesMap(doc);
  const copied = new Set<string>();
  (function collect(ids: string[]) {
    for (const id of ids) {
      copied.add(id);
      collect(getChildren(doc, id).map((c) => c.id));
    }
  })(topIds);

  const linksByFrom = new Map<string, string[]>();
  for (const l of getAllLinks(doc)) {
    if (!copied.has(l.from) || !copied.has(l.to)) continue;
    if (!linksByFrom.has(l.from)) linksByFrom.set(l.from, []);
    linksByFrom.get(l.from)!.push(l.to);
  }

  function build(id: string): PlainNode {
    const snap = toSnapshot(doc, id, nodes.get(id)!);
    return {
      text: snap.text,
      note: snap.note || undefined,
      collapsed: snap.collapsed || undefined,
      style: Object.keys(snap.style).length ? snap.style : undefined,
      fileId: id,
      arrowlinks: linksByFrom.get(id),
      children: getChildren(doc, id).map((c) => build(c.id)),
    };
  }
  return topIds.filter((id) => nodes.has(id)).map(build);
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

/** Списък с отместване с табулации - по една клетка на ред. */
export function toIndentedText(trees: PlainNode[]): string {
  const lines: string[] = [];
  (function walk(list: PlainNode[], depth: number) {
    for (const n of list) {
      lines.push("\t".repeat(depth) + oneLine(n.text));
      walk(n.children, depth + 1);
    }
  })(trees, 0);
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Вложен списък `<ul>` - текстообработващите програми го показват с отместване. */
export function toHtmlList(trees: PlainNode[]): string {
  const list = (items: PlainNode[]): string =>
    `<ul>${items.map((n) => `<li>${escapeHtml(oneLine(n.text))}${n.children.length ? list(n.children) : ""}</li>`).join("")}</ul>`;
  return list(trees);
}

/**
 * Обратното на `toIndentedText`, за поставяне на текст отвън (или от браузър,
 * който не пренася собствения MIME тип): всеки непразен ред е клетка,
 * отместването определя нивото. Маркерите за списък (-, *, •) се махат.
 */
export function parseIndentedText(text: string): PlainNode[] {
  const roots: PlainNode[] = [];
  const stack: { indent: number; node: PlainNode }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const lead = /^[\t ]*/.exec(raw)![0];
    const indent = [...lead].reduce((w, ch) => w + (ch === "\t" ? 4 : 1), 0);
    const node: PlainNode = { text: raw.slice(lead.length).replace(/^[-*•]\s+/, "").trimEnd(), children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ indent, node });
  }
  return roots;
}

export function countNodes(trees: PlainNode[]): number {
  return trees.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

function sanitizeStyle(raw: unknown): NodeStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const style: NodeStyle = {};
  if (r.bold === true) style.bold = true;
  if (r.italic === true) style.italic = true;
  for (const key of ["color", "background", "cloud"] as const) {
    const v = r[key];
    if (typeof v === "string" && HEX_COLOR.test(v)) style[key] = v;
  }
  if (typeof r.link === "string" && isSafeLinkUrl(r.link)) style.link = r.link;
  if (Array.isArray(r.icons)) {
    const icons = r.icons.filter((i): i is string => typeof i === "string" && !!iconById(i));
    if (icons.length) style.icons = icons;
  }
  return Object.keys(style).length ? style : undefined;
}

/**
 * Данните от клипборда идват отвън (всяка страница може да сложи този MIME
 * тип), затова се пропускат само очакваните полета с очакваните типове.
 */
export function sanitizeTrees(raw: unknown, depth = 0): PlainNode[] {
  if (!Array.isArray(raw) || depth > 100) return [];
  const out: PlainNode[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({
      text: typeof r.text === "string" ? r.text : "",
      note: typeof r.note === "string" ? r.note : undefined,
      collapsed: r.collapsed === true ? true : undefined,
      style: sanitizeStyle(r.style),
      fileId: typeof r.fileId === "string" ? r.fileId : undefined,
      arrowlinks: Array.isArray(r.arrowlinks)
        ? r.arrowlinks.filter((a): a is string => typeof a === "string")
        : undefined,
      children: sanitizeTrees(r.children, depth + 1),
    });
  }
  return out;
}

/**
 * Вмъква дърветата като последни деца на `parentId` - всичко в една
 * транзакция, т.е. една стъпка за „Отмени". Връща id-тата на новите клетки
 * от първо ниво. Стрелките се пренасочват към новите клетки; стрелки към
 * клетки, които не са копирани, се пропускат.
 */
export function insertPlainTrees(doc: Y.Doc, parentId: string, trees: PlainNode[], origin?: unknown): string[] {
  const nodes = getNodesMap(doc);
  const newTopIds: string[] = [];
  doc.transact(() => {
    const copiedToNew = new Map<string, string>();
    const pendingLinks: { from: string; to: string }[] = [];

    function insert(pid: string, n: PlainNode): string {
      const id = addChild(doc, pid, n.text, origin);
      const map = nodes.get(id)!;
      if (n.note) (map.get("note") as Y.Text).insert(0, n.note);
      if (n.collapsed) map.set("collapsed", true);
      if (n.style) setNodeStyle(doc, id, n.style, origin);
      if (n.fileId) copiedToNew.set(n.fileId, id);
      for (const to of n.arrowlinks ?? []) pendingLinks.push({ from: id, to });
      for (const child of n.children) insert(id, child);
      return id;
    }

    for (const tree of trees) newTopIds.push(insert(parentId, tree));
    for (const { from, to } of pendingLinks) {
      const target = copiedToNew.get(to);
      if (target) addLink(doc, from, target, origin);
    }
  }, origin);
  return newTopIds;
}
