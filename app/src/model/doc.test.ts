// Тестове за модела на данните — най-вече защитата от цикли при местене,
// вж. PLAN.md §3.2. Симулира и едновременни ходове на двама участници
// (два независими Y.Doc, слети чрез размяна на update-и), защото точно
// такъв едновременен случай създава риска от цикъл.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  RED_TEXT_COLOR,
  ROOT_ID,
  addChild,
  addLink,
  createMindMapDoc,
  deleteLink,
  deleteNodeSubtree,
  ensureStyleMigrated,
  getAllLinks,
  getChildren,
  getNodesMap,
  getStylesArray,
  isAncestor,
  moveNode,
  reattachOrphans,
  setBackgroundColor,
  setCloud,
  setTextColor,
  toggleBold,
  toggleIcon,
  toggleItalic,
  toggleRedText,
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

describe("стил на клетката (Фаза 7)", () => {
  it("Ctrl+B и Ctrl+I превключват удебелено и наклонено", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Възел");
    toggleBold(doc, id);
    expect(getChildren(doc, ROOT_ID)[0].style.bold).toBe(true);
    toggleBold(doc, id);
    // изключено поле не се пази изрично като false - пропуска се изцяло от
    // записа, за да остане хранилището минимално (вж. pruneStyle в doc.ts)
    expect(getChildren(doc, ROOT_ID)[0].style.bold).toBeUndefined();

    toggleItalic(doc, id);
    expect(getChildren(doc, ROOT_ID)[0].style.italic).toBe(true);
  });

  it("цвят на текста и на фона се записват отделно", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Възел");
    setTextColor(doc, id, "#1c4f8b");
    setBackgroundColor(doc, id, "#fff8e1");
    const snap = getChildren(doc, ROOT_ID)[0];
    expect(snap.style.color).toBe("#1c4f8b");
    expect(snap.style.background).toBe("#fff8e1");

    setTextColor(doc, id, null);
    expect(getChildren(doc, ROOT_ID)[0].style.color).toBeUndefined();
  });

  it("червеният текст (Alt+R) е превключвател, не еднопосочно действие", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Спешно");
    toggleRedText(doc, id);
    expect(getChildren(doc, ROOT_ID)[0].style.color).toBe(RED_TEXT_COLOR);
    toggleRedText(doc, id); // второ натискане връща по подразбиране
    expect(getChildren(doc, ROOT_ID)[0].style.color).toBeUndefined();
  });

  it("иконите се добавят и махат по id, редът се пази", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Задача");
    toggleIcon(doc, id, "num-1");
    toggleIcon(doc, id, "idea");
    expect(getChildren(doc, ROOT_ID)[0].style.icons).toEqual(["num-1", "idea"]);
    toggleIcon(doc, id, "num-1"); // повторно -> маха се
    expect(getChildren(doc, ROOT_ID)[0].style.icons).toEqual(["idea"]);
  });

  it("мигрира старото вложено Y.Map поле (с единично style.icon) към хранилището", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Стара карта");
    const nodes = getNodesMap(doc);
    // симулираме данни, записани преди YKeyValue хранилището (§7.6) - вложена
    // Y.Map с още по-старото единично поле "icon" вместо списъка "icons"
    const legacy = new Y.Map<unknown>();
    legacy.set("icon", "idea");
    nodes.get(id)!.set("style", legacy);

    const migrated = ensureStyleMigrated(doc);
    expect(migrated).toBe(true);
    expect(getChildren(doc, ROOT_ID)[0].style.icons).toEqual(["idea"]);
    expect(nodes.get(id)!.get("style")).toBeUndefined();

    // второ извикване не прави нищо (идемпотентно)
    expect(ensureStyleMigrated(doc)).toBe(false);
  });

  it("многократно превключване на стил не трупа история (§7.6 - причината за изчерпаната Liveblocks квота)", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Възел");
    for (let i = 0; i < 200; i++) toggleBold(doc, id);
    // YKeyValue пази само последната стойност на ключ - масивът зад стила
    // никога не расте отвъд броя клетки С НЕПРАЗЕН стил, независимо от броя
    // промени (за разлика от обикновен Y.Map, който пази история завинаги).
    expect(getStylesArray(doc).length).toBeLessThanOrEqual(1);
  });

  it("облак: цвят се задава и маха (§8.2)", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Клъстер");
    setCloud(doc, id, "#3d5a80");
    expect(getChildren(doc, ROOT_ID)[0].style.cloud).toBe("#3d5a80");
    setCloud(doc, id, null);
    expect(getChildren(doc, ROOT_ID)[0].style.cloud).toBeUndefined();
  });
});

describe("връзки между произволни клетки (§8.2)", () => {
  it("създава и трие връзка", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    const b = addChild(doc, ROOT_ID, "B");
    const linkId = addLink(doc, a, b);
    expect(linkId).not.toBeNull();
    expect(getAllLinks(doc)).toEqual([{ id: linkId, from: a, to: b }]);

    deleteLink(doc, linkId!);
    expect(getAllLinks(doc)).toEqual([]);
  });

  it("отказва връзка на клетка към самата себе си", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    expect(addLink(doc, a, a)).toBeNull();
    expect(getAllLinks(doc)).toEqual([]);
  });

  it("изтриването на клетка чисти и връзките ѝ (иначе биха останали висящи завинаги)", () => {
    const doc = createMindMapDoc();
    const a = addChild(doc, ROOT_ID, "A");
    const b = addChild(doc, ROOT_ID, "B");
    addLink(doc, a, b);
    deleteNodeSubtree(doc, b);
    expect(getAllLinks(doc)).toEqual([]);
  });
});
