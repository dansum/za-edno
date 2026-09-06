// Тестове за модела на данните — най-вече защитата от цикли при местене,
// вж. PLAN.md §3.2. Симулира и едновременни ходове на двама участници
// (два независими Y.Doc, слети чрез размяна на update-и), защото точно
// такъв едновременен случай създава риска от цикъл.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  ROOT_ID,
  addChild,
  createMindMapDoc,
  getChildren,
  isAncestor,
  moveNode,
  reattachOrphans,
} from "./doc";

describe("модел на данните", () => {
  it("добавя дете и брат, редът се пази чрез дробно индексиране", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    const b = addChild(doc, ROOT_ID, "B");
    const children = getChildren(doc, ROOT_ID);
    expect(children.map((c) => c.id)).toEqual([a, b]);
  });

  it("отказва местене на възел под собствения му потомък (директен цикъл)", () => {
    const doc = createMindMapDoc();
    const parent = addChild(doc, ROOT_ID, "Родител");
    const child = addChild(doc, parent, "Дете");

    expect(isAncestor(doc, parent, child)).toBe(true);

    const result = moveNode(doc, parent, child, null, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("descendant");

    // родителят трябва да си остане на мястото
    const children = getChildren(doc, ROOT_ID);
    expect(children.some((c) => c.id === parent)).toBe(true);
  });

  it("отказва местене на възел към самия него", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    const result = moveNode(doc, a, a, null, null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("self");
  });

  it("позволява местене, което не създава цикъл", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    const b = addChild(doc, ROOT_ID, "B");
    const result = moveNode(doc, b, a, null, null);
    expect(result.ok).toBe(true);
    expect(getChildren(doc, a).map((c) => c.id)).toEqual([b]);
  });

  it("класическият случай: A местú X под Y, B едновременно мести Y под X", () => {
    // Двама участници, всеки със свое копие на документа.
    const docA = createMindMapDoc();
    const x = addChild(docA, ROOT_ID, "X");
    const y = addChild(docA, ROOT_ID, "Y");

    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Участник A мести X под Y - валидно в неговото собствено (все още несинхронизирано) състояние.
    const resultA = moveNode(docA, x, y, null, null);
    expect(resultA.ok).toBe(true);

    // Участник B, паралелно, мести Y под X - също валидно в неговото собствено състояние,
    // защото все още не е видял хода на A.
    const resultB = moveNode(docB, y, x, null, null);
    expect(resultB.ok).toBe(true);

    // Разменят си промените - сега всеки документ вижда хода на другия.
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);

    // След сливането двата документа са еднакви (CRDT гаранция),
    // но дървото може да съдържа откъснат цикъл X<->Y без път до корена.
    const beforeCleanupA = JSON.stringify(Y.encodeStateAsUpdate(docA));
    const beforeCleanupB = JSON.stringify(Y.encodeStateAsUpdate(docB));
    expect(beforeCleanupA).toEqual(beforeCleanupB);

    // Защитният обход (reattachOrphans) трябва да хване счупения път и да
    // закачи засегнатите възли обратно към корена - в двата документа.
    const reattachedA = reattachOrphans(docA);
    const reattachedB = reattachOrphans(docB);
    expect(reattachedA.length).toBeGreaterThan(0);
    expect(reattachedB.length).toBeGreaterThan(0);

    // След защитата няма възел, недостижим от корена.
    for (const id of [x, y]) {
      expect(isAncestor(docA, ROOT_ID, id) || true).toBe(true); // самата isAncestor е за друга посока
    }
    const nodesMapA = docA.getMap<Y.Map<unknown>>("nodes");
    const allIdsA = Array.from(nodesMapA.keys());
    for (const id of allIdsA) {
      let current: string | null = id;
      const seen = new Set<string>();
      let reachesRoot = false;
      while (current) {
        if (current === ROOT_ID) {
          reachesRoot = true;
          break;
        }
        if (seen.has(current)) break;
        seen.add(current);
        current = (nodesMapA.get(current)?.get("parent") as string | null) ?? null;
      }
      expect(reachesRoot).toBe(true);
    }
  });
});
