// Къде точно в целевата клетка е пусната влачената клетка (§8.13).
// Отделено като чиста функция, за да е тествано без браузър.

export type DropZone = "child" | "before" | "after";

export interface ZoneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * - дясната трета на клетката → влачената става ДЕТЕ на целевата
 * - горната половина на останалото → брат НАД целевата
 * - долната половина на останалото → брат ПОД целевата
 */
export function dropZoneAt(rect: ZoneRect, x: number, y: number): DropZone {
  if (x >= rect.left + (rect.width * 2) / 3) return "child";
  return y < rect.top + rect.height / 2 ? "before" : "after";
}
