import { useCallback, useMemo, useRef, useState } from "react";
import { ROOT_ID } from "./model/doc";
import { useYDoc } from "./hooks/useYDoc";
import { useUndoManager } from "./hooks/useUndo";
import { MindMapCanvas, LOCAL_ORIGIN, type CanvasHandle } from "./components/MindMapCanvas";
import { PresenceBar, usePresence } from "./components/PresenceBar";
import { HistoryPanel } from "./components/HistoryPanel";
import { FileMenu } from "./components/FileMenu";
import { HelpPanel } from "./components/HelpPanel";
import { SearchBar, EMPTY_SEARCH, type SearchState } from "./components/SearchBar";
import { LanguageProvider, useLanguage } from "./i18n/useLanguage";
import { LANGUAGES } from "./i18n/translations";
import "./App.css";

function getRoomIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  let room = params.get("room");
  if (!room) {
    room = `map-${Math.random().toString(36).slice(2, 10)}`;
    params.set("room", room);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  return room;
}

export default function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}

function AppShell() {
  const { t, language, setLanguage } = useLanguage();
  const roomId = useMemo(getRoomIdFromUrl, []);
  const { doc, provider, status, nodes, authorName, setAuthorName } = useYDoc(roomId);
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [linkCopied, setLinkCopied] = useState(false);
  const undoManager = useUndoManager(doc, LOCAL_ORIGIN);
  if (import.meta.env.DEV) {
    // помощ при диагностика в конзолата на браузъра (вж. hooks/useYDoc.ts за __mindmap)
    (window as unknown as Record<string, unknown>).__undoManager = undoManager;
  }
  const presence = usePresence(provider?.awareness, authorName, selectedId);
  const canvasRef = useRef<CanvasHandle | null>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const jumpToNode = useCallback((nodeId: string) => {
    canvasRef.current?.focusNode(nodeId);
  }, []);

  function closeSearch() {
    setSearchOpen(false);
    setSearch(EMPTY_SEARCH);
  }

  function copyLink() {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">
          {t.appName}
          <span className="app-tagline">{t.appTagline}</span>
        </h1>

        <div className="app-header-actions">
          <button onClick={copyLink} title={window.location.href}>
            {linkCopied ? t.copyLinkDone : t.copyLink}
          </button>
          <button onClick={openSearch}>{t.search}</button>
          <button onClick={() => setHistoryOpen(true)}>{t.history}</button>
          <FileMenu doc={doc} onImported={() => setSelectedId(ROOT_ID)} />
          <button onClick={() => setHelpOpen(true)}>{t.help}</button>
        </div>

        <div className="app-header-right">
          <select
            className="language-select"
            aria-label={t.language}
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <PresenceBar
            users={presence}
            status={status}
            authorName={authorName}
            onRename={setAuthorName}
          />
        </div>
      </header>

      {searchOpen && (
        <SearchBar
          nodes={nodes}
          state={search}
          onChange={setSearch}
          onClose={closeSearch}
          onJump={jumpToNode}
        />
      )}

      <main className="app-main">
        <MindMapCanvas
          doc={doc}
          nodes={nodes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          presence={presence}
          undoManager={undoManager}
          search={search}
          onRequestSearch={openSearch}
          canvasRef={canvasRef}
        />
      </main>

      <footer className="app-footer">
        <span>{t.shortcutsHint}</span>
      </footer>

      {historyOpen && (
        <div className="modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <HistoryPanel doc={doc} authorName={authorName} onClose={() => setHistoryOpen(false)} />
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="modal-overlay" onClick={() => setHelpOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <HelpPanel onClose={() => setHelpOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
