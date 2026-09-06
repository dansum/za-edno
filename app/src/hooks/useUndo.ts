import { useEffect, useRef } from "react";
import * as Y from "yjs";

/**
 * Y.UndoManager, филтриран по origin, за да отменя само собствените
 * действия на текущия клиент (вж. PLAN.md §4).
 */
export function useUndoManager(doc: Y.Doc, localOrigin: symbol): Y.UndoManager {
  const managerRef = useRef<Y.UndoManager | undefined>(undefined);
  if (!managerRef.current) {
    managerRef.current = new Y.UndoManager([doc.getMap("nodes")], {
      trackedOrigins: new Set([localOrigin]),
    });
  }

  useEffect(() => {
    const mgr = managerRef.current!;
    return () => mgr.destroy();
  }, []);

  return managerRef.current;
}
