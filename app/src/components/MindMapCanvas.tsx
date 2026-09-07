import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import {
  ROOT_ID,
  addChild,
  addLink,
  addSiblingAfter,
  deleteLink,
  deleteNodeSubtree,
  moveNode,
  setNodeText,
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
import type { PresenceUser } from "./PresenceBar";
import type { SearchState } from "./SearchBar";
import { useT } from "../i18n/useLanguage";
import { readableTextColorFor } from "../model/color";
import { ICON_CATALOG, iconIdForDigitCode } from "../model/icons";
import { FormatToolbar } from "./FormatToolbar";
import { useUndoRedoState } from "../hooks/useUndo";

const LOCAL_ORIGIN = Symbol("local-edit");
export { LOCAL_ORIGIN };

export interface CanvasHandle {
  focusNode: (nodeId: string) => void;
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
  // Режим "свързване" (§8.2): въоръжен от бутона 🔗 в лентата за форматиране;
  // следващият кликнат възел довършва стрелката от `linkingFrom` към него.
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

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
        if (selectedId === ROOT_ID) {
          const id = addChild(doc, ROOT_ID, "", LOCAL_ORIGIN);
          onSelect(id);
          setEditingId(id);
        } else {
          const id = addSiblingAfter(doc, selectedId, "", LOCAL_ORIGIN);
          if (id) {
            onSelect(id);
            setEditingId(id);
          }
        }
      } else if (e.key === "Tab" || e.key === "Insert") {
        e.preventDefault();
        const id = addChild(doc, selectedId, "", LOCAL_ORIGIN);
        onSelect(id);
        setEditingId(id);
      } else if (e.key === "F2") {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId === ROOT_ID) return;
        e.preventDefault();
        const parent = nodes[selectedId]?.parent ?? ROOT_ID;
        deleteNodeSubtree(doc, selectedId, LOCAL_ORIGIN);
        onSelect(parent);
      } else if (e.key === " ") {
        e.preventDefault();
        toggleCollapsed(doc, selectedId, LOCAL_ORIGIN);
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
  }, [doc, selectedId, editingId, layout, nodes, onSelect, undoManager, onRequestSearch, linkingFrom, selectedLinkId]);

  // ---- панорама и мащаб на платното ----
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
    }
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

  function onNodePointerDown(e: React.PointerEvent, id: string) {
    if (id === ROOT_ID) return;
    e.stopPropagation();
    setDragId(id);
  }
  function onNodePointerEnter(id: string) {
    if (dragId && dragId !== id) setDropTarget(id);
  }
  function onNodePointerUp() {
    if (dragId && dropTarget && dragId !== dropTarget) {
      const result = moveNode(doc, dragId, dropTarget, null, null, LOCAL_ORIGIN);
      if (!result.ok) {
        // eslint-disable-next-line no-alert
        console.warn("Местенето е отказано:", result.reason);
      }
    }
    setDragId(null);
    setDropTarget(null);
  }

  // Клик върху възел: обикновено избира, но докато сме "въоръжени" за връзка
  // (§8.2) вместо това довършва стрелката към кликнатия възел.
  function onNodeClick(id: string) {
    if (linkingFrom) {
      if (linkingFrom !== id) addLink(doc, linkingFrom, id, LOCAL_ORIGIN);
      setLinkingFrom(null);
      return;
    }
    setSelectedLinkId(null);
    onSelect(id);
  }

  const { canUndo, canRedo } = useUndoRedoState(undoManager);
  const selectedNode = nodes[selectedId];

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
        />
      )}
      {linkingFrom && <div className="mindmap-linking-hint">{t.linkingHint}</div>}
      <div
        ref={containerRef}
        className={`mindmap-viewport${linkingFrom ? " linking" : ""}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          setSelectedLinkId(null);
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
            isDragging={n.id === dragId}
            isMatch={matchSet.has(n.id)}
            isActiveMatch={search.activeMatch === n.id}
            dimmed={search.dimOthers && search.matches.length > 0 && !matchSet.has(n.id)}
            presenceUsers={selectionByNode.get(n.id) ?? []}
            onSelect={() => onNodeClick(n.id)}
            onStartEdit={() => setEditingId(n.id)}
            onCommitText={(text) => {
              setNodeText(doc, n.id, text, LOCAL_ORIGIN);
              setEditingId(null);
            }}
            onCancelEdit={() => setEditingId(null)}
            onToggleCollapse={() => toggleCollapsed(doc, n.id, LOCAL_ORIGIN)}
            onPointerDown={(e) => onNodePointerDown(e, n.id)}
            onPointerEnter={() => onNodePointerEnter(n.id)}
            onPointerUp={onNodePointerUp}
          />
        ))}
      </div>
      </div>
    </>
  );
}

function NodeBox({
  layoutNode,
  snapshot,
  selected,
  editing,
  isDropTarget,
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
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  layoutNode: LayoutNode;
  snapshot: NodeSnapshot | undefined;
  selected: boolean;
  editing: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  isMatch: boolean;
  isActiveMatch: boolean;
  dimmed: boolean;
  presenceUsers: PresenceUser[];
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitText: (text: string) => void;
  onCancelEdit: () => void;
  onToggleCollapse: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerUp: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layoutNode.text);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) setDraft(layoutNode.text);
  }, [editing, layoutNode.text]);

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
        isDropTarget && "drop-target",
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
        <input
          autoFocus
          className="node-edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
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
          onBlur={() => onCommitText(draft)}
        />
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
