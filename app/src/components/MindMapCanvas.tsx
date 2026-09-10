import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import {
  ROOT_ID,
  addChild,
  addLink,
  addSiblingAfter,
  deleteLink,
  deleteNodeSubtree,
  duplicateSubtree,
  getChildren,
  isSafeLinkUrl,
  moveNode,
  setBackgroundColor,
  setNodeSide,
  setNodeText,
  setTextColor,
  toggleBold,
  toggleCollapsed,
  toggleIcon,
  toggleItalic,
  toggleRedText,
} from "../model/doc";
import type { LinkInfo, NodeSnapshot } from "../model/doc";
import { computeLayout } from "../layout/treeLayout";
import type { LayoutNode } from "../layout/treeLayout";
import { computeClouds, computeLinkPaths } from "../layout/overlays";
import { BACKGROUND_COLOR_PALETTE, TEXT_COLOR_PALETTE } from "../model/color";
import { dropZoneAt } from "../layout/dropZone";
import type { DropZone } from "../layout/dropZone";
import type { PresenceUser } from "./PresenceBar";
import type { SearchState } from "./SearchBar";
import { useT } from "../i18n/useLanguage";
import { readableTextColorFor } from "../model/color";
import { ICON_CATALOG, iconIdForDigitCode } from "../model/icons";
import { FormatToolbar } from "./FormatToolbar";
import { useUndoRedoState } from "../hooks/useUndo";
import { PAN_STEP_PX } from "../panStep";
import { notify } from "../toast";

const LOCAL_ORIGIN = Symbol("local-edit");
export { LOCAL_ORIGIN };

export interface CanvasHandle {
  focusNode: (nodeId: string) => void;
  /** Отмества изгледа с (dxPx, dyPx) екранни пиксела - за менюто "Изглед" (§8.8). */
  panBy: (dxPx: number, dyPx: number) => void;
}

interface Props {
  doc: Y.Doc;
  nodes: Record<string, NodeSnapshot>;
  links: LinkInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  presence: PresenceUser[];
  undoManager: Y.UndoManager;
  search: SearchState;
  onRequestSearch: () => void;
  canvasRef?: React.MutableRefObject<CanvasHandle | null>;
}

export function MindMapCanvas({
  doc,
  nodes,
  links,
  selectedId,
  onSelect,
  presence,
  undoManager,
  search,
  onRequestSearch,
  canvasRef,
}: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone>("child");
  const [multiColorPicker, setMultiColorPicker] = useState<"text" | "background" | null>(null);
  // Режим "свързване" (§8.2): въоръжен от бутона 🔗 в лентата за форматиране;
  // следващият кликнат възел довършва стрелката от `linkingFrom` към него.
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  // Вярно след щракане на празно място по платното (§8.14) - докато е така,
  // стрелките местят изгледа, вместо да навигират между възлите. Изчиства се
  // при истинска смяна на избрания възел (клик върху възел, търсене, навигация).
  const [canvasFocused, setCanvasFocused] = useState(false);
  useEffect(() => setCanvasFocused(false), [selectedId]);
  // Множествен избор (§8.21): Ctrl/Cmd/Shift+клик добавя/маха възел от
  // множеството - ДОПЪЛНИТЕЛНО към обикновения (единичен) избор `selectedId`,
  // който продължава да определя коя клетка виждат лентата за форматиране и
  // редакцията. Обикновен клик изчиства множеството.
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  // Пълното множество, върху което действат групови действия (изтрий/
  // премести/оцвети) - винаги включва и текущо избраната клетка.
  const effectiveSelection = useMemo(() => {
    const s = new Set(multiSelected);
    s.add(selectedId);
    return s;
  }, [multiSelected, selectedId]);

  const matchSet = useMemo(() => new Set(search.matches), [search.matches]);

  const root = nodes[ROOT_ID];
  const layout = useMemo(() => (root ? computeLayout(doc, root) : null), [doc, root, nodes]);

  // „Облак" и връзки/стрелки (§8.2) - геометрията е споделена с износа като
  // изображение (importExport/imageExport.ts), вж. layout/overlays.ts.
  const clouds = useMemo(() => (layout ? computeClouds(nodes, layout) : []), [nodes, layout]);
  const linkPaths = useMemo(() => (layout ? computeLinkPaths(links, layout) : []), [links, layout]);

  const selectionByNode = useMemo(() => {
    const map = new Map<string, PresenceUser[]>();
    for (const u of presence) {
      if (!u.selectedNodeId) continue;
      if (!map.has(u.selectedNodeId)) map.set(u.selectedNodeId, []);
      map.get(u.selectedNodeId)!.push(u);
    }
    return map;
  }, [presence]);

  // ---- центриране върху възел (ползва се от търсенето) ----
  const centerOnNode = useRef((nodeId: string) => {
    void nodeId;
  });
  centerOnNode.current = (nodeId: string) => {
    const target = layout?.nodes.find((n) => n.id === nodeId);
    const viewport = containerRef.current;
    if (!target || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    // .mindmap-canvas стои на 40% / 40% от прозореца - същото изместване се
    // приспада тук, за да излезе възелът в средата
    setPan({
      x: rect.width / 2 - rect.width * 0.4 - (target.x + target.width / 2) * zoom,
      y: rect.height / 2 - rect.height * 0.4 - (target.y + target.height / 2) * zoom,
    });
  };

  useEffect(() => {
    if (!canvasRef) return;
    canvasRef.current = {
      focusNode: (nodeId: string) => {
        onSelect(nodeId);
        centerOnNode.current(nodeId);
      },
      panBy: (dxPx, dyPx) => setPan((p) => ({ x: p.x + dxPx, y: p.y + dyPx })),
    };
  }, [canvasRef, onSelect]);

  // При първо зареждане центрираме корена. Без това картата увисва долу вдясно
  // на тесни екрани, защото платното стои на фиксирани 40% / 40%.
  const didCenter = useRef(false);
  useEffect(() => {
    if (didCenter.current || !layout) return;
    didCenter.current = true;
    centerOnNode.current(ROOT_ID);
  }, [layout]);

  // Автоматично превъртане до избрания възел, ако излезе извън видимата
  // част на платното (§8.10, като във FreeMind) - за разлика от "Центрирай"
  // (менюто "Изглед", §8.8), тук местим само толкова, колкото възелът да
  // влезе в изгледа, не непременно до средата (по-малко "скачащо").
  // Ключувано по selectedId, не по layout: инак всяка редакция другаде по
  // картата (която прекомпютва layout) би отместила изгледа отново, макар
  // изборът да не се е променил.
  const lastAutoPannedId = useRef<string | null>(null);
  useEffect(() => {
    if (lastAutoPannedId.current === selectedId) return;
    lastAutoPannedId.current = selectedId;
    const target = layout?.nodes.find((n) => n.id === selectedId);
    const viewport = containerRef.current;
    if (!target || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const MARGIN = 40;
    // същото изместване (40%/40%) като при "Центрирай" по-горе
    const screenX = rect.width * 0.4 + pan.x + target.x * zoom;
    const screenY = rect.height * 0.4 + pan.y + target.y * zoom;
    const screenRight = screenX + target.width * zoom;
    const screenBottom = screenY + target.height * zoom;

    let dx = 0;
    let dy = 0;
    if (screenX < MARGIN) dx = MARGIN - screenX;
    else if (screenRight > rect.width - MARGIN) dx = rect.width - MARGIN - screenRight;
    if (screenY < MARGIN) dy = MARGIN - screenY;
    else if (screenBottom > rect.height - MARGIN) dy = rect.height - MARGIN - screenBottom;

    if (dx !== 0 || dy !== 0) setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---- клавиатурни комбинации, като във FreeMind ----
  useEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && linkingFrom) {
        e.preventDefault();
        setLinkingFrom(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedLinkId && !editingId) {
        e.preventDefault();
        deleteLink(doc, selectedLinkId, LOCAL_ORIGIN);
        setSelectedLinkId(null);
        return;
      }
      // Щракане на празно място по платното (§8.14): стрелките местят изгледа
      // вместо да навигират между възлите - последно избраният възел остава
      // избран, но вече не е "фокусът" за клавиатурата.
      if (
        canvasFocused &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        if (e.key === "ArrowLeft") setPan((p) => ({ ...p, x: p.x + PAN_STEP_PX }));
        else if (e.key === "ArrowRight") setPan((p) => ({ ...p, x: p.x - PAN_STEP_PX }));
        else if (e.key === "ArrowUp") setPan((p) => ({ ...p, y: p.y + PAN_STEP_PX }));
        else setPan((p) => ({ ...p, y: p.y - PAN_STEP_PX }));
        return;
      }
      if (!selectedId) return;

      // Форматиращите комбинации (§7.1, §7.3-7.5) работят и по време на
      // редакция на текста - не вмъкват символи, затова не пречат на писането
      // и минават преди проверката "editingId", за разлика от навигацията.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyB") {
        e.preventDefault();
        toggleBold(doc, selectedId, LOCAL_ORIGIN);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyI") {
        e.preventDefault();
        toggleItalic(doc, selectedId, LOCAL_ORIGIN);
        return;
      }
      // Ctrl+Y (Windows/Linux) или Ctrl+Shift+Z (навсякъде) - и двете за повторение.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyY") {
        e.preventDefault();
        undoManager.redo();
        return;
      }
      // Червен текст: Alt+R на Windows/Linux, Ctrl+Shift+R (физически Ctrl, не Cmd)
      // на macOS - вж. PLAN.md §7.4 защо точно тези комбинации.
      const isRedShortcut = isMac
        ? e.ctrlKey && e.shiftKey && !e.metaKey && e.code === "KeyR"
        : e.altKey && !e.ctrlKey && e.code === "KeyR";
      if (isRedShortcut) {
        e.preventDefault();
        toggleRedText(doc, selectedId, LOCAL_ORIGIN);
        return;
      }
      // Икони: Ctrl+Shift+цифра и Ctrl+Shift+буква (§7.5).
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const digitIcon = iconIdForDigitCode(e.code);
        const letterIcon =
          e.code === "KeyA"
            ? "star"
            : e.code === "KeyE"
              ? "exclaim"
              : e.code === "KeyS"
                ? "stop"
                : e.code === "KeyD"
                  ? "idea"
                  : null;
        const iconId = digitIcon ?? letterIcon;
        if (iconId) {
          e.preventDefault();
          toggleIcon(doc, selectedId, iconId, LOCAL_ORIGIN);
          return;
        }
      }

      if (editingId) return; // докато се редактира текст, стрелките и Enter пишат в полето
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;

      if (e.key === "Enter") {
        e.preventDefault();
        addSiblingToSelected(selectedId);
      } else if (e.key === "Tab" || e.key === "Insert") {
        e.preventDefault();
        addChildToSelected(selectedId);
      } else if (e.key === "F2") {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Групово изтриване (§8.21), ако има повече от една избрана клетка.
        const targets = [...effectiveSelection].filter((id) => id !== ROOT_ID);
        if (targets.length > 1) {
          for (const id of targets) deleteNodeSubtree(doc, id, LOCAL_ORIGIN);
          setMultiSelected(new Set());
          onSelect(ROOT_ID);
        } else if (selectedId !== ROOT_ID) {
          deleteSelected(selectedId);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        toggleCollapsed(doc, selectedId, LOCAL_ORIGIN);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        // Ctrl+посока мести възела в дървото (§8.4), обикновена посока само избира.
        // При групов избор (§8.21) местим всяка избрана клетка поотделно,
        // всяка в своя собствен контекст (родител/страна).
        e.preventDefault();
        if (multiSelected.size > 0) {
          for (const id of effectiveSelection) moveInDirection(e.key, id);
        } else {
          moveInDirection(e.key, selectedId);
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        navigate(e.key);
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        // по code, а не по key: при българска подредба key дава кирилица
        e.preventDefault();
        if (e.shiftKey) undoManager.redo();
        else undoManager.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
        e.preventDefault(); // изместваме търсенето на браузъра
        onRequestSearch();
      }
    }

    /**
     * Ctrl+посока мести възела в дървото (§8.4), не само избора:
     * Ctrl+Нагоре/Надолу разменя реда му със съседен брат; Ctrl+Ляво/Дясно
     * го премества едно ниво навън (към братята на родителя си) или навътре
     * (като дете на съседен брат) - посоката е спрямо страната му, огледално
     * на обикновената навигация със стрелки по-долу.
     */
    function moveInDirection(key: string, nodeId: string) {
      if (nodeId === ROOT_ID) return;
      const current = nodes[nodeId];
      const parentId = current?.parent;
      if (!current || !parentId) return;

      if (key === "ArrowUp" || key === "ArrowDown") {
        const siblings = getChildren(doc, parentId);
        const idx = siblings.findIndex((s) => s.id === nodeId);
        const swapIdx = key === "ArrowUp" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= siblings.length) return;
        const beforeOrder = key === "ArrowUp" ? (siblings[swapIdx - 1]?.order ?? null) : siblings[swapIdx].order;
        const afterOrder = key === "ArrowUp" ? siblings[swapIdx].order : (siblings[swapIdx + 1]?.order ?? null);
        moveNode(doc, nodeId, parentId, beforeOrder, afterOrder, LOCAL_ORIGIN);
        return;
      }

      // "Към корена" зависи от страната, на която стои възелът - огледално
      // на обикновената навигация със стрелки. Взима се страната от
      // ОФОРМЛЕНИЕТО, не от модела: моделът пази страна само за преките деца
      // на корена, а по-навътре я наследяват при рисуването - без това
      // клетките в лявото поддърво се местеха в обратната посока.
      const isLeftSide = (layout?.nodes.find((n) => n.id === nodeId)?.side ?? current.side) === "left";
      const towardRoot = isLeftSide ? key === "ArrowRight" : key === "ArrowLeft";

      if (parentId === ROOT_ID) {
        // Първо ниво (§8.13): "към корена" го прехвърля ОТ ДРУГАТА СТРАНА на
        // корена - дотук това не правеше нищо. "Навън" го вкарва под съседен
        // брат, но само от СЪЩАТА страна: иначе лява клетка кацаше под
        // клетка отдясно, което на екрана изглежда като скок през корена.
        if (towardRoot) {
          setNodeSide(doc, nodeId, isLeftSide ? "right" : "left", LOCAL_ORIGIN);
          return;
        }
        const sameSide = getChildren(doc, ROOT_ID).filter((s) => (s.side === "left") === isLeftSide);
        const idx = sameSide.findIndex((s) => s.id === nodeId);
        const newParent = idx > 0 ? sameSide[idx - 1] : sameSide[idx + 1];
        if (newParent) moveNode(doc, nodeId, newParent.id, null, null, LOCAL_ORIGIN);
        return;
      }

      if (towardRoot) {
        // едно ниво навън: става брат на родителя си, веднага след него
        const parentNode = nodes[parentId];
        const grandParentId = parentNode?.parent;
        if (!grandParentId) return;
        const uncles = getChildren(doc, grandParentId);
        const parentIdx = uncles.findIndex((u) => u.id === parentId);
        moveNode(doc, nodeId, grandParentId, parentNode.order, uncles[parentIdx + 1]?.order ?? null, LOCAL_ORIGIN);
      } else {
        // едно ниво навътре: става дете на съседния брат (предишния, ако има)
        const siblings = getChildren(doc, parentId);
        const idx = siblings.findIndex((s) => s.id === nodeId);
        const newParent = idx > 0 ? siblings[idx - 1] : siblings[idx + 1];
        if (!newParent) return;
        moveNode(doc, nodeId, newParent.id, null, null, LOCAL_ORIGIN);
      }
    }

    function navigate(key: string) {
      if (!layout) return;
      const current = layout.nodes.find((n) => n.id === selectedId);
      if (!current) return;

      if (key === "ArrowRight" && current.side === null) {
        const child = layout.nodes.find((n) => n.parentId === ROOT_ID && n.side === "right");
        if (child) onSelect(child.id);
        return;
      }
      if (key === "ArrowLeft" && current.side === null) {
        const child = layout.nodes.find((n) => n.parentId === ROOT_ID && n.side === "left");
        if (child) onSelect(child.id);
        return;
      }
      if ((key === "ArrowRight" && current.side === "right") || (key === "ArrowLeft" && current.side === "left")) {
        const child = layout.nodes.find((n) => n.parentId === current.id);
        if (child) onSelect(child.id);
        return;
      }
      if ((key === "ArrowLeft" && current.side === "right") || (key === "ArrowRight" && current.side === "left")) {
        if (current.parentId) onSelect(current.parentId);
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const siblings = layout.nodes
          .filter((n) => n.parentId === current.parentId)
          .sort((a, b) => a.y - b.y);
        const idx = siblings.findIndex((n) => n.id === current.id);
        const nextIdx = key === "ArrowUp" ? idx - 1 : idx + 1;
        if (siblings[nextIdx]) onSelect(siblings[nextIdx].id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    doc,
    selectedId,
    editingId,
    layout,
    nodes,
    onSelect,
    undoManager,
    onRequestSearch,
    linkingFrom,
    selectedLinkId,
    canvasFocused,
    multiSelected,
    effectiveSelection,
  ]);

  // ---- панорама и мащаб на платното ----
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
    }
  }

  // Бутони за мащаб на екрана (§8.19) - Ctrl+колело работи, но не е очевидно
  // без да се спомене; тук е видимо и работи с тап на телефон.
  const ZOOM_STEP = 0.1;
  function zoomIn() {
    setZoom((z) => Math.min(2, +(z + ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    setZoom((z) => Math.max(0.3, +(z - ZOOM_STEP).toFixed(2)));
  }
  /** Смалява/уголемява и центрира така, че цялата карта да се вижда наведнъж. */
  function fitToScreen() {
    const viewport = containerRef.current;
    if (!viewport || !layout) return;
    const rect = viewport.getBoundingClientRect();
    const PAD = 60;
    const scale = Math.max(
      0.3,
      Math.min(2, (rect.width - PAD) / layout.width, (rect.height - PAD) / layout.height, 1),
    );
    setZoom(scale);
    setPan({
      x: rect.width / 2 - rect.width * 0.4 - (layout.width / 2) * scale,
      y: rect.height / 2 - rect.height * 0.4 - (layout.height / 2) * scale,
    });
  }

  const panState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Щипка с два пръста за мащаб на телефон и таблет.
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  function distanceBetweenPointers(): number {
    const pts = Array.from(pinch.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      pinchStart.current = { distance: distanceBetweenPointers(), zoom };
      panState.current = null; // при щипка не влачим платното
      return;
    }
    if (e.target !== e.currentTarget) return;
    setCanvasFocused(true);
    panState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onBackgroundPointerMove(e: React.PointerEvent) {
    if (pinch.current.has(e.pointerId)) {
      pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current.size === 2 && pinchStart.current) {
      const now = distanceBetweenPointers();
      if (now > 0 && pinchStart.current.distance > 0) {
        const factor = now / pinchStart.current.distance;
        setZoom(Math.min(2, Math.max(0.3, pinchStart.current.zoom * factor)));
      }
      return;
    }
    if (!panState.current) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    setPan({ x: panState.current.panX + dx, y: panState.current.panY + dy });
  }

  function onBackgroundPointerUp(e: React.PointerEvent) {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    panState.current = null;
  }

  // ---- влачене на възел (местене в дървото) ----
  // Ако бутонът се пусне извън възел (върху празното платно или извън прозореца),
  // onPointerUp на възела никога не се извиква и влаченето остава заседнало.
  // Затова се подсигуряваме с глобален слушател.
  useEffect(() => {
    if (!dragId) return;
    const cancel = () => {
      setDragId(null);
      setDropTarget(null);
    };
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragId]);

  // Действия за изграждане на дървото - споделени между клавиатурата
  // (по-долу) и бутоните в лентата за форматиране, за да работят и на
  // телефон/таблет без физическа клавиатура (§8.6).
  function addSiblingToSelected(nodeId: string) {
    if (nodeId === ROOT_ID) {
      const id = addChild(doc, ROOT_ID, "", LOCAL_ORIGIN);
      onSelect(id);
      setEditingId(id);
    } else {
      const id = addSiblingAfter(doc, nodeId, "", LOCAL_ORIGIN);
      if (id) {
        onSelect(id);
        setEditingId(id);
      }
    }
  }
  function addChildToSelected(nodeId: string) {
    const id = addChild(doc, nodeId, "", LOCAL_ORIGIN);
    onSelect(id);
    setEditingId(id);
  }
  function deleteSelected(nodeId: string) {
    if (nodeId === ROOT_ID) return;
    const parent = nodes[nodeId]?.parent ?? ROOT_ID;
    deleteNodeSubtree(doc, nodeId, LOCAL_ORIGIN);
    onSelect(parent);
  }

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    if (id === ROOT_ID) return;
    e.stopPropagation();
    setDragId(id);
  }
  function onNodePointerEnter(id: string) {
    if (dragId && dragId !== id) setDropTarget(id);
  }
  /** Следи в коя зона на целевата клетка е показалецът, за да се вижда какво ще стане (§8.13). */
  function onNodePointerMove(e: React.PointerEvent, id: string) {
    if (!dragId || dragId === id) return;
    setDropTarget(id);
    setDropZone(dropZoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));
  }
  function onNodePointerUp(e: React.PointerEvent, id: string) {
    if (dragId && dragId !== id) {
      applyDrop(dragId, id, dropZoneAt(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));
    }
    setDragId(null);
    setDropTarget(null);
  }

  /**
   * Пускане на влачена клетка според зоната (§8.13): дясната трета я прави
   * дете, горната/долната част - брат над/под целевата.
   */
  function applyDrop(sourceId: string, targetId: string, zone: DropZone) {
    const target = nodes[targetId];
    if (!target) return;
    const targetParentId = target.parent;

    // Коренът няма братя - върху него винаги става дете.
    if (zone === "child" || targetParentId === null) {
      const result = moveNode(doc, sourceId, targetId, null, null, LOCAL_ORIGIN);
      if (!result.ok) notify(t.moveRejected);
      return;
    }

    const siblings = getChildren(doc, targetParentId).filter((s) => s.id !== sourceId);
    const idx = siblings.findIndex((s) => s.id === targetId);
    const beforeOrder = zone === "before" ? (siblings[idx - 1]?.order ?? null) : target.order;
    const afterOrder = zone === "before" ? target.order : (siblings[idx + 1]?.order ?? null);
    const result = moveNode(doc, sourceId, targetParentId, beforeOrder, afterOrder, LOCAL_ORIGIN);
    if (!result.ok) {
      notify(t.moveRejected);
      return;
    }
    // Брат на пряко дете на корена трябва да остане на страната, в която е
    // пуснат - иначе `pickBalancedSide` може да го метне на другата страна.
    if (targetParentId === ROOT_ID && target.side) setNodeSide(doc, sourceId, target.side, LOCAL_ORIGIN);
  }

  // Клик върху възел: обикновено избира, но докато сме "въоръжени" за връзка
  // (§8.2) вместо това довършва стрелката към кликнатия възел.
  function onNodeClick(id: string, e: React.MouseEvent) {
    setCanvasFocused(false);
    if (linkingFrom) {
      if (linkingFrom !== id) addLink(doc, linkingFrom, id, LOCAL_ORIGIN);
      setLinkingFrom(null);
      return;
    }
    setSelectedLinkId(null);
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && id !== ROOT_ID) {
      // Множествен избор (§8.21): добавя/маха от множеството; кликнатата
      // клетка става и новата "основна" (за лентата за форматиране/редакция).
      setMultiSelected((cur) => {
        const next = new Set(cur);
        next.add(selectedId); // "поглъщаме" сегашния единичен избор в множеството
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      onSelect(id);
      return;
    }
    setMultiSelected(new Set());
    onSelect(id);
  }

  const { canUndo, canRedo } = useUndoRedoState(undoManager);
  const selectedNode = nodes[selectedId];
  const selectedHasChildren = layout?.nodes.find((n) => n.id === selectedId)?.hasChildren ?? false;

  if (!layout) return <div className="mindmap-empty">{t.loading}</div>;

  return (
    <>
      {selectedNode && (
        <FormatToolbar
          doc={doc}
          node={selectedNode}
          origin={LOCAL_ORIGIN}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => undoManager.undo()}
          onRedo={() => undoManager.redo()}
          linkArmed={linkingFrom === selectedNode.id}
          onArmLink={() => setLinkingFrom((cur) => (cur === selectedNode.id ? null : selectedNode.id))}
          hasChildren={selectedHasChildren}
          onAddChild={() => addChildToSelected(selectedNode.id)}
          onAddSibling={() => addSiblingToSelected(selectedNode.id)}
          onDelete={() => deleteSelected(selectedNode.id)}
          onDuplicate={() => {
            const newId = duplicateSubtree(doc, selectedNode.id, LOCAL_ORIGIN);
            if (newId) onSelect(newId);
          }}
          onToggleCollapse={() => toggleCollapsed(doc, selectedNode.id, LOCAL_ORIGIN)}
        />
      )}
      {multiSelected.size > 0 && (
        <div className="multi-select-toolbar">
          <span className="multi-select-count">{t.multiSelectCount(effectiveSelection.size)}</span>
          <button
            title={t.toolbarDelete}
            onClick={() => {
              for (const id of effectiveSelection) {
                if (id !== ROOT_ID) deleteNodeSubtree(doc, id, LOCAL_ORIGIN);
              }
              setMultiSelected(new Set());
              onSelect(ROOT_ID);
            }}
          >
            🗑 {t.multiSelectDeleteAll}
          </button>
          <button
            title={t.toolbarBold}
            onClick={() => {
              for (const id of effectiveSelection) if (id !== ROOT_ID) toggleBold(doc, id, LOCAL_ORIGIN);
            }}
          >
            <strong>Ч</strong>
          </button>
          <button title={t.toolbarItalic} onClick={() => {
            for (const id of effectiveSelection) if (id !== ROOT_ID) toggleItalic(doc, id, LOCAL_ORIGIN);
          }}>
            <em>К</em>
          </button>
          <div className="format-picker-wrap">
            <button
              title={t.toolbarTextColor}
              onClick={() => setMultiColorPicker((cur) => (cur === "text" ? null : "text"))}
            >
              A
            </button>
            {multiColorPicker === "text" && (
              <MultiColorPicker
                palette={TEXT_COLOR_PALETTE}
                onPick={(color) => {
                  for (const id of effectiveSelection) if (id !== ROOT_ID) setTextColor(doc, id, color, LOCAL_ORIGIN);
                  setMultiColorPicker(null);
                }}
              />
            )}
          </div>
          <div className="format-picker-wrap">
            <button
              title={t.toolbarBackgroundColor}
              onClick={() => setMultiColorPicker((cur) => (cur === "background" ? null : "background"))}
            >
              ▧
            </button>
            {multiColorPicker === "background" && (
              <MultiColorPicker
                palette={BACKGROUND_COLOR_PALETTE}
                onPick={(color) => {
                  for (const id of effectiveSelection) if (id !== ROOT_ID) setBackgroundColor(doc, id, color, LOCAL_ORIGIN);
                  setMultiColorPicker(null);
                }}
              />
            )}
          </div>
        </div>
      )}
      {linkingFrom && <div className="mindmap-linking-hint">{t.linkingHint}</div>}
      <div
        ref={containerRef}
        className={`mindmap-viewport${linkingFrom ? " linking" : ""}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          setSelectedLinkId(null);
          setMultiSelected(new Set());
          onBackgroundPointerDown(e);
        }}
        onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp}
        onPointerCancel={onBackgroundPointerUp}
        role="tree"
        aria-label={t.a11yCanvas}
      >
      <div
        className="mindmap-canvas"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {clouds.map((c) => (
          <div
            key={c.id}
            className="mindmap-cloud"
            style={{
              left: c.x,
              top: c.y,
              width: c.width,
              height: c.height,
              background: c.color,
              borderColor: c.color,
            }}
          />
        ))}

        <svg className="mindmap-edges" width={layout.width} height={layout.height}>
          {layout.edges.map((edge) => {
            const from = layout.nodes.find((n) => n.id === edge.from);
            const to = layout.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            const fromX = to.side === "left" ? from.x : from.x + from.width;
            const fromY = from.y + from.height / 2;
            const toX = to.side === "left" ? to.x + to.width : to.x;
            const toY = to.y + to.height / 2;
            const midX = (fromX + toX) / 2;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                className="mindmap-edge"
              />
            );
          })}
        </svg>

        <svg className="mindmap-links" width={layout.width} height={layout.height}>
          <defs>
            <marker id="mindmap-link-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {linkPaths.map((l) => (
            <path
              key={l.id}
              d={l.d}
              className={`mindmap-link${l.id === selectedLinkId ? " selected" : ""}`}
              markerEnd="url(#mindmap-link-arrow)"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLinkId(l.id);
              }}
            />
          ))}
        </svg>

        {layout.nodes.map((n) => (
          <NodeBox
            key={n.id}
            layoutNode={n}
            snapshot={nodes[n.id]}
            selected={n.id === selectedId}
            editing={n.id === editingId}
            isDropTarget={n.id === dropTarget}
            dropZone={n.id === dropTarget ? dropZone : null}
            isDragging={n.id === dragId}
            isMatch={matchSet.has(n.id)}
            isActiveMatch={search.activeMatch === n.id}
            dimmed={search.dimOthers && search.matches.length > 0 && !matchSet.has(n.id)}
            presenceUsers={selectionByNode.get(n.id) ?? []}
            onSelect={(e) => onNodeClick(n.id, e)}
            multiSelected={multiSelected.has(n.id)}
            onStartEdit={() => setEditingId(n.id)}
            onCommitText={(text) => {
              setNodeText(doc, n.id, text, LOCAL_ORIGIN);
              setEditingId(null);
            }}
            onCancelEdit={() => setEditingId(null)}
            onToggleCollapse={() => toggleCollapsed(doc, n.id, LOCAL_ORIGIN)}
            onSaveDraftAsNewSibling={(text) => addSiblingAfter(doc, n.id, text, LOCAL_ORIGIN)}
            onPointerDown={(e) => onNodePointerDown(e, n.id)}
            onPointerEnter={() => onNodePointerEnter(n.id)}
            onPointerMove={(e) => onNodePointerMove(e, n.id)}
            onPointerUp={(e) => onNodePointerUp(e, n.id)}
          />
        ))}
      </div>
      <div className="zoom-controls">
        <button title={t.zoomOut} onClick={zoomOut}>
          −
        </button>
        <button title={t.zoomFit} onClick={fitToScreen}>
          ⤢
        </button>
        <button title={t.zoomIn} onClick={zoomIn}>
          +
        </button>
      </div>
      </div>
    </>
  );
}

function NodeBox({
  layoutNode,
  snapshot,
  selected,
  multiSelected,
  editing,
  isDropTarget,
  dropZone,
  isDragging,
  isMatch,
  isActiveMatch,
  dimmed,
  presenceUsers,
  onSelect,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onToggleCollapse,
  onSaveDraftAsNewSibling,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  onPointerUp,
}: {
  layoutNode: LayoutNode;
  snapshot: NodeSnapshot | undefined;
  selected: boolean;
  /** Част от групов избор (§8.21), различна от основната selected клетка. */
  multiSelected: boolean;
  editing: boolean;
  isDropTarget: boolean;
  /** Кое ще стане при пускане тук - за визуалната подсказка (§8.13). */
  dropZone: DropZone | null;
  isDragging: boolean;
  isMatch: boolean;
  isActiveMatch: boolean;
  dimmed: boolean;
  presenceUsers: PresenceUser[];
  onSelect: (e: React.MouseEvent) => void;
  onStartEdit: () => void;
  onCommitText: (text: string) => void;
  onCancelEdit: () => void;
  onToggleCollapse: () => void;
  /** При конфликт с чужда едновременна редакция (§8.22) - пази недовършеното като нов брат. */
  onSaveDraftAsNewSibling: (text: string) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layoutNode.text);
  const boxRef = useRef<HTMLDivElement>(null);
  // Конфликт при едновременна редакция (§8.22): преди мълчаливо се
  // презаписваше черновата с чуждия текст, ако друг участник потвърди своя
  // ред докато този все още пише - недовършеното писане просто изчезваше.
  const [conflictText, setConflictText] = useState<string | null>(null);
  const editStartTextRef = useRef(layoutNode.text);
  const wasEditingRef = useRef(editing);

  useEffect(() => {
    const justStarted = editing && !wasEditingRef.current;
    wasEditingRef.current = editing;
    if (justStarted) {
      editStartTextRef.current = layoutNode.text;
      setDraft(layoutNode.text);
      setConflictText(null);
    }
  }, [editing, layoutNode.text]);

  useEffect(() => {
    if (!editing) return;
    if (layoutNode.text === editStartTextRef.current) return; // няма чужда промяна
    if (draft === editStartTextRef.current) {
      // нищо свое не е написано - безопасно е да поемем новото
      editStartTextRef.current = layoutNode.text;
      setDraft(layoutNode.text);
    } else {
      setConflictText(layoutNode.text);
    }
  }, [layoutNode.text, editing, draft]);

  // Избраният възел получава и истински фокус в браузъра, за да го обяви
  // екранният четец и да се вижда при работа само с клавиатура.
  useEffect(() => {
    if (selected && !editing) boxRef.current?.focus({ preventScroll: true });
  }, [selected, editing]);

  return (
    <div
      ref={boxRef}
      className={[
        "mindmap-node",
        selected && "selected",
        multiSelected && "multi-selected",
        isDropTarget && "drop-target",
        isDropTarget && dropZone && `drop-${dropZone}`,
        isDragging && "dragging",
        isMatch && "search-match",
        isActiveMatch && "search-active",
        dimmed && "dimmed",
        layoutNode.id === "root" && "root",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: layoutNode.x,
        top: layoutNode.y,
        width: layoutNode.width,
        height: layoutNode.height,
        backgroundColor: snapshot?.style?.background,
        color: snapshot?.style?.color ?? readableTextColorFor(snapshot?.style?.background),
      }}
      role="treeitem"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-expanded={layoutNode.hasChildren ? !layoutNode.collapsed : undefined}
      aria-label={t.a11yNode(layoutNode.text || t.emptyNode)}
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {presenceUsers.length > 0 && (
        <div className="node-presence">
          {presenceUsers.map((u) => (
            <span key={u.clientId} className="node-presence-dot" style={{ backgroundColor: u.color }} />
          ))}
        </div>
      )}
      {editing ? (
        <>
          <textarea
            autoFocus
            className="node-edit-input"
            rows={draft.split("\n").length}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.altKey) {
                // Alt+Enter вмъква нов ред (§8.1) - оставяме си стандартното
                // поведение на textarea за Enter, само спираме разпространението.
                e.stopPropagation();
              } else if (e.key === "Enter") {
                e.preventDefault();
                onCommitText(draft);
                e.stopPropagation();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
                e.stopPropagation();
              } else if (!(e.ctrlKey || e.metaKey || e.altKey)) {
                // обикновено писане - спираме разпространението, за да не тръгне
                // и към клавишите на платното (стрелки, интервал и т.н.)
                e.stopPropagation();
              }
              // комбинации с Ctrl/Alt/Cmd (удебелено, наклонено, цвят, икони) НЕ се
              // спират тук - продължават към прозоречния слушател, за да работят и
              // по време на редакция (вж. PLAN.md §7.1)
            }}
            onBlur={() => {
              // При конфликт (§8.22) НЕ комитваме автоматично на blur - бутоните
              // на банера по-долу решават изрично какво да стане (иначе клик върху
              // тях първо размазва черновата върху чуждия текст, преди да са
              // хванали избора на потребителя).
              if (conflictText === null) onCommitText(draft);
            }}
          />
          {conflictText !== null && (
            <div className="edit-conflict-banner">
              <span>{t.editConflictMessage}</span>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSaveDraftAsNewSibling(draft);
                  setConflictText(null);
                  onCancelEdit();
                }}
              >
                {t.editConflictKeepMine}
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editStartTextRef.current = conflictText;
                  setDraft(conflictText);
                  setConflictText(null);
                }}
              >
                {t.editConflictTakeTheirs}
              </button>
            </div>
          )}
        </>
      ) : (
        <span
          className="node-text"
          style={{ fontWeight: snapshot?.style?.bold ? 700 : undefined, fontStyle: snapshot?.style?.italic ? "italic" : undefined }}
        >
          {snapshot?.style?.icons && snapshot.style.icons.length > 0 && (
            <span className="node-icons">
              {snapshot.style.icons.map((id, i) => (
                <span key={`${id}-${i}`}>{ICON_CATALOG.find((icon) => icon.id === id)?.emoji}</span>
              ))}
            </span>
          )}
          {layoutNode.text || t.emptyNode}
        </span>
      )}
      {snapshot?.style.link && (
        <a
          className="node-link-btn"
          href={snapshot.style.link}
          target="_blank"
          rel="noopener noreferrer"
          title={snapshot.style.link}
          onClick={(e) => {
            e.stopPropagation();
            // защита в дълбочина - линкът може да идва от внесен чужд .mm файл
            if (!isSafeLinkUrl(snapshot.style.link!)) e.preventDefault();
          }}
        >
          🌐
        </a>
      )}
      {layoutNode.hasChildren && (
        <button
          className="node-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          title={layoutNode.collapsed ? t.expand : t.collapse}
        >
          {layoutNode.collapsed ? "+" : "−"}
        </button>
      )}
    </div>
  );
}

/** Малка палитра за групово оцветяване (§8.21) - без "текущ цвят" (клетките може да имат различни). */
function MultiColorPicker({ palette, onPick }: { palette: string[]; onPick: (color: string | null) => void }) {
  const t = useT();
  return (
    <div className="color-picker">
      <button className="color-swatch color-swatch-default" title={t.toolbarDefault} onClick={() => onPick(null)}>
        ✕
      </button>
      {palette.map((color) => (
        <button
          key={color}
          className="color-swatch"
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
          title={color}
        />
      ))}
    </div>
  );
}
