// Тестове за копиране/поставяне на клетки - вж. PLAN.md §8.20.
import { describe, expect, it } from "vitest";
import {
  ROOT_ID,
  addChild,
  addLink,
  createMindMapDoc,
  getAllLinks,
  getAllSnapshots,
  getChildren,
  setTextColor,
  toggleBold,
  toggleIcon,
} from "../model/doc";
import {
  insertPlainTrees,
  parseIndentedText,
  sanitizeTrees,
  subtreesToPlain,
  toHtmlList,
  toIndentedText,
  topLevelSelection,
} from "./mapClipboard";

function sample() {
  const doc = createMindMapDoc();
  const a = addChild(doc, ROOT_ID, "А");
  const a1 = addChild(doc, a, "А1");
  const a2 = addChild(doc, a1, "А2");
  const b = addChild(doc, ROOT_ID, "Б");
  return { doc, a, a1, a2, b };
}

describe("копиране и поставяне на клетки (§8.20)", () => {
  it("избор от клетка и неин наследник копира само горната, в реда на дървото", () => {
    const { doc, a, a2, b } = sample();
    expect(topLevelSelection(doc, [b, a2, a])).toEqual([a, b]);
  });

  it("текстът за други програми е списък с отместване, по клетка на ред", () => {
    const { doc, a, b } = sample();
    const trees = subtreesToPlain(doc, [a, b]);
    expect(toIndentedText(trees)).toBe("А\n\tА1\n\t\tА2\nБ");
    expect(toHtmlList(trees)).toBe("<ul><li>А<ul><li>А1<ul><li>А2</li></ul></li></ul></li><li>Б</li></ul>");
  });

  it("поставянето пази стила и поддървото, с нови id-та", () => {
    const { doc, a, a1, b } = sample();
    toggleBold(doc, a1);
    setTextColor(doc, a1, "#c0392b");
    toggleIcon(doc, a1, "idea");
    const trees = sanitizeTrees(JSON.parse(JSON.stringify(subtreesToPlain(doc, [a]))));

    const [copy] = insertPlainTrees(doc, b, trees);
    expect(copy).not.toBe(a);
    const snaps = getAllSnapshots(doc);
    expect(snaps[copy].text).toBe("А");
    expect(snaps[copy].parent).toBe(b);
    const [copiedA1] = getChildren(doc, copy);
    expect(copiedA1.text).toBe("А1");
    expect(copiedA1.id).not.toBe(a1);
    expect(copiedA1.style).toEqual({ bold: true, color: "#c0392b", icons: ["idea"] });
    expect(getChildren(doc, copiedA1.id).map((c) => c.text)).toEqual(["А2"]);
  });

  it("стрелка между копирани клетки се пренася, стрелка навън - не", () => {
    const { doc, a, a1, a2, b } = sample();
    addLink(doc, a1, a2); // вътре в копираното
    addLink(doc, a1, b); // към клетка извън копираното
    const before = getAllLinks(doc).length;

    const [copy] = insertPlainTrees(doc, ROOT_ID, subtreesToPlain(doc, [a]));
    const copiedA1 = getChildren(doc, copy)[0].id;
    const copiedA2 = getChildren(doc, copiedA1)[0].id;
    const links = getAllLinks(doc);
    expect(links.length).toBe(before + 1);
    expect(links.some((l) => l.from === copiedA1 && l.to === copiedA2)).toBe(true);
  });

  it("текст отвън става клетки по отместването му", () => {
    const trees = parseIndentedText("Цели\n\t- първа\n\t- втора\n        подточка\n\nСрок");
    expect(trees.map((t) => t.text)).toEqual(["Цели", "Срок"]);
    expect(trees[0].children.map((t) => t.text)).toEqual(["първа", "втора"]);
    expect(trees[0].children[1].children.map((t) => t.text)).toEqual(["подточка"]);
  });

  it("чуждите данни в клипборда се изчистват от неочаквани полета и опасни линкове", () => {
    const trees = sanitizeTrees([
      {
        text: "x",
        style: { color: "red; background: url(evil)", link: "javascript:alert(1)", icons: ["idea", "nope"], bold: "yes" },
        children: "не е масив",
        extra: 1,
      },
      42,
    ]);
    expect(trees).toEqual([
      { text: "x", note: undefined, collapsed: undefined, style: { icons: ["idea"] }, fileId: undefined, arrowlinks: undefined, children: [] },
    ]);
  });
});
