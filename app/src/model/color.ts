// Помощ за цветовете на клетките — вж. PLAN.md §7.3.

/** Готова палитра за бърз избор — не ограничава свободния избор на цвят. */
export const TEXT_COLOR_PALETTE = ["#1f2933", "#c0392b", "#1c4f8b", "#2a7a4f", "#8e44ad", "#b8860b"];
export const BACKGROUND_COLOR_PALETTE = [
  "#ffffff",
  "#fdecea",
  "#e8f0fe",
  "#e6f4ea",
  "#f3e8fd",
  "#fff8e1",
];
/** По-наситени тонове за „облака" (§8.2) - рисува се полупрозрачен, бледата
 * палитра на фона на клетката почти не се вижда зад него. */
export const CLOUD_COLOR_PALETTE = [
  "#e07a5f",
  "#3d5a80",
  "#81b29a",
  "#f2cc8f",
  "#9d4edd",
  "#2a9d8f",
];

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** Относителна луминантност по формулата на WCAG, за груба преценка на контраста. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Автоматичен цвят на текста при зададен фон, ако потребителят не е задал свой.
 * Целта не е перфектен WCAG контраст, а да не се получат нечетими клетки.
 *
 * Връща цвят и за двете посоки (не само за тъмен фон): коренът по подразбиране
 * е с бял текст (зададен от CSS класа му), затова светъл фон без изричен обратен
 * цвят на текста дава бял текст на светло - нечетимо. Затова тук винаги се
 * решава изрично, ако изобщо има зададен фон.
 */
export function readableTextColorFor(backgroundHex: string | undefined): string | undefined {
  if (!backgroundHex) return undefined;
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return undefined;
  return relativeLuminance(rgb) < 0.5 ? "#f5f5f0" : "#1f2933";
}
