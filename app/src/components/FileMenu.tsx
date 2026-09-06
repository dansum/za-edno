import { useRef, useState } from "react";
import * as Y from "yjs";
import {
  downloadTextFile,
  exportToFreeMind,
  exportToMarkdown,
  exportToOpml,
  parseFreeMind,
  replaceDocWithTree,
} from "../importExport/freemind";
import { getMeta } from "../model/doc";
import { useT } from "../i18n/useLanguage";

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
      setError(err instanceof Error ? err.message : t.importFailed);
    }
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
          <hr />
          <button onClick={() => fileInputRef.current?.click()}>{t.importFile}</button>
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
