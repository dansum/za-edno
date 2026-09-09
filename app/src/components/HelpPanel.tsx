import { useT } from "../i18n/useLanguage";
import { ICON_CATALOG } from "../model/icons";

const KEYS: { keys: string; labelKey: keyof ReturnType<typeof useT> }[] = [
  { keys: "Enter", labelKey: "keyEnter" },
  { keys: "Tab / Insert", labelKey: "keyTab" },
  { keys: "F2", labelKey: "keyF2" },
  { keys: "Delete", labelKey: "keyDelete" },
  { keys: "Space", labelKey: "keySpace" },
  { keys: "↑ ↓ ← →", labelKey: "keyArrows" },
  { keys: "↑ ↓ ← → (след клик на празно)", labelKey: "keyArrowsCanvas" },
  { keys: "Ctrl + ↑ ↓ ← →", labelKey: "keyMoveNode" },
  { keys: "Alt + Enter", labelKey: "keyNewline" },
  { keys: "Ctrl + Z", labelKey: "keyUndo" },
  { keys: "Ctrl + Y / Ctrl + Shift + Z", labelKey: "keyRedo" },
  { keys: "Ctrl + F", labelKey: "keySearch" },
  { keys: "Ctrl + колело / Ctrl + wheel", labelKey: "keyZoom" },
  { keys: "Ctrl + B", labelKey: "keyBold" },
  { keys: "Ctrl + I", labelKey: "keyItalic" },
  { keys: "Alt + R (Ctrl+Shift+R на Mac)", labelKey: "keyRedText" },
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const t = useT();

  return (
    <div className="help-panel" role="dialog" aria-label={t.helpTitle}>
      <div className="help-header">
        <h3>{t.helpTitle}</h3>
        <button onClick={onClose}>{t.helpClose}</button>
      </div>

      <section>
        <h4>{t.helpIntroTitle}</h4>
        <p>{t.helpIntro}</p>
      </section>

      <section>
        <h4>{t.helpKeysTitle}</h4>
        <table className="help-keys">
          <tbody>
            {KEYS.map((row) => (
              <tr key={row.keys}>
                <th scope="row">
                  <kbd>{row.keys}</kbd>
                </th>
                <td>{t[row.labelKey] as string}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">🖱️</th>
              <td>{t.keyDrag}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4>{t.toolbarIcons}</h4>
        <table className="help-keys">
          <tbody>
            {ICON_CATALOG.map((icon) => (
              <tr key={icon.id}>
                <th scope="row">
                  <kbd>{icon.shortcut}</kbd>
                </th>
                <td>
                  {icon.emoji} {t.keyIcon}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4>{t.helpSharingTitle}</h4>
        <p>{t.helpSharing}</p>
      </section>

      <section>
        <h4>{t.helpDataTitle}</h4>
        <p>{t.helpData}</p>
      </section>
    </div>
  );
}
