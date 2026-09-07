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
const PADDING_X = 20;
const MIN_W = 60;
const LINE_H = 20; // височина на един ред текст (Alt+Enter за нов ред, §8.1)
const LINE_V_PADDING = 16;

const ICON_W = 20; // приблизителна ширина на едно емоджи-иконка

function textLines(text: string): string[] {
  return (text || " ").split("\n");
}

/**
 * Приблизителна ширина на клетката. Отчита удебелянето (по-широки букви),
 * иконите пред текста (§7.1, §7.5) и само НАЙ-ДЪЛГИЯ ред при многоредов текст
 * (Alt+Enter, §8.1) - иначе клетката излиза по-тясна от съдържанието си и
 * текстът/иконите изтичат извън рамката.
 */
function estimateWidth(text: string, style?: NodeStyle): number {
  const charW = style?.bold ? CHAR_W + 1.5 : CHAR_W;
  const iconsW = (style?.icons?.length ?? 0) * ICON_W;
  const longestLine = Math.max(...textLines(text).map((l) => l.length));
  return Math.max(MIN_W, longestLine * charW + PADDING_X + iconsW);
}

/** Височина на клетката - расте с броя редове при многоредов текст (Alt+Enter). */
function estimateHeight(text: string): number {
  return Math.max(NODE_H, textLines(text).length * LINE_H + LINE_V_PADDING);
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
  const ownHeight = estimateHeight(node.text || " ");
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

  const rootWidth = estimateWidth(root.text || " ", root.style);
  const rootHeight = estimateHeight(root.text || " ");
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
