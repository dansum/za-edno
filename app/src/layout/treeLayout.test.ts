// Тест за оформлението при многоредов текст (Alt+Enter, §8.1) — вж. PLAN.md.
import { describe, expect, it } from "vitest";
import { ROOT_ID, addChild, createMindMapDoc, getAllSnapshots, setNodeText } from "../model/doc";
import { computeLayout } from "./treeLayout";

describe("оформление при многоредов текст (§8.1)", () => {
  it("клетка с два реда е по-висока от клетка с един ред", () => {
    const doc = createMindMapDoc();
    const oneLine = addChild(doc, ROOT_ID, "Един ред");
    const twoLines = addChild(doc, ROOT_ID, "Първи ред\nВтори ред");

    const snapshots = getAllSnapshots(doc);
    const layout = computeLayout(doc, snapshots[ROOT_ID]);

    const oneLineBox = layout.nodes.find((n) => n.id === oneLine)!;
    const twoLinesBox = layout.nodes.find((n) => n.id === twoLines)!;
    expect(twoLinesBox.height).toBeGreaterThan(oneLineBox.height);
  });

  it("ширината следва най-дългия ред, не общата дължина на текста", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "AAAAAAAAAA\nBB");
    setNodeText(doc, ROOT_ID, ""); // изчистваме корена, за да не пречи на теста

    const snapshots = getAllSnapshots(doc);
    const layout = computeLayout(doc, snapshots[ROOT_ID]);
    const box = layout.nodes.find((n) => n.id === id)!;
    const wide = addChild(doc, ROOT_ID, "AAAAAAAAAABB"); // същите знаци, но на един ред
    const layout2 = computeLayout(doc, getAllSnapshots(doc)[ROOT_ID]);
    const wideBox = layout2.nodes.find((n) => n.id === wide)!;

    expect(box.width).toBeLessThan(wideBox.width);
  });
});
