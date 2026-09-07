// Преводи на интерфейса. Български по подразбиране, английски по избор.
// Нарочно без библиотека: речникът е малък и остава четим.

export type Language = "bg" | "en";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "bg", label: "Български" },
  { code: "en", label: "English" },
];

const bg = {
  appName: "Заедност",
  appTagline: "съвместни мисловни карти",

  // лента с действия
  copyLink: "Копирай линк за споделяне",
  copyLinkDone: "Линкът е копиран",
  history: "История",
  file: "Файл",
  search: "Търсене",
  help: "Помощ",
  language: "Език",

  // състояние на връзката
  statusConnected: "Свързан",
  statusConnecting: "Свързване…",
  statusDisconnected: "Извън връзка (работи се локално)",

  // платно
  loading: "Зареждане…",
  centralTopic: "Централна тема",
  emptyNode: "(без текст)",
  collapse: "Сгъни",
  expand: "Разгъни",
  newMapTitle: "Нова карта",

  // клавиши
  shortcutsHint:
    "Enter — нов брат · Tab/Insert — ново дете · F2 — редакция · Delete — изтрий · Space — сгъни/разгъни · Ctrl+Z/Ctrl+Y — отмени/повтори · Ctrl+B/Ctrl+I — удебелено/наклонено · Alt+R — червен текст",

  // търсене
  searchPlaceholder: "Търсене във възлите…",
  searchNoResults: "Няма съвпадения",
  searchResults: (current: number, total: number) => `${current} от ${total}`,
  searchNext: "Следващо (Enter)",
  searchPrev: "Предишно (Shift+Enter)",
  searchClose: "Затвори търсенето (Esc)",
  searchDimOthers: "Скрий несъвпадащите",

  // история
  historyTitle: "История на промените",
  historyClose: "Затвори",
  historySavePlaceholder: "Име на версията (напр. „преди срещата“)",
  historySave: "Запази текущото състояние",
  historyEmpty: "Все още няма запазени версии.",
  historyAuto: "Автоматична снимка",
  historyName: "Именувай",
  historyRestore: "Възстанови",
  historyNamePrompt: "Име на версията:",
  historyRestoreConfirm: "Възстановяване към тази версия. Продължава ли?",
  historyNodes: (n: number) => `${n} възела`,

  // файл
  exportFreeMind: "Изнеси като FreeMind (.mm)",
  exportMarkdown: "Изнеси като Markdown",
  exportOpml: "Изнеси като OPML",
  importFile: "Внеси файл .mm…",
  importConfirm: (title: string, count: number) =>
    `Внасяне на „${title}“ (${count} възела).\n\nВнимание: това ЗАМЕНЯ текущата карта за всички участници в стаята. Да продължим ли?`,
  importFailed: "Файлът не можа да бъде прочетен.",

  // помощ
  helpTitle: "Кратко ръководство",
  helpClose: "Затвори",
  helpIntroTitle: "Как се работи",
  helpIntro:
    "Всеки, който отвори линка, редактира заедно с вас в реално време. Промените се пазят автоматично.",
  helpKeysTitle: "Клавиши",
  helpSharingTitle: "Споделяне",
  helpSharing:
    "Копирайте линка от лентата горе и го изпратете. Всеки с линка може да редактира картата.",
  helpDataTitle: "Къде се пазят данните",
  helpData:
    "Картата се пази при доставчика на услугата (Liveblocks) и в браузъра ви. Не въвеждайте лични данни на ученици.",

  keyEnter: "нов възел на същото ниво",
  keyTab: "нов подчинен възел",
  keyF2: "редакция на текста",
  keyDelete: "изтриване на възела и подчинените му",
  keySpace: "сгъване и разгъване",
  keyArrows: "движение между възлите",
  keyUndo: "отмяна на собствената промяна",
  keyRedo: "повторение",
  keySearch: "търсене",
  keyZoom: "мащабиране",
  keyDrag: "влачене на възел с мишката го премества",
  keyBold: "удебелен текст",
  keyItalic: "наклонен текст",
  keyRedText: "червен текст (превключвател)",
  keyIcon: "добавя/маха иконата",

  // лента за форматиране
  toolbarBold: "Удебелено (Ctrl+B)",
  toolbarItalic: "Наклонено (Ctrl+I)",
  toolbarUndo: "Отмени (Ctrl+Z)",
  toolbarRedo: "Повтори (Ctrl+Y)",
  toolbarTextColor: "Цвят на текста",
  toolbarBackgroundColor: "Цвят на фона",
  toolbarDefault: "По подразбиране",
  toolbarIcons: "Икони",
  toolbarCustomColor: "Друг цвят…",

  // достъпност
  a11yNode: (text: string) => `Възел: ${text}`,
  a11yCanvas: "Мисловна карта",
  a11ySelected: "избран",
  a11yParticipants: "Участници",
};

type Dictionary = typeof bg;

const en: Dictionary = {
  appName: "Za-edno",
  appTagline: "collaborative mind maps",

  copyLink: "Copy sharing link",
  copyLinkDone: "Link copied",
  history: "History",
  file: "File",
  search: "Search",
  help: "Help",
  language: "Language",

  statusConnected: "Connected",
  statusConnecting: "Connecting…",
  statusDisconnected: "Offline (working locally)",

  loading: "Loading…",
  centralTopic: "Central topic",
  emptyNode: "(empty)",
  collapse: "Collapse",
  expand: "Expand",
  newMapTitle: "New map",

  shortcutsHint:
    "Enter — new sibling · Tab/Insert — new child · F2 — edit · Delete — remove · Space — collapse/expand · Ctrl+Z/Ctrl+Y — undo/redo · Ctrl+B/Ctrl+I — bold/italic · Alt+R — red text",

  searchPlaceholder: "Search nodes…",
  searchNoResults: "No matches",
  searchResults: (current: number, total: number) => `${current} of ${total}`,
  searchNext: "Next (Enter)",
  searchPrev: "Previous (Shift+Enter)",
  searchClose: "Close search (Esc)",
  searchDimOthers: "Dim non-matching",

  historyTitle: "Change history",
  historyClose: "Close",
  historySavePlaceholder: "Version name (e.g. “before the meeting”)",
  historySave: "Save current state",
  historyEmpty: "No saved versions yet.",
  historyAuto: "Automatic snapshot",
  historyName: "Name it",
  historyRestore: "Restore",
  historyNamePrompt: "Version name:",
  historyRestoreConfirm: "Restore to this version. Continue?",
  historyNodes: (n: number) => `${n} nodes`,

  exportFreeMind: "Export as FreeMind (.mm)",
  exportMarkdown: "Export as Markdown",
  exportOpml: "Export as OPML",
  importFile: "Import .mm file…",
  importConfirm: (title: string, count: number) =>
    `Import “${title}” (${count} nodes).\n\nWarning: this REPLACES the current map for everyone in the room. Continue?`,
  importFailed: "The file could not be read.",

  helpTitle: "Quick guide",
  helpClose: "Close",
  helpIntroTitle: "How it works",
  helpIntro:
    "Anyone who opens the link edits with you in real time. Changes are saved automatically.",
  helpKeysTitle: "Keyboard",
  helpSharingTitle: "Sharing",
  helpSharing: "Copy the link from the top bar and send it. Anyone with the link can edit the map.",
  helpDataTitle: "Where the data lives",
  helpData:
    "The map is stored with the service provider (Liveblocks) and in your browser. Do not enter students’ personal data.",

  keyEnter: "new node at the same level",
  keyTab: "new child node",
  keyF2: "edit the text",
  keyDelete: "delete the node and its children",
  keySpace: "collapse and expand",
  keyArrows: "move between nodes",
  keyUndo: "undo your own change",
  keyRedo: "redo",
  keySearch: "search",
  keyZoom: "zoom",
  keyDrag: "drag a node with the mouse to move it",
  keyBold: "bold text",
  keyItalic: "italic text",
  keyRedText: "red text (toggle)",
  keyIcon: "add/remove the icon",

  toolbarBold: "Bold (Ctrl+B)",
  toolbarItalic: "Italic (Ctrl+I)",
  toolbarUndo: "Undo (Ctrl+Z)",
  toolbarRedo: "Redo (Ctrl+Y)",
  toolbarTextColor: "Text color",
  toolbarBackgroundColor: "Background color",
  toolbarDefault: "Default",
  toolbarIcons: "Icons",
  toolbarCustomColor: "Custom color…",

  a11yNode: (text: string) => `Node: ${text}`,
  a11yCanvas: "Mind map",
  a11ySelected: "selected",
  a11yParticipants: "Participants",
};

export const dictionaries: Record<Language, Dictionary> = { bg, en };
export type { Dictionary };
