import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { getLinksMap, getStylesArray } from "../model/doc";

/**
 * Y.UndoManager, филтриран по origin, за да отменя само собствените
 * действия на текущия клиент (вж. PLAN.md §4).
 */
export function useUndoManager(doc: Y.Doc, localOrigin: symbol): Y.UndoManager {
  const managerRef = useRef<Y.UndoManager | undefined>(undefined);
  const closingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!managerRef.current) {
    // Стилът (bold/italic/цветове/икони) вече живее в отделен Y.Array
    // (getStylesArray), не вложен в "nodes" - трябва изрично да е в обхвата,
    // иначе undo/redo спира да го хваща.
    managerRef.current = new Y.UndoManager([doc.getMap("nodes"), getStylesArray(doc), getLinksMap(doc)], {
      trackedOrigins: new Set([localOrigin]),
    });
  }

  useEffect(() => {
    // React (StrictMode) в разработка размонтира и веднага пак монтира ефекта.
    // Y.UndoManager.destroy() маха слушателя си за "afterTransaction" завинаги -
    // обектът остава жив, но повече никога не хваща нови промени (undoStack
    // спира да расте, undo/redo мълчаливо спират да работят). Затова, точно
    // както при провайдъра за синхронизация, унищожаването се отлага малко и
    // се отменя, ако ефектът веднага се появи отново.
    if (closingRef.current) {
      clearTimeout(closingRef.current);
      closingRef.current = null;
    }
    const mgr = managerRef.current!;
    return () => {
      closingRef.current = setTimeout(() => {
        mgr.destroy();
        managerRef.current = undefined;
        closingRef.current = null;
      }, 1000);
    };
  }, []);

  return managerRef.current;
}

/**
 * Показва дали има какво да се отмени/повтори в момента - за бутоните в
 * лентата (§7.2). Y.UndoManager не е реактивен сам по себе си, затова
 * слушаме собствените му събития за стека.
 */
export function useUndoRedoState(manager: Y.UndoManager): { canUndo: boolean; canRedo: boolean } {
  const [state, setState] = useState(() => ({
    canUndo: manager.undoStack.length > 0,
    canRedo: manager.redoStack.length > 0,
  }));

  useEffect(() => {
    const update = () =>
      setState({
        canUndo: manager.undoStack.length > 0,
        canRedo: manager.redoStack.length > 0,
      });
    manager.on("stack-item-added", update);
    manager.on("stack-item-popped", update);
    manager.on("stack-item-updated", update);
    update();
    return () => {
      manager.off("stack-item-added", update);
      manager.off("stack-item-popped", update);
      manager.off("stack-item-updated", update);
    };
  }, [manager]);

  return state;
}
