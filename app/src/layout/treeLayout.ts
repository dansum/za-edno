// Балансирано оформление ляво/дясно от корена — вж. PLAN.md §6.
import { ROOT_ID, getChildren } from "../model/doc";
import type { NodeSnapshot, NodeStyle } from "../model/doc";
import type * as Y from "yjs";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  side: "left" | "right" | null; // null само за корена
  parentId: string | null;
  text: string;
  collapsed: boolean;
  hasChildren: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
}

const H_GAP = 60; // хоризонтално разстояние между нива
const V_GAP = 12; // вертикално разстояние между братя
const NODE_H = 36;
const CHAR_W = 8;
// Хоризонталната „обвивка" около текста: 2×10px отстъп + 2×2px рамка на
// `.mindmap-node` (App.css, box-sizing: border-box). Беше 20 - без рамката -
// и текстът оставаше с 2px по-тесен от себе си, затова ВСЯКА клетка
// пренасяше последната си дума на втори ред (§8.19).
const CHROME_X = 24;
const MIN_W = 60;
/** Височина на един ред текст - съвпада с `line-height` на `.node-text` и `.node-edit-input`. */
export const LINE_H = 20;
const LINE_V_PADDING = 16;
/**
 * Текст, по-широк от това, се пренася на следващ ред (§8.19) - иначе една
 * дълга клетка се простира през половината екран. Под него клетката е
 * винаги на един ред, освен при ръчен нов ред (Alt+Enter, §8.1).
 */
const MAX_TEXT_W = 320;

const ICON_W = 20; // приблизителна ширина на едно емоджи-иконка

/** Същата граница като медийната заявка в App.css, под която клетките са 14px вместо 13px. */
export const SMALL_SCREEN_QUERY = "(max-width: 720px)";

function nodeFontPx(): number {
  return typeof window !== "undefined" && window.matchMedia?.(SMALL_SCREEN_QUERY).matches ? 14 : 13;
}

let measureCanvas: HTMLCanvasElement | null = null;

/**
 * Истинската широчина на текста в пиксели, чрез скрит `canvas` със същия
 * шрифт като клетките (вж. `.mindmap-node` в App.css), включително размера
 * му, който на тесен екран е по-едър. В тестова среда (happy-dom) `canvas`
 * няма 2D контекст - пада обратно на груба оценка "8px на знак", достатъчна
 * за ОТНОСИТЕЛНИТЕ сравнения в тестовете, но не и за истинския изглед.
 */
function measureTextWidth(text: string, bold: boolean): number {
  if (typeof document !== "undefined") {
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    if (ctx) {
      ctx.font = `${bold ? 700 : 400} ${nodeFontPx()}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      return ctx.measureText(text).width;
    }
  }
  return text.length * (bold ? CHAR_W + 1.5 : CHAR_W);
}

/**
 * Пренася един ред (без ръчни нови редове в него) по думи, така както го
 * пренася и браузърът при `white-space: pre-wrap` - жадно, по интервалите;
 * дума, по-дълга от целия ред, се реже по знаци (`overflow-wrap: break-word`).
 */
function wrapLine(line: string, bold: boolean): string[] {
  if (measureTextWidth(line, bold) <= MAX_TEXT_W) return [line];
  const out: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, bold) <= MAX_TEXT_W) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    if (measureTextWidth(word, bold) <= MAX_TEXT_W) {
      current = word;
      continue;
    }
    current = "";
    for (const ch of word) {
      if (current && measureTextWidth(current + ch, bold) > MAX_TEXT_W) {
        out.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Редовете, които реално се виждат в клетката: ръчните нови редове
 * (Alt+Enter) плюс автоматичното пренасяне на твърде дълги редове (§8.19).
 * Ползва се за ширината и височината на клетката, за броя редове в полето
 * при редакция и от износа като изображение.
 */
export function visualLines(text: string, style?: NodeStyle): string[] {
  return (text || " ").split("\n").flatMap((line) => wrapLine(line, !!style?.bold));
}

/**
 * Ширината на клетката: най-широкият видим ред + иконите пред текста (§7.5)
 * + обвивката. Изнесена, за да я ползва и `NodeBox` за живо преоразмеряване,
 * докато потребителят пише (§8.16).
 */
export function estimateWidth(text: string, style?: NodeStyle): number {
  const iconsW = (style?.icons?.length ?? 0) * ICON_W;
  const widestLineW = visualLines(text, style).reduce(
    (max, line) => Math.max(max, measureTextWidth(line, !!style?.bold)),
    0,
  );
  // +2px предпазен запас срещу леко подценяване на `measureText` спрямо
  // истинското изчертаване (антиалиасинг/кернинг).
  return Math.max(MIN_W, Math.ceil(widestLineW) + 2 + CHROME_X + iconsW);
}

/** Височина на клетката - расте с броя видими редове (ръчни и автоматично пренесени). */
export function estimateHeight(text: string, style?: NodeStyle): number {
  return Math.max(NODE_H, visualLines(text, style).length * LINE_H + LINE_V_PADDING);
}

/**
 * Стилът, по който се МЕРИ коренът: той е винаги получер чрез CSS
 * (`.mindmap-node.root`), независимо от `style.bold` в модела (§8.18).
 */
export function rootMeasureStyle(style: NodeStyle | undefined): NodeStyle {
  return { ...style, bold: true };
}

interface SubtreeResult {
  height: number; // сумарна височина на поддървото (за подредба по Y)
  layout: (originX: number, centerY: number, side: "left" | "right") => LayoutNode[];
}

function layoutSubtree(
  doc: Y.Doc,
  nodeId: string,
  node: NodeSnapshot,
): SubtreeResult {
  const width = estimateWidth(node.text || " ", node.style);
  const ownHeight = estimateHeight(node.text || " ", node.style);
  if (node.collapsed) {
    return {
      height: ownHeight,
      layout: (originX, centerY, side) => [
        {
          id: nodeId,
          x: side === "right" ? originX : originX - width,
          y: centerY - ownHeight / 2,
          width,
          height: ownHeight,
          side,
          parentId: node.parent,
          text: node.text,
          collapsed: node.collapsed,
          hasChildren: true, // предполагаме - реалната проверка е на извикващия
        },
      ],
    };
  }

  const children = getChildren(doc, nodeId);
  if (children.length === 0) {
    return {
      height: ownHeight,
      layout: (originX, centerY, side) => [
        {
          id: nodeId,
          x: side === "right" ? originX : originX - width,
          y: centerY - ownHeight / 2,
          width,
          height: ownHeight,
          side,
          parentId: node.parent,
          text: node.text,
          collapsed: node.collapsed,
          hasChildren: false,
        },
      ],
    };
  }

  const childResults = children.map((c) => ({ id: c.id, node: c, sub: layoutSubtree(doc, c.id, c) }));
  const totalChildrenHeight =
    childResults.reduce((sum, c) => sum + c.sub.height, 0) + V_GAP * (childResults.length - 1);
  const height = Math.max(ownHeight, totalChildrenHeight);

  return {
    height,
    layout: (originX, centerY, side) => {
      const out: LayoutNode[] = [
        {
          id: nodeId,
          x: side === "right" ? originX : originX - width,
          y: centerY - ownHeight / 2,
          width,
          height: ownHeight,
          side,
          parentId: node.parent,
          text: node.text,
          collapsed: node.collapsed,
          hasChildren: true,
        },
      ];
      const childOriginX = side === "right" ? originX + width + H_GAP : originX - width - H_GAP;
      let cursorY = centerY - height / 2;
      for (const c of childResults) {
        const childCenterY = cursorY + c.sub.height / 2;
        out.push(...c.sub.layout(childOriginX, childCenterY, side));
        cursorY += c.sub.height + V_GAP;
      }
      return out;
    },
  };
}

export function computeLayout(doc: Y.Doc, root: NodeSnapshot): LayoutResult {
  const actualChildren = getChildren(doc, ROOT_ID);
  const allChildren = root.collapsed ? [] : actualChildren;
  // Страната се чете само от записаното в модела (задава се при създаване на
  // възела), за да не се разместват съществуващите възли при добавяне на нов.
  // Липсваща страна означава стара карта преди мигрирането - показва се вдясно.
  const leftChildren = allChildren.filter((c) => c.side === "left");
  const rightChildren = allChildren.filter((c) => c.side !== "left");

  // Коренът винаги се изчертава получер чрез CSS (`.mindmap-node.root`),
  // независимо от `style.bold` в модела - без `bold: true` тук ширината се
  // мереше по-тънкия (обикновен) шрифт и излизаше няколко пиксела по-тясна
  // от РЕАЛНО изчертания получер текст, затова коренът пренасяше на втори
  // ред дори при съвсем нормална дължина на текста (§8.18).
  const rootStyle = rootMeasureStyle(root.style);
  const rootWidth = estimateWidth(root.text || " ", rootStyle);
  const rootHeight = estimateHeight(root.text || " ", rootStyle);
  const nodes: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];

  function layoutSide(children: NodeSnapshot[], side: "left" | "right") {
    const results = children.map((c) => ({ node: c, sub: layoutSubtree(doc, c.id, c) }));
    const totalHeight =
      results.reduce((sum, r) => sum + r.sub.height, 0) + V_GAP * Math.max(0, results.length - 1);
    let cursorY = -totalHeight / 2;
    const originX = side === "right" ? rootWidth / 2 + H_GAP : -rootWidth / 2 - H_GAP;
    for (const r of results) {
      const centerY = cursorY + r.sub.height / 2;
      nodes.push(...r.sub.layout(originX, centerY, side));
      edges.push({ from: ROOT_ID, to: r.node.id });
      cursorY += r.sub.height + V_GAP;
    }
    return totalHeight;
  }

  layoutSide(leftChildren, "left");
  layoutSide(rightChildren, "right");

  nodes.push({
    id: ROOT_ID,
    x: -rootWidth / 2,
    y: -rootHeight / 2,
    width: rootWidth,
    height: rootHeight,
    side: null,
    parentId: null,
    text: root.text,
    collapsed: root.collapsed,
    hasChildren: actualChildren.length > 0,
  });

  // добавяме ребрата между родител-дете за всички нива (не само от корена)
  for (const n of nodes) {
    if (n.parentId && n.parentId !== ROOT_ID) {
      edges.push({ from: n.parentId, to: n.id });
    }
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));

  // изместваме всичко в положителни координати с малко поле
  const offsetX = -minX + 40;
  const offsetY = -minY + 40;
  for (const n of nodes) {
    n.x += offsetX;
    n.y += offsetY;
  }

  return {
    nodes,
    edges,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
  };
}
