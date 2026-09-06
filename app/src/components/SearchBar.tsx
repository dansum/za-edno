import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeSnapshot } from "../model/doc";
import { useT } from "../i18n/useLanguage";

export interface SearchState {
  query: string;
  matches: string[];
  activeMatch: string | null;
  dimOthers: boolean;
}

export const EMPTY_SEARCH: SearchState = {
  query: "",
  matches: [],
  activeMatch: null,
  dimOthers: false,
};

/**
 * Търсенето сравнява без оглед на главни/малки букви и на диакритика.
 * Нормализацията е важна за български: „Задача" и „задача" трябва да съвпадат.
 */
function normalize(value: string): string {
  return value.toLocaleLowerCase("bg").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function findMatches(nodes: Record<string, NodeSnapshot>, query: string): string[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return Object.values(nodes)
    .filter((n) => normalize(n.text).includes(needle) || normalize(n.note).includes(needle))
    .map((n) => n.id);
}

export function SearchBar({
  nodes,
  state,
  onChange,
  onClose,
  onJump,
}: {
  nodes: Record<string, NodeSnapshot>;
  state: SearchState;
  onChange: (next: SearchState) => void;
  onClose: () => void;
  onJump: (nodeId: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(state.query);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const matches = useMemo(() => findMatches(nodes, query), [nodes, query]);

  // Резултатите се преизчисляват при всяка промяна на текста или на картата
  // (друг участник може да добави съвпадащ възел, докато търсим).
  useEffect(() => {
    const stillValid = state.activeMatch && matches.includes(state.activeMatch);
    const nextActive = stillValid ? state.activeMatch : (matches[0] ?? null);
    onChange({ ...state, query, matches, activeMatch: nextActive });
    if (!stillValid && nextActive) onJump(nextActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matches.join("|")]);

  const activeIndex = state.activeMatch ? matches.indexOf(state.activeMatch) : -1;

  function step(direction: 1 | -1) {
    if (matches.length === 0) return;
    const next = (activeIndex + direction + matches.length) % matches.length;
    onChange({ ...state, query, matches, activeMatch: matches[next] });
    onJump(matches[next]);
  }

  return (
    <div className="search-bar" role="search">
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder={t.searchPlaceholder}
        value={query}
        aria-label={t.search}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          e.stopPropagation(); // да не стигне до клавишите на платното
        }}
      />
      <span className="search-count" aria-live="polite">
        {query.trim() === ""
          ? ""
          : matches.length === 0
            ? t.searchNoResults
            : t.searchResults(activeIndex + 1, matches.length)}
      </span>
      <button onClick={() => step(-1)} title={t.searchPrev} disabled={matches.length === 0}>
        ↑
      </button>
      <button onClick={() => step(1)} title={t.searchNext} disabled={matches.length === 0}>
        ↓
      </button>
      <label className="search-dim">
        <input
          type="checkbox"
          checked={state.dimOthers}
          onChange={(e) => onChange({ ...state, query, matches, dimOthers: e.target.checked })}
        />
        {t.searchDimOthers}
      </label>
      <button onClick={onClose} title={t.searchClose} aria-label={t.searchClose}>
        ✕
      </button>
    </div>
  );
}
