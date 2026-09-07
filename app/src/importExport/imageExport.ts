// Износ на картата като изображение (SVG/PNG) — §8.2. Пресъздава оформлението
// и визуалния изглед независимо от DOM-а (не прави screenshot на платното),
// за да излезе еднакво изображение без значение колко е панорамирано/мащабирано.

import { ROOT_ID, getAllLinks, getAllSnapshots } from "../model/doc";
import type * as Y from "yjs";
import { computeLayout } from "../layout/treeLayout";
import { computeClouds, computeLinkPaths } from "../layout/overlays";
import { ICON_CATALOG } from "../model/icons";

const ROOT_BG = "#2a3d45";
const ROOT_COLOR = "#ffffff";
const NODE_BG = "#ffffff";
const NODE_BORDER = "#cfcfc8";
const EDGE_STROKE = "#b7b7ae";
const LINK_STROKE = "#9d4edd";

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Целият документ като самостоятелен SVG низ - вж. коментара горе защо не е screenshot. */
export function exportToSvg(doc: Y.Doc): string {
  const nodes = getAllSnapshots(doc);
  const root = nodes[ROOT_ID];
  if (!root) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"></svg>`;

  const layout = computeLayout(doc, root);
  const clouds = computeClouds(nodes, layout);
  const links = computeLinkPaths(getAllLinks(doc), layout);
  const PAD = 20;
  const width = layout.width + PAD * 2;
  const height = layout.height + PAD * 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#fbfbf9"/>`);
  parts.push(`<g transform="translate(${PAD},${PAD})">`);

  for (const c of clouds) {
    parts.push(
      `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="28" fill="${c.color}" fill-opacity="0.16" stroke="${c.color}" stroke-width="2"/>`,
    );
  }

  for (const edge of layout.edges) {
    const from = layout.nodes.find((n) => n.id === edge.from);
    const to = layout.nodes.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    const fromX = to.side === "left" ? from.x : from.x + from.width;
    const fromY = from.y + from.height / 2;
    const toX = to.side === "left" ? to.x + to.width : to.x;
    const toY = to.y + to.height / 2;
    const midX = (fromX + toX) / 2;
    parts.push(
      `<path d="M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}" fill="none" stroke="${EDGE_STROKE}" stroke-width="2"/>`,
    );
  }

  parts.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${LINK_STROKE}"/></marker></defs>`);
  for (const l of links) {
    parts.push(`<path d="${l.d}" fill="none" stroke="${LINK_STROKE}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#arrow)"/>`);
  }

  for (const n of layout.nodes) {
    const snap = nodes[n.id];
    const isRoot = n.id === ROOT_ID;
    const bg = snap?.style.background ?? (isRoot ? ROOT_BG : NODE_BG);
    const textColor = snap?.style.color ?? (isRoot ? ROOT_COLOR : "#1f2933");
    const weight = snap?.style.bold || isRoot ? "700" : "400";
    const fontStyle = snap?.style.italic ? "italic" : "normal";
    const icons = (snap?.style.icons ?? []).map((id) => ICON_CATALOG.find((i) => i.id === id)?.emoji ?? "").join(" ");
    const label = escapeXmlText(`${icons}${icons ? " " : ""}${n.text || ""}`);

    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="${bg}" stroke="${isRoot ? bg : NODE_BORDER}" stroke-width="2"/>`,
    );
    parts.push(
      `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="${weight}" font-style="${fontStyle}" fill="${textColor}">${label}</text>`,
    );
  }

  parts.push(`</g></svg>`);
  return parts.join("");
}

/** Същото, като растерна картинка (PNG) - удобно за поставяне в презентация/документ. */
export function exportToPngBlob(doc: Y.Doc): Promise<Blob> {
  const svg = exportToSvg(doc);
  const widthMatch = /width="(\d+)"/.exec(svg);
  const heightMatch = /height="(\d+)"/.exec(svg);
  const width = widthMatch ? Number(widthMatch[1]) : 800;
  const height = heightMatch ? Number(heightMatch[1]) : 600;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // 2x за по-четлив текст на изображението
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D не е достъпен."));
        return;
      }
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Неуспешно създаване на PNG."));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Неуспешно рендиране на SVG за PNG износ."));
    };
    img.src = url;
  });
}

/** Помощна: сваля Blob като файл в браузъра (аналог на downloadTextFile за текст). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
