// Регистър на "моите карти" за таблото (admin.html, §8.3).
//
// Приложението няма собствен сървър, а Liveblocks не може да се пита безопасно
// от браузъра кои стаи съществуват (това изисква таен ключ, не публичния).
// Затова таблото показва карти, които ТОЗИ браузър вече е отварял - записани в
// localStorage. Това е лично за браузъра, не се синхронизира между устройства.

export interface MyMapEntry {
  roomId: string;
  title: string;
  createdAt: number;
  lastOpenedAt: number;
}

const STORAGE_KEY = "mindmap-my-maps";

function readAll(): MyMapEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: MyMapEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* localStorage недостъпен (частен режим и т.н.) - таблото просто ще е празно */
  }
}

export function listMyMaps(): MyMapEntry[] {
  return readAll().sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** Записва/обновява заглавието на карта и мести последно отваряне на "сега". */
export function touchMyMap(roomId: string, title: string): void {
  const entries = readAll();
  const existing = entries.find((e) => e.roomId === roomId);
  const now = Date.now();
  if (existing) {
    existing.title = title || existing.title;
    existing.lastOpenedAt = now;
  } else {
    entries.push({ roomId, title, createdAt: now, lastOpenedAt: now });
  }
  writeAll(entries);
}

/** Маха карта от списъка - НЕ трие самите данни на стаята, само записа в таблото. */
export function removeMyMap(roomId: string): void {
  writeAll(readAll().filter((e) => e.roomId !== roomId));
}
