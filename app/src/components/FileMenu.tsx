import { useRef, useState } from "react";
import * as Y from "yjs";
import {
  docToTree,
  downloadTextFile,
  exportToFreeMind,
  exportToMarkdown,
  exportToOpml,
  parseFreeMind,
  replaceDocWithTree,
} from "../importExport/freemind";
import { downloadBlob, exportToPngBlob, exportToSvg } from "../importExport/imageExport";
import { getMeta } from "../model/doc";
import { useT } from "../i18n/useLanguage";
import { notify } from "../toast";
import { TEMPLATES } from "../templates";
import { generateRoomId } from "../roomId";
import { pendingCopyKey } from "../pendingCopy";

function safeFileName(doc: Y.Doc): string {
  const title = (getMeta(doc).get("title") as string) || "za-edno";
  return title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
}

export function FileMenu({ doc, onImported }: { doc: Y.Doc; onImported: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const tree = parseFreeMind(text);
      const count = countNodes(tree);
      const ok = window.confirm(t.importConfirm(tree.text, count));
      if (!ok) return;
      replaceDocWithTree(doc, tree);
      onImported();
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.importFailed;
      setError(message);
      notify(message);
    }
  }

  function applyTemplate(template: (typeof TEMPLATES)[number]) {
    const count = countNodes(template.tree);
    const ok = window.confirm(t.importConfirm(t[template.labelKey], count));
    if (!ok) return;
    replaceDocWithTree(doc, template.tree);
    onImported();
    setOpen(false);
  }

  function saveCopyToNewRoom() {
    const newRoomId = generateRoomId();
    try {
      localStorage.setItem(pendingCopyKey(newRoomId), JSON.stringify(docToTree(doc)));
    } catch {
      notify(t.saveCopyFailed);
      return;
    }
    window.open(`index.html?room=${newRoomId}`, "_blank");
    setOpen(false);
  }

  return (
    <div className="file-menu">
      <button onClick={() => setOpen((v) => !v)}>{t.file}</button>
      {open && (
        <div className="file-menu-dropdown">
          <button
            onClick={() => {
              downloadTextFile(`${safeFileName(doc)}.mm`, exportToFreeMind(doc), "application/xml");
              setOpen(false);
            }}
          >
            {t.exportFreeMind}
          </button>
          <button
            onClick={() => {
              downloadTextFile(`${safeFileName(doc)}.md`, exportToMarkdown(doc), "text/markdown");
              setOpen(false);
            }}
          >
            {t.exportMarkdown}
          </button>
          <button
            onClick={() => {
              downloadTextFile(`${safeFileName(doc)}.opml`, exportToOpml(doc), "text/x-opml");
              setOpen(false);
            }}
          >
            {t.exportOpml}
          </button>
          <button
            onClick={() => {
              downloadBlob(`${safeFileName(doc)}.svg`, new Blob([exportToSvg(doc)], { type: "image/svg+xml" }));
              setOpen(false);
            }}
          >
            {t.exportSvg}
          </button>
          <button
            onClick={async () => {
              try {
                downloadBlob(`${safeFileName(doc)}.png`, await exportToPngBlob(doc));
                setOpen(false);
              } catch {
                notify(t.exportFailed);
              }
            }}
          >
            {t.exportPng}
          </button>
          <hr />
          <button onClick={() => fileInputRef.current?.click()}>{t.importFile}</button>
          <button onClick={saveCopyToNewRoom}>{t.saveCopyToNewRoom}</button>
          <hr />
          {TEMPLATES.map((template) => (
            <button key={template.key} onClick={() => applyTemplate(template)}>
              {t.templatePrefix} {t[template.labelKey]}
            </button>
          ))}
          {error && <p className="file-menu-error">{error}</p>}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mm,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = ""; // за да може същият файл да се избере пак
        }}
      />
    </div>
  );
}

function countNodes(tree: { children: { children: unknown[] }[] }): number {
  let count = 1;
  for (const child of tree.children) {
    count += countNodes(child as { children: { children: unknown[] }[] });
  }
  return count;
}
