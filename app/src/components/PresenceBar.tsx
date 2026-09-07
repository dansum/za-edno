import type { Awareness } from "y-protocols/awareness";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/useLanguage";

export interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
  selectedNodeId: string | null;
}

const COLORS = ["#e07a5f", "#3d5a80", "#81b29a", "#f2cc8f", "#9d4edd", "#2a9d8f"];

export function colorForClientId(clientId: number): string {
  return COLORS[clientId % COLORS.length];
}

export function usePresence(
  awareness: Awareness | undefined,
  authorName: string,
  selectedNodeId: string | null,
): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  // Класът Awareness на Liveblocks е техен собствен и няма clientID; и двата
  // провайдъра обаче водят един и същ Y.Doc, така че взимаме номера оттам.
  const localClientId = awareness?.doc?.clientID;

  // Записваме цялото състояние наведнъж, а не поле по поле: setLocalStateField
  // на Liveblocks чете текущото присъствие и го слива, но при два бързи
  // последователни записа вторият чете още неактуализираното състояние и
  // изтрива това от първия (име и цвят изчезваха, оставаше само избраният възел).
  useEffect(() => {
    if (!awareness || localClientId === undefined) return;
    awareness.setLocalState({
      name: authorName,
      color: colorForClientId(localClientId),
      selectedNodeId,
    });
  }, [awareness, authorName, localClientId, selectedNodeId]);

  useEffect(() => {
    if (!awareness) return;
    const onChange = () => {
      const list: PresenceUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (!state?.name) return;
        list.push({
          clientId,
          name: state.name,
          color: state.color ?? colorForClientId(clientId),
          selectedNodeId: state.selectedNodeId ?? null,
        });
      });
      setUsers(list);
    };
    // Различните провайдъри известяват по различен начин: y-protocols праща
    // "change" и "update", а обвивката на Liveblocks праща "change" само за
    // чуждото присъствие. Слушаме и двете, за да не пропуснем нищо.
    awareness.on("change", onChange);
    awareness.on("update", onChange);
    onChange();
    return () => {
      awareness.off("change", onChange);
      awareness.off("update", onChange);
    };
  }, [awareness]);

  // Местният участник се добавя винаги - него го знаем без да чакаме мрежата.
  const withLocal = useMemo(() => {
    if (localClientId === undefined) return users;
    const others = users.filter((u) => u.clientId !== localClientId);
    return [
      {
        clientId: localClientId,
        name: authorName,
        color: colorForClientId(localClientId),
        selectedNodeId,
      },
      ...others,
    ];
  }, [users, localClientId, authorName, selectedNodeId]);

  return withLocal;
}

export function PresenceBar({
  users,
  status,
  authorName,
  onRename,
  lastSyncedAt,
}: {
  users: PresenceUser[];
  status: string;
  authorName: string;
  onRename: (name: string) => void;
  lastSyncedAt: number | null;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(authorName);

  // Ясен офлайн индикатор (§8.4): само "статус" не казва КОЛКО остаряло е
  // състоянието - тиктака собствен часовник, за да се обновява надписа с
  // минутите и без нова мрежова активност.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const syncLabel =
    lastSyncedAt === null
      ? t.statusSyncNever
      : now - lastSyncedAt < 60_000
        ? t.statusSyncJustNow
        : t.statusSyncMinutesAgo(Math.floor((now - lastSyncedAt) / 60_000));

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== authorName) onRename(name);
  }

  return (
    <div className="presence-bar">
      <span className={`status-dot status-${status}`} title={statusLabel(status, t)} role="status" aria-label={statusLabel(status, t)} />
      <span
        className={`sync-label${status !== "connected" ? " sync-stale" : ""}`}
        title={`${statusLabel(status, t)} · ${syncLabel}`}
      >
        {syncLabel}
      </span>
      <div className="presence-users" aria-label={t.a11yParticipants}>
        {users.map((u) => (
          <span
            key={u.clientId}
            className="presence-chip"
            style={{ backgroundColor: u.color }}
            title={u.name}
          >
            {u.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      {editing ? (
        <input
          autoFocus
          className="author-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Записваме направо на Enter, а не през blur: ако полето изгуби
            // фокуса по друг начин, промяната иначе се губи мълчаливо.
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(authorName);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="author-name-btn" onClick={() => setEditing(true)}>
          {authorName}
        </button>
      )}
    </div>
  );
}

function statusLabel(status: string, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "connected":
      return t.statusConnected;
    case "connecting":
      return t.statusConnecting;
    default:
      return t.statusDisconnected;
  }
}
