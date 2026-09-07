import { useState } from "react";
import * as Y from "yjs";
import type { NodeSnapshot } from "../model/doc";
import {
  isSafeLinkUrl,
  setBackgroundColor,
  setCloud,
  setLink,
  setTextColor,
  toggleBold,
  toggleIcon,
  toggleItalic,
} from "../model/doc";
import {
  BACKGROUND_COLOR_PALETTE,
  CLOUD_COLOR_PALETTE,
  TEXT_COLOR_PALETTE,
  readableTextColorFor,
} from "../model/color";
import { ICON_CATALOG } from "../model/icons";
import { useT } from "../i18n/useLanguage";

export function FormatToolbar({
  doc,
  node,
  origin,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  linkArmed,
  onArmLink,
}: {
  doc: Y.Doc;
  node: NodeSnapshot;
  origin: unknown;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  linkArmed: boolean;
  onArmLink: () => void;
}) {
  const t = useT();
  const [openPicker, setOpenPicker] = useState<"text" | "background" | "cloud" | "icons" | null>(null);

  function togglePicker(which: "text" | "background" | "cloud" | "icons") {
    setOpenPicker((cur) => (cur === which ? null : which));
  }

  // Ако фонът е тъмен и потребителят не е задал изричен цвят на текста,
  // показваме автоматично избрания светъл цвят вместо тъмния по подразбиране -
  // само визуално в бутона, не пипа модела (вж. PLAN.md §7.3).
  const autoTextColor = readableTextColorFor(node.style.background);

  function handleSetLink() {
    const current = node.style.link ?? "";
    // eslint-disable-next-line no-alert
    const input = window.prompt(t.linkPrompt, current);
    if (input === null) return; // отказ
    const trimmed = input.trim();
    if (!trimmed) {
      setLink(doc, node.id, null, origin);
      return;
    }
    // удобство: "example.com" се приема за "https://example.com"
    const normalized = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!isSafeLinkUrl(normalized)) {
      // eslint-disable-next-line no-alert
      window.alert(t.linkInvalid);
      return;
    }
    setLink(doc, node.id, normalized, origin);
  }

  return (
    <div className="format-toolbar" role="toolbar" aria-label={t.toolbarBold}>
      <button
        className={node.style.bold ? "active" : ""}
        title={t.toolbarBold}
        onClick={() => toggleBold(doc, node.id, origin)}
      >
        <strong>Ч</strong>
      </button>
      <button
        className={node.style.italic ? "active" : ""}
        title={t.toolbarItalic}
        onClick={() => toggleItalic(doc, node.id, origin)}
      >
        <em>К</em>
      </button>

      <span className="format-toolbar-sep" />

      <button title={t.toolbarUndo} disabled={!canUndo} onClick={onUndo}>
        ↶
      </button>
      <button title={t.toolbarRedo} disabled={!canRedo} onClick={onRedo}>
        ↷
      </button>

      <span className="format-toolbar-sep" />

      <div className="format-picker-wrap">
        <button
          title={t.toolbarTextColor}
          onClick={() => togglePicker("text")}
          style={{ color: node.style.color ?? autoTextColor }}
        >
          A
        </button>
        {openPicker === "text" && (
          <ColorPicker
            palette={TEXT_COLOR_PALETTE}
            current={node.style.color}
            defaultLabel={t.toolbarDefault}
            customLabel={t.toolbarCustomColor}
            onPick={(color) => {
              setTextColor(doc, node.id, color, origin);
              setOpenPicker(null);
            }}
          />
        )}
      </div>

      <div className="format-picker-wrap">
        <button
          title={t.toolbarBackgroundColor}
          onClick={() => togglePicker("background")}
          style={{ backgroundColor: node.style.background }}
        >
          ▧
        </button>
        {openPicker === "background" && (
          <ColorPicker
            palette={BACKGROUND_COLOR_PALETTE}
            current={node.style.background}
            defaultLabel={t.toolbarDefault}
            customLabel={t.toolbarCustomColor}
            onPick={(color) => {
              setBackgroundColor(doc, node.id, color, origin);
              setOpenPicker(null);
            }}
          />
        )}
      </div>

      <div className="format-picker-wrap">
        <button
          title={t.toolbarCloud}
          onClick={() => togglePicker("cloud")}
          style={{ color: node.style.cloud }}
        >
          ☁
        </button>
        {openPicker === "cloud" && (
          <ColorPicker
            palette={CLOUD_COLOR_PALETTE}
            current={node.style.cloud}
            defaultLabel={t.toolbarDefault}
            customLabel={t.toolbarCustomColor}
            onPick={(color) => {
              setCloud(doc, node.id, color, origin);
              setOpenPicker(null);
            }}
          />
        )}
      </div>

      <button className={node.style.link ? "active" : ""} title={t.toolbarLinkCell} onClick={handleSetLink}>
        🌐
      </button>

      <button
        className={linkArmed ? "active" : ""}
        title={t.toolbarLink}
        onClick={onArmLink}
      >
        🔗
      </button>

      <span className="format-toolbar-sep" />

      <div className="format-picker-wrap">
        <button title={t.toolbarIcons} onClick={() => togglePicker("icons")}>
          ★
        </button>
        {openPicker === "icons" && (
          <div className="icon-picker">
            {ICON_CATALOG.map((icon) => (
              <button
                key={icon.id}
                className={node.style.icons?.includes(icon.id) ? "active" : ""}
                title={`${icon.emoji} · ${icon.shortcut}`}
                onClick={() => toggleIcon(doc, node.id, icon.id, origin)}
              >
                {icon.emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {node.style.icons && node.style.icons.length > 0 && (
        <span className="format-toolbar-icons-preview">
          {node.style.icons.map((id) => ICON_CATALOG.find((i) => i.id === id)?.emoji).join(" ")}
        </span>
      )}
    </div>
  );
}

function ColorPicker({
  palette,
  current,
  defaultLabel,
  customLabel,
  onPick,
}: {
  palette: string[];
  current: string | undefined;
  defaultLabel: string;
  customLabel: string;
  onPick: (color: string | null) => void;
}) {
  return (
    <div className="color-picker">
      <button className="color-swatch color-swatch-default" title={defaultLabel} onClick={() => onPick(null)}>
        ✕
      </button>
      {palette.map((color) => (
        <button
          key={color}
          className={`color-swatch ${current === color ? "active" : ""}`}
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
          title={color}
        />
      ))}
      <label className="color-swatch color-swatch-custom" title={customLabel}>
        <input type="color" value={current ?? "#000000"} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}
