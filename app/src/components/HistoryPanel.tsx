import { useState } from "react";
import * as Y from "yjs";
import type { VersionEntry } from "../history/snapshots";
import { listVersions, nameVersion, restoreSnapshot, takeSnapshot } from "../history/snapshots";
import { useLanguage } from "../i18n/useLanguage";

export function HistoryPanel({
  doc,
  authorName,
  onClose,
}: {
  doc: Y.Doc;
  authorName: string;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const [versions, setVersions] = useState<VersionEntry[]>(() => listVersions(doc));
  const [labelDraft, setLabelDraft] = useState("");

  function refresh() {
    setVersions(listVersions(doc));
  }

  const locale = language === "bg" ? "bg-BG" : "en-GB";

  return (
    <div className="history-panel" role="dialog" aria-label={t.historyTitle}>
      <div className="history-header">
        <h3>{t.historyTitle}</h3>
        <button onClick={onClose}>{t.historyClose}</button>
      </div>

      <div className="history-new">
        <input
          placeholder={t.historySavePlaceholder}
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
        />
        <button
          onClick={() => {
            takeSnapshot(doc, authorName, labelDraft.trim() || t.historyAuto);
            setLabelDraft("");
            refresh();
          }}
        >
          {t.historySave}
        </button>
      </div>

      <ul className="history-list">
        {versions.length === 0 && <li className="history-empty">{t.historyEmpty}</li>}
        {versions.map((v) => (
          <li key={v.id} className={v.label ? "named" : "auto"}>
            <div className="history-entry-main">
              <strong>{v.label ?? t.historyAuto}</strong>
              <span className="history-meta">
                {new Date(v.createdAt).toLocaleString(locale)} · {v.author} ·{" "}
                {t.historyNodes(v.nodeCount)}
              </span>
            </div>
            <div className="history-entry-actions">
              {!v.label && (
                <button
                  onClick={() => {
                    const name = window.prompt(t.historyNamePrompt, "");
                    if (name) {
                      nameVersion(doc, v.id, name);
                      refresh();
                    }
                  }}
                >
                  {t.historyName}
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(t.historyRestoreConfirm)) {
                    restoreSnapshot(doc, v);
                    onClose();
                  }
                }}
              >
                {t.historyRestore}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
