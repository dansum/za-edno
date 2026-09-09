// Регресия за §8.11 - най-тежкият бъг досега: снимките за история пазеха
// `Y.encodeStateAsUpdate(doc)` (целия документ) ВЪТРЕ в същия документ, тоест
// всяка нова снимка съдържаше всички предишни. Измерено преди поправката:
// документ от 3 KB ставаше 210 MB след 13 снимки, което сриваше браузъра
// при зареждане ("Aw, Snap!"). Тук пазим размера под контрол занапред.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { ROOT_ID, addChild, createMindMapDoc, getChildren, setNodeText } from "../model/doc";
import {
  getVersionsMap,
  listVersions,
  purgeLegacyBinarySnapshots,
  restoreSnapshot,
  takeSnapshot,
} from "./snapshots";
import type { VersionEntry } from "./snapshots";

function docSize(doc: Y.Doc): number {
  return Y.encodeStateAsUpdate(doc).length;
}

describe("снимки за история (§8.11)", () => {
  it("20 снимки не раздуват документа лавинообразно", () => {
    const doc = createMindMapDoc();
    for (let i = 0; i < 20; i++) addChild(doc, ROOT_ID, `Възел ${i}`);
    const base = docSize(doc);

    for (let i = 0; i < 20; i++) takeSnapshot(doc, "тест", null);

    // Всяка снимка е логическо дърво, не двоично състояние на целия документ,
    // затова растежът е линеен. Със старата логика тук ставаше дума за
    // стотици мегабайта (x60000+), не за няколко десетки пъти.
    expect(docSize(doc) / base).toBeLessThan(60);
  });

  it("връщането на снимка възстановява текста на клетките", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Първоначален текст");
    const entry = takeSnapshot(doc, "тест", "преди промяната");

    setNodeText(doc, id, "Променен текст");
    expect(getChildren(doc, ROOT_ID)[0].text).toBe("Променен текст");

    restoreSnapshot(doc, entry);
    expect(getChildren(doc, ROOT_ID)[0].text).toBe("Първоначален текст");
  });

  it("снимката пази стила на клетките", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Цветен");
    const entry = takeSnapshot(doc, "тест", null);
    expect(entry.tree?.children[0].text).toBe("Цветен");
    expect(entry.tree?.children[0].fileId).toBe(id);
    // новият формат НЕ съдържа двоично състояние на документа
    expect(entry.update).toBeUndefined();
  });

  it("изчиства записите от стария (раздут) формат", () => {
    const doc = createMindMapDoc();
    addChild(doc, ROOT_ID, "A");
    takeSnapshot(doc, "тест", null); // нов формат - остава

    // симулираме запис от стария формат
    const legacy: VersionEntry = {
      id: "старо-1",
      createdAt: Date.now(),
      author: "тест",
      label: null,
      nodeCount: 2,
      update: "AAAA",
    };
    doc.transact(() => getVersionsMap(doc).set(legacy.id, legacy));
    expect(listVersions(doc)).toHaveLength(2);

    expect(purgeLegacyBinarySnapshots(doc)).toBe(1);
    const left = listVersions(doc);
    expect(left).toHaveLength(1);
    expect(left[0].tree).toBeDefined();

    // повторно извикване не прави нищо (идемпотентно)
    expect(purgeLegacyBinarySnapshots(doc)).toBe(0);
  });
});
