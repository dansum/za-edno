// Готови шаблони за нова карта (§8.17) - обикновени дървета, същият формат,
// който ползва вносът от FreeMind (importExport/freemind.ts, PlainNode).

import type { PlainNode } from "./importExport/freemind";

function node(text: string, children: PlainNode[] = []): PlainNode {
  return { text, children };
}

export interface Template {
  key: string;
  labelKey: "templateMathLesson" | "templateBrainstorm" | "templateTechPlan";
  tree: PlainNode;
}

export const TEMPLATES: Template[] = [
  {
    key: "math-lesson",
    labelKey: "templateMathLesson",
    tree: node("Урок по математика: [тема]", [
      node("Цели на урока"),
      node("Въведение / затопляне"),
      node("Основна част", [node("Обяснение"), node("Примери"), node("Упражнения")]),
      node("Затвърждаване"),
      node("Домашна работа"),
      node("Оценяване"),
    ]),
  },
  {
    key: "brainstorm",
    labelKey: "templateBrainstorm",
    tree: node("Тема на брейнсторминга", [
      node("Идея 1"),
      node("Идея 2"),
      node("Идея 3"),
      node("Въпроси за изясняване"),
      node("Следващи стъпки"),
    ]),
  },
  {
    key: "tech-plan",
    labelKey: "templateTechPlan",
    tree: node("Стратегически план: внедряване на [технология]", [
      node("Цели"),
      node("Текущо състояние"),
      node("Заинтересовани страни"),
      node("Стъпки за внедряване", [node("Пилотна фаза"), node("Обучение"), node("Пълно внедряване")]),
      node("Рискове"),
      node("Оценка на успеха"),
    ]),
  },
];
