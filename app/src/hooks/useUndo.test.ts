// Регресионен тест: React (StrictMode) в разработка монтира и веднага пак
// демонтира всеки ефект, преди истинското монтиране. Y.UndoManager.destroy()
// маха слушателя си завинаги, така че наивна употреба го оставя "глух" за
// нови промени точно след това фалшиво размонтиране - undo/redo мълчаливо
// спират да работят. Вж. PLAN.md, Алфа 0.3/0.4 бележките за тази поправка.

import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { useUndoManager } from "./useUndo";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useUndoManager", () => {
  it("проследява промени и след двойното монтиране на StrictMode", async () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap<Y.Map<unknown>>("nodes");
    const node = new Y.Map();
    node.set("style", new Y.Map());
    nodes.set("n1", node);

    const origin = Symbol("test-origin");
    const { result } = renderHook(() => useUndoManager(doc, origin), {
      wrapper: StrictMode,
    });

    // изчакваме отложеното (по)унищожаване от хука да отмине цикъла си
    await wait(1100);

    const style = node.get("style") as Y.Map<unknown>;
    doc.transact(() => style.set("bold", true), origin);

    expect(result.current.undoStack.length).toBe(1);

    result.current.undo();
    expect(style.get("bold")).toBeUndefined();
  });
});
