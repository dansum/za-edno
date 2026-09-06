// Офлайн копие в браузъра — вж. PLAN.md §2 (y-indexeddb).
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export function attachLocalPersistence(doc: Y.Doc, roomId: string): IndexeddbPersistence {
  return new IndexeddbPersistence(`mindmap-collab:${roomId}`, doc);
}
