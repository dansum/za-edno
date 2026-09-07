// Тестове за внос/износ на FreeMind — вж. PLAN.md Фаза 4.
import { describe, expect, it } from "vitest";
import {
  ROOT_ID,
  addChild,
  createMindMapDoc,
  getChildren,
  setBackgroundColor,
  setNodeText,
  setTextColor,
  toggleBold,
  toggleIcon,
  toggleItalic,
} from "../model/doc";
import {
  exportToFreeMind,
  exportToMarkdown,
  parseFreeMind,
  replaceDocWithTree,
} from "./freemind";

const SAMPLE_MM = `<map version="1.0.1">
  <node TEXT="Проект">
    <node TEXT="Задачи" POSITION="right">
      <node TEXT="Първа"/>
      <node TEXT="Втора"/>
    </node>
    <node TEXT="Бележки" POSITION="left" FOLDED="true"/>
  </node>
</map>`;

describe("внос от FreeMind", () => {
  it("разчита дървото със страни и сгънати възли", () => {
    const tree = parseFreeMind(SAMPLE_MM);
    expect(tree.text).toBe("Проект");
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].text).toBe("Задачи");
    expect(tree.children[0].side).toBe("right");
    expect(tree.children[0].children.map((c) => c.text)).toEqual(["Първа", "Втора"]);
    expect(tree.children[1].side).toBe("left");
    expect(tree.children[1].collapsed).toBe(true);
  });

  it("отказва повреден файл с ясно съобщение", () => {
    expect(() => parseFreeMind("<map><node TEXT='без затваряне'>")).toThrow();
    expect(() => parseFreeMind("<map></map>")).toThrow(/коренен/);
  });

  it("записва внесеното дърво в документа и заменя старото съдържание", () => {
    const doc = createMindMapDoc();
    addChild(doc, ROOT_ID, "Старо съдържание");

    replaceDocWithTree(doc, parseFreeMind(SAMPLE_MM));

    const children = getChildren(doc, ROOT_ID);
    expect(children.map((c) => c.text)).toEqual(["Задачи", "Бележки"]);
    expect(children.every((c) => c.text !== "Старо съдържание")).toBe(true);

    const tasks = children[0];
    expect(getChildren(doc, tasks.id).map((c) => c.text)).toEqual(["Първа", "Втора"]);
    expect(children[1].collapsed).toBe(true);
  });
});

describe("износ", () => {
  it("обратим цикъл: внос -> износ -> внос дава същото дърво", () => {
    const doc = createMindMapDoc();
    replaceDocWithTree(doc, parseFreeMind(SAMPLE_MM));

    const exported = exportToFreeMind(doc);
    const reparsed = parseFreeMind(exported);

    expect(reparsed.text).toBe("Проект");
    expect(reparsed.children.map((c) => c.text)).toEqual(["Задачи", "Бележки"]);
    expect(reparsed.children[0].children.map((c) => c.text)).toEqual(["Първа", "Втора"]);
    expect(reparsed.children[1].collapsed).toBe(true);
  });

  it("екранира знаци, които биха счупили XML", () => {
    const doc = createMindMapDoc();
    setNodeText(doc, ROOT_ID, 'Кавички "и" <тагове> & амперсанд');
    const xml = exportToFreeMind(doc);
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
    // и остава разчитаемо
    expect(parseFreeMind(xml).text).toBe('Кавички "и" <тагове> & амперсанд');
  });

  it("Markdown износът пази нивата с отстъп", () => {
    const doc = createMindMapDoc();
    replaceDocWithTree(doc, parseFreeMind(SAMPLE_MM));
    const md = exportToMarkdown(doc);
    expect(md).toContain("# Проект");
    expect(md).toContain("- Задачи");
    expect(md).toContain("  - Първа");
  });

  it("пренася удебелен/наклонен текст, цветове и икони (Фаза 7)", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Важна задача");
    toggleBold(doc, id);
    toggleItalic(doc, id);
    setTextColor(doc, id, "#c0392b");
    setBackgroundColor(doc, id, "#fff8e1");
    toggleIcon(doc, id, "num-1");
    toggleIcon(doc, id, "idea");

    const xml = exportToFreeMind(doc);
    expect(xml).toContain('COLOR="#c0392b"');
    expect(xml).toContain('BACKGROUND_COLOR="#fff8e1"');
    expect(xml).toContain('BOLD="true"');
    expect(xml).toContain('ITALIC="true"');
    expect(xml).toContain('BUILTIN="full-1"');
    expect(xml).toContain('BUILTIN="idea"');

    const reimported = parseFreeMind(xml);
    const node = reimported.children[0];
    expect(node.style?.bold).toBe(true);
    expect(node.style?.italic).toBe(true);
    expect(node.style?.color).toBe("#c0392b");
    expect(node.style?.background).toBe("#fff8e1");
    expect(node.style?.icons).toEqual(["num-1", "idea"]);
  });

  it("обратим цикъл: стилът оцелява внос -> износ -> внос -> износ", () => {
    const doc = createMindMapDoc();
    const id = addChild(doc, ROOT_ID, "Възел");
    toggleBold(doc, id);
    setTextColor(doc, id, "#1c4f8b");
    toggleIcon(doc, id, "star");

    const firstExport = exportToFreeMind(doc);
    const doc2 = createMindMapDoc();
    replaceDocWithTree(doc2, parseFreeMind(firstExport));
    const secondExport = exportToFreeMind(doc2);

    expect(secondExport).toBe(firstExport);
  });
});
