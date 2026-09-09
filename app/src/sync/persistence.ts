// Офлайн копие в браузъра — вж. PLAN.md §2 (y-indexeddb).
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

/**
 * Авариен изход (§8.11): с `?nolocal=1` в адреса локалното копие не се
 * зарежда и не се пише. Нужно е, когато локалното копие на дадена стая е
 * раздуто/повредено и самото му зареждане срива страницата - така стаята
 * може да се отвори наново само от сървъра (и съдържанието да се изнесе).
 */
export function isLocalPersistenceDisabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("nolocal") === "1";
  } catch {
    return false;
  }
}

export function attachLocalPersistence(doc: Y.Doc, roomId: string): IndexeddbPersistence | null {
  if (isLocalPersistenceDisabled()) return null;
  return new IndexeddbPersistence(`mindmap-collab:${roomId}`, doc);
}

/** Изтрива локалното копие на стая - за възстановяване след повреда (§8.11). */
export async function clearLocalPersistence(roomId: string): Promise<void> {
  await new IndexeddbPersistence(`mindmap-collab:${roomId}`, new Y.Doc()).clearData();
}
