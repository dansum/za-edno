import * as Y from "yjs";
import { ROOT_ID, getChildren, getNodesMap, toSnapshot } from "../model/doc";
import { useT } from "../i18n/useLanguage";

/**
 * Плосък, вложен списък на цялата карта (§8.20) - за бързо сканиране и за
 * екранни четци, като алтернатива на визуалното дърво.
 */
export function OutlinePanel({
  doc,
  onClose,
  onJump,
}: {
  doc: Y.Doc;
  onClose: () => void;
  onJump: (nodeId: string) => void;
}) {
  const t = useT();

  return (
    <div className="outline-panel" role="dialog" aria-label={t.outlineTitle}>
      <div className="history-header">
        <h3>{t.outlineTitle}</h3>
        <button onClick={onClose}>{t.historyClose}</button>
      </div>
      <ul className="outline-list">
        <OutlineNode doc={doc} nodeId={ROOT_ID} onJump={onJump} />
      </ul>
    </div>
  );
}

function OutlineNode({
  doc,
  nodeId,
  onJump,
}: {
  doc: Y.Doc;
  nodeId: string;
  onJump: (nodeId: string) => void;
}) {
  const t = useT();
  const nodeMap = getNodesMap(doc).get(nodeId);
  if (!nodeMap) return null;
  const snap = toSnapshot(doc, nodeId, nodeMap);
  const children = getChildren(doc, nodeId);

  return (
    <li>
      <button
        className="outline-item"
        style={{ fontWeight: snap.style.bold ? 700 : undefined, fontStyle: snap.style.italic ? "italic" : undefined }}
        onClick={() => onJump(nodeId)}
      >
        {snap.style.icons?.length ? "🔖 " : ""}
        {snap.text || t.emptyNode}
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <OutlineNode key={c.id} doc={doc} nodeId={c.id} onJump={onJump} />
          ))}
        </ul>
      )}
    </li>
  );
}
