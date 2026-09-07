// Геометрия за „облаци" и връзки (§8.2) върху вече изчисленото оформление
// (treeLayout.ts). Отделено от MindMapCanvas.tsx, за да го ползва и износът
// като изображение (importExport/imageExport.ts) — еднакъв изглед навсякъде.

import type { NodeSnapshot, LinkInfo } from "../model/doc";
import type { LayoutResult } from "./treeLayout";

export interface CloudBox {
  id: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LinkPath {
  id: string;
  from: string;
  to: string;
  d: string;
}

const CLOUD_PAD = 14;

/** Бокс около клетка и цялото ѝ (видимо в текущото оформление) поддърво. */
export function computeClouds(nodes: Record<string, NodeSnapshot>, layout: LayoutResult): CloudBox[] {
  const layoutById = new Map(layout.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const n of layout.nodes) {
    if (!n.parentId) continue;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n.id);
  }

  const out: CloudBox[] = [];
  for (const [id, snap] of Object.entries(nodes)) {
    const color = snap.style.cloud;
    const box = color ? layoutById.get(id) : undefined;
    if (!color || !box) continue;
    let minX = box.x;
    let minY = box.y;
    let maxX = box.x + box.width;
    let maxY = box.y + box.height;
    const stack = [...(childrenOf.get(id) ?? [])];
    while (stack.length) {
      const cid = stack.pop()!;
      const cbox = layoutById.get(cid);
      if (!cbox) continue;
      minX = Math.min(minX, cbox.x);
      minY = Math.min(minY, cbox.y);
      maxX = Math.max(maxX, cbox.x + cbox.width);
      maxY = Math.max(maxY, cbox.y + cbox.height);
      stack.push(...(childrenOf.get(cid) ?? []));
    }
    out.push({
      id,
      color,
      x: minX - CLOUD_PAD,
      y: minY - CLOUD_PAD,
      width: maxX - minX + CLOUD_PAD * 2,
      height: maxY - minY + CLOUD_PAD * 2,
    });
  }
  return out;
}

/** Крива между центровете на две произволни клетки (не по дървото). */
export function computeLinkPaths(links: LinkInfo[], layout: LayoutResult): LinkPath[] {
  const layoutById = new Map(layout.nodes.map((n) => [n.id, n]));
  const out: LinkPath[] = [];
  for (const link of links) {
    const from = layoutById.get(link.from);
    const to = layoutById.get(link.to);
    if (!from || !to) continue;
    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height / 2;
    const toX = to.x + to.width / 2;
    const toY = to.y + to.height / 2;
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2 - 40;
    out.push({ id: link.id, from: link.from, to: link.to, d: `M ${fromX} ${fromY} Q ${midX} ${midY}, ${toX} ${toY}` });
  }
  return out;
}
