import type * as Y from "yjs";
import { isSafeLinkUrl, setLink } from "./model/doc";
import type { Dictionary } from "./i18n/translations";

/** Пита за уеб адрес на клетката - общо за бутона 🌐 и Ctrl+K (§8.20). */
export function promptForNodeLink(
  doc: Y.Doc,
  nodeId: string,
  currentLink: string | undefined,
  t: Dictionary,
  origin: unknown,
): void {
  // eslint-disable-next-line no-alert
  const input = window.prompt(t.linkPrompt, currentLink ?? "");
  if (input === null) return; // отказ
  const trimmed = input.trim();
  if (!trimmed) {
    setLink(doc, nodeId, null, origin);
    return;
  }
  // удобство: "example.com" се приема за "https://example.com"
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!isSafeLinkUrl(normalized)) {
    // eslint-disable-next-line no-alert
    window.alert(t.linkInvalid);
    return;
  }
  setLink(doc, nodeId, normalized, origin);
}
