import { useEffect, useState } from "react";
import { LANGUAGES, dictionaries, type Language } from "../i18n/translations";
import { listMyMaps, removeMyMap, type MyMapEntry } from "../registry/myMaps";
import "../App.css";
import "./admin.css";

// Нарочно БЕЗ <LanguageProvider> (вж. i18n/useLanguage.tsx) - неговият ефект
// презаписва document.title с надписа на главното приложение, а таблото има
// собствено заглавие на раздела (зададено в admin.html).
const LANG_KEY = "za-edno-language";

function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "bg" || saved === "en") return saved;
  } catch {
    /* localStorage недостъпен - остава българският */
  }
  return "bg";
}

function formatRelative(ms: number, lang: Language): string {
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (lang === "bg") {
    if (diffMin < 1) return "току-що";
    if (diffMin < 60) return `преди ${diffMin} мин`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `преди ${h} ч`;
    return `преди ${Math.floor(h / 24)} дни`;
  }
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function mapLink(roomId: string): string {
  return new URL(`index.html?room=${encodeURIComponent(roomId)}`, window.location.href).href;
}

export function AdminApp() {
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [maps, setMaps] = useState<MyMapEntry[]>(() => listMyMaps());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const t = dictionaries[language];

  useEffect(() => {
    // Друг раздел (напр. самото приложение) може да добави/обнови запис,
    // докато таблото стои отворено - localStorage праща "storage" само към
    // ДРУГИТЕ раздели, точно каквото трябва тук.
    const onStorage = () => setMaps(listMyMaps());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* localStorage недостъпен - езикът важи само за тази сесия */
    }
  }

  function handleRemove(entry: MyMapEntry) {
    if (!window.confirm(t.adminRemoveConfirm(entry.title || entry.roomId))) return;
    removeMyMap(entry.roomId);
    setMaps(listMyMaps());
  }

  function handleNewMap() {
    const roomId = `map-${Math.random().toString(36).slice(2, 10)}`;
    window.location.href = `index.html?room=${roomId}`;
  }

  function handleCopyLink(entry: MyMapEntry) {
    navigator.clipboard
      ?.writeText(mapLink(entry.roomId))
      .then(() => {
        setCopiedId(entry.roomId);
        setTimeout(() => setCopiedId((cur) => (cur === entry.roomId ? null : cur)), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="app-shell admin-page">
      <header className="app-header">
        <h1 className="app-title">
          {t.adminTitle}
          <span className="app-tagline">{t.appName}</span>
        </h1>
        <div className="app-header-actions">
          <button onClick={handleNewMap}>{t.adminNewMap}</button>
          <a className="admin-link-btn" href="index.html">
            {t.adminBackToApp}
          </a>
        </div>
        <div className="app-header-right">
          <select
            className="language-select"
            aria-label={t.language}
            value={language}
            onChange={(e) => changeLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="admin-main">
        <p className="admin-note">{t.adminNote}</p>

        {maps.length === 0 ? (
          <p className="admin-empty">{t.adminEmpty}</p>
        ) : (
          <table className="admin-table">
            <tbody>
              {maps.map((entry) => (
                <tr key={entry.roomId}>
                  <td className="admin-table-title">
                    <a href={`index.html?room=${encodeURIComponent(entry.roomId)}`}>
                      {entry.title || t.newMapTitle}
                    </a>
                    <span className="admin-table-meta">
                      {t.adminLastOpened(formatRelative(entry.lastOpenedAt, language))}
                    </span>
                  </td>
                  <td className="admin-table-actions">
                    <a href={`index.html?room=${encodeURIComponent(entry.roomId)}`}>{t.adminOpen}</a>
                    <button onClick={() => handleCopyLink(entry)}>
                      {copiedId === entry.roomId ? t.copyLinkDone : t.adminCopyLink}
                    </button>
                    <button onClick={() => handleRemove(entry)}>{t.adminRemove}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
