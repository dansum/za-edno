// Внос и износ на FreeMind (.mm) — вж. PLAN.md Фаза 4.
// Форматът е XML: <map><node TEXT="..."><node TEXT="..."/></node></map>

import * as Y from "yjs";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import {
  ROOT_ID,
  getChildren,
  getMeta,
  getNodesMap,
  removeNodeStyle,
  setNodeStyle,
  toSnapshot,
} from "../model/doc";
import type { NodeSnapshot, NodeStyle, Side } from "../model/doc";
import { iconByFreemindName, iconById } from "../model/icons";

export interface PlainNode {
  text: string;
  note?: string;
  collapsed?: boolean;
  side?: Side;
  style?: NodeStyle;
  children: PlainNode[];
}

// ---------------------------------------------------------------- износ

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeToXml(doc: Y.Doc, node: NodeSnapshot, depth: number): string {
  const indent = "  ".repeat(depth);
  const children = getChildren(doc, node.id);
  const attrs = [`TEXT="${escapeXml(node.text)}"`];
  if (node.side === "left" || node.side === "right") attrs.push(`POSITION="${node.side}"`);
  // Признакът се записва винаги при сгънат възел, дори да няма деца в момента:
  // иначе цикълът внос -> износ -> внос губи състоянието, зададено от потребителя.
  if (node.collapsed) attrs.push(`FOLDED="true"`);
  if (node.style.color) attrs.push(`COLOR="${node.style.color}"`);
  if (node.style.background) attrs.push(`BACKGROUND_COLOR="${node.style.background}"`);

  const inner: string[] = [];
  if (node.style.bold || node.style.italic) {
    const fontAttrs = [];
    if (node.style.bold) fontAttrs.push(`BOLD="true"`);
    if (node.style.italic) fontAttrs.push(`ITALIC="true"`);
    inner.push(`${indent}  <font ${fontAttrs.join(" ")}/>`);
  }
  for (const iconId of node.style.icons ?? []) {
    const icon = iconById(iconId);
    if (icon) inner.push(`${indent}  <icon BUILTIN="${icon.freemindName}"/>`);
  }
  for (const child of children) inner.push(nodeToXml(doc, child, depth + 1));

  if (inner.length === 0) {
    return `${indent}<node ${attrs.join(" ")}/>`;
  }
  return `${indent}<node ${attrs.join(" ")}>\n${inner.join("\n")}\n${indent}</node>`;
}

/** Целият документ като FreeMind .mm файл. */
export function exportToFreeMind(doc: Y.Doc): string {
  const nodes = getNodesMap(doc);
  const rootMap = nodes.get(ROOT_ID);
  const root = rootMap ? toSnapshot(doc, ROOT_ID, rootMap) : null;
  if (!root) return `<map version="1.0.1">\n</map>\n`;
  return `<map version="1.0.1">\n${nodeToXml(doc, root, 1)}\n</map>\n`;
}

/** Дървото като Markdown списък - удобно за поставяне в документ. */
export function exportToMarkdown(doc: Y.Doc): string {
  const nodes = getNodesMap(doc);
  const rootText = (nodes.get(ROOT_ID)?.get("text") as Y.Text | undefined)?.toString() ?? "";
  const lines: string[] = [`# ${rootText}`, ""];

  function walk(parentId: string, depth: number) {
    for (const child of getChildren(doc, parentId)) {
      lines.push(`${"  ".repeat(depth)}- ${child.text}`);
      walk(child.id, depth + 1);
    }
  }
  walk(ROOT_ID, 0);
  return lines.join("\n") + "\n";
}

/** Дървото като OPML - разбира се от повечето програми за структуриране. */
export function exportToOpml(doc: Y.Doc): string {
  const nodes = getNodesMap(doc);
  const rootText = (nodes.get(ROOT_ID)?.get("text") as Y.Text | undefined)?.toString() ?? "";

  function walk(parentId: string, depth: number): string {
    const indent = "  ".repeat(depth);
    return getChildren(doc, parentId)
      .map((c) => {
        const inner = walk(c.id, depth + 1);
        return inner
          ? `${indent}<outline text="${escapeXml(c.text)}">\n${inner}\n${indent}</outline>`
          : `${indent}<outline text="${escapeXml(c.text)}"/>`;
      })
      .join("\n");
  }

  const body = walk(ROOT_ID, 3);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0">`,
    `  <head><title>${escapeXml(rootText)}</title></head>`,
    `  <body>`,
    `    <outline text="${escapeXml(rootText)}">`,
    body,
    `    </outline>`,
    `  </body>`,
    `</opml>`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ---------------------------------------------------------------- внос

/** Разчита .mm файл до просто дърво. Хвърля при повреден XML. */
export function parseFreeMind(xml: string): PlainNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Файлът не е валиден XML (FreeMind .mm).");
  }

  const rootNode = doc.querySelector("map > node");
  if (!rootNode) {
    throw new Error("Във файла няма коренен <node> - това не изглежда като карта на FreeMind.");
  }

  function convert(el: Element): PlainNode {
    const richText = el.querySelector(":scope > richcontent");
    const text = el.getAttribute("TEXT") ?? richText?.textContent?.trim() ?? "";
    const position = el.getAttribute("POSITION");
    const children = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "node");

    const font = el.querySelector(":scope > font");
    const style: NodeStyle = {};
    if (el.getAttribute("COLOR")) style.color = el.getAttribute("COLOR")!;
    if (el.getAttribute("BACKGROUND_COLOR")) style.background = el.getAttribute("BACKGROUND_COLOR")!;
    if (font?.getAttribute("BOLD") === "true") style.bold = true;
    if (font?.getAttribute("ITALIC") === "true") style.italic = true;
    const icons = Array.from(el.querySelectorAll(":scope > icon"))
      .map((iconEl) => iconByFreemindName(iconEl.getAttribute("BUILTIN") ?? "")?.id)
      .filter((id): id is string => Boolean(id));
    if (icons.length) style.icons = icons;

    return {
      text,
      collapsed: el.getAttribute("FOLDED") === "true",
      side: position === "left" ? "left" : position === "right" ? "right" : null,
      style,
      children: children.map(convert),
    };
  }

  return convert(rootNode);
}

/**
 * Записва просто дърво в Yjs документа, като ЗАМЕНЯ текущото съдържание.
 * Използва се при вноса на файл.
 */
export function replaceDocWithTree(doc: Y.Doc, tree: PlainNode, origin?: unknown): void {
  const nodes = getNodesMap(doc);

  doc.transact(() => {
    // изчистваме всичко освен корена, който само пренаписваме
    for (const id of Array.from(nodes.keys())) {
      if (id !== ROOT_ID) {
        nodes.delete(id);
        removeNodeStyle(doc, id); // без това старите стилове остават завинаги в хранилището
      }
    }

    const root = nodes.get(ROOT_ID);
    if (root) {
      const t = root.get("text") as Y.Text;
      t.delete(0, t.length);
      if (tree.text) t.insert(0, tree.text);
      root.set("collapsed", false);
      setNodeStyle(doc, ROOT_ID, tree.style, origin);
    }
    getMeta(doc).set("title", tree.text || "Внесена карта");

    // FreeMind редува страните само за преките деца на корена;
    // ако файлът не казва нищо, редуваме сами, за да е балансирано
    let autoSide: Side = "right";

    function insert(parentId: string, child: PlainNode, prevOrder: string | null): string {
      const order = generateKeyBetween(prevOrder, null);
      const id = nanoid(10);
      const n = new Y.Map<unknown>();
      n.set("parent", parentId);
      n.set("order", order);
      const t = new Y.Text();
      if (child.text) t.insert(0, child.text);
      n.set("text", t);
      n.set("note", new Y.Text());
      n.set("collapsed", Boolean(child.collapsed));
      if (parentId === ROOT_ID) {
        const side = child.side ?? autoSide;
        n.set("side", side);
        autoSide = autoSide === "right" ? "left" : "right";
      } else {
        n.set("side", null);
      }
      nodes.set(id, n);
      setNodeStyle(doc, id, child.style, origin);

      let childPrev: string | null = null;
      for (const grand of child.children) {
        childPrev = insert(id, grand, childPrev);
      }
      return order;
    }

    let prev: string | null = null;
    for (const child of tree.children) {
      prev = insert(ROOT_ID, child, prev);
    }
  }, origin ?? "import");
}

/** Помощна: сваля текст като файл в браузъра. */
export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
