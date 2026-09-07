// Каталог на вградените икони за клетките — вж. PLAN.md §7.5.
// Всяка икона има собствен id (пазен в style.icons), емоджи за показване в
// платното и лентата с инструменти, и име по стандарта на FreeMind за износ/внос.

export interface IconDef {
  id: string;
  emoji: string;
  freemindName: string;
  /** Клавишна комбинация за показване в помощта (истинското прихващане е в MindMapCanvas). */
  shortcut: string;
}

export const ICON_CATALOG: IconDef[] = [
  { id: "num-1", emoji: "1️⃣", freemindName: "full-1", shortcut: "Ctrl+Shift+1" },
  { id: "num-2", emoji: "2️⃣", freemindName: "full-2", shortcut: "Ctrl+Shift+2" },
  { id: "num-3", emoji: "3️⃣", freemindName: "full-3", shortcut: "Ctrl+Shift+3" },
  { id: "num-4", emoji: "4️⃣", freemindName: "full-4", shortcut: "Ctrl+Shift+4" },
  { id: "num-5", emoji: "5️⃣", freemindName: "full-5", shortcut: "Ctrl+Shift+5" },
  { id: "num-6", emoji: "6️⃣", freemindName: "full-6", shortcut: "Ctrl+Shift+6" },
  { id: "num-7", emoji: "7️⃣", freemindName: "full-7", shortcut: "Ctrl+Shift+7" },
  { id: "num-8", emoji: "8️⃣", freemindName: "full-8", shortcut: "Ctrl+Shift+8" },
  { id: "num-9", emoji: "9️⃣", freemindName: "full-9", shortcut: "Ctrl+Shift+9" },
  { id: "num-0", emoji: "0️⃣", freemindName: "full-0", shortcut: "Ctrl+Shift+0" },
  { id: "star", emoji: "★", freemindName: "bookmark", shortcut: "Ctrl+Shift+A" },
  { id: "exclaim", emoji: "❗", freemindName: "messagebox_warning", shortcut: "Ctrl+Shift+E" },
  { id: "stop", emoji: "⛔", freemindName: "stop-sign", shortcut: "Ctrl+Shift+S" },
  { id: "idea", emoji: "💡", freemindName: "idea", shortcut: "Ctrl+Shift+D" },
];

const BY_ID = new Map(ICON_CATALOG.map((i) => [i.id, i]));
const BY_FREEMIND_NAME = new Map(ICON_CATALOG.map((i) => [i.freemindName, i]));

export function iconById(id: string): IconDef | undefined {
  return BY_ID.get(id);
}

export function iconByFreemindName(name: string): IconDef | undefined {
  return BY_FREEMIND_NAME.get(name);
}

/** event.code за цифровите клавиши -> id на иконата (за Ctrl+Shift+цифра). */
export function iconIdForDigitCode(code: string): string | null {
  const match = /^Digit([0-9])$/.exec(code);
  if (!match) return null;
  const digit = match[1];
  return digit === "0" ? "num-0" : `num-${digit}`;
}
