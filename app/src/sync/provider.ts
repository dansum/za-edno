// Тънък слой над мрежата — вж. PLAN.md §2.2.
// Целият достъп до бекенда минава оттук, за да може да се смени
// (напр. Liveblocks -> собствен y-websocket relay) без да се пипа
// останалата част от приложението.

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";

export type SyncStatus = "connecting" | "connected" | "disconnected";

export interface SyncProvider {
  readonly awareness: Awareness;
  connect(): void;
  destroy(): void;
  on(event: "status" | "synced", cb: (payload: unknown) => void): void;
  off(event: "status" | "synced", cb: (payload: unknown) => void): void;
}

type Listener = (payload: unknown) => void;

/**
 * Локален fallback — без хостван бекенд.
 * Синхронизира се между прозорците и разделите на СЪЩИЯ браузър чрез
 * BroadcastChannel; към други устройства не стига. Използва се, когато
 * няма конфигуриран VITE_LIVEBLOCKS_PUBLIC_KEY.
 */
export class LocalOnlyProvider implements SyncProvider {
  readonly awareness: Awareness;
  private listeners = new Map<string, Set<Listener>>();
  private doc: Y.Doc;
  private channel: BroadcastChannel | null = null;

  constructor(doc: Y.Doc, roomId: string) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    try {
      this.channel = new BroadcastChannel(`mindmap-collab:${roomId}`);
    } catch {
      this.channel = null; // браузър без BroadcastChannel — остава само локално
    }
  }

  connect(): void {
    if (this.channel) {
      this.channel.onmessage = (event) => this.onMessage(event.data);
      this.doc.on("update", this.onDocUpdate);
      this.awareness.on("update", this.onAwarenessUpdate);
      // Молба към другите прозорци да изпратят състоянието си.
      this.channel.postMessage({ type: "request-state" });
      this.broadcastState();
    }
    this.emit("status", "connected" satisfies SyncStatus);
    this.emit("synced", true);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "broadcast-channel") return; // да не отразяваме получено обратно
    this.channel?.postMessage({ type: "update", update: Array.from(update) });
  };

  private onAwarenessUpdate = () => {
    const states = Array.from(this.awareness.getStates().entries());
    this.channel?.postMessage({
      type: "awareness",
      clientId: this.awareness.clientID,
      state: this.awareness.getLocalState(),
      states: states.length,
    });
  };

  private broadcastState(): void {
    this.channel?.postMessage({
      type: "update",
      update: Array.from(Y.encodeStateAsUpdate(this.doc)),
    });
  }

  private onMessage(data: { type: string; update?: number[]; clientId?: number; state?: unknown }): void {
    if (data.type === "request-state") {
      this.broadcastState();
    } else if (data.type === "update" && data.update) {
      Y.applyUpdate(this.doc, new Uint8Array(data.update), "broadcast-channel");
    } else if (data.type === "awareness" && typeof data.clientId === "number") {
      // Присъствието на другия прозорец се вписва директно в локалното състояние.
      const meta = this.awareness.meta;
      const states = this.awareness.getStates();
      if (data.state) {
        states.set(data.clientId, data.state as Record<string, unknown>);
        meta.set(data.clientId, { clock: 0, lastUpdated: Date.now() });
      } else {
        states.delete(data.clientId);
      }
      this.awareness.emit("change", [
        { added: [], updated: [data.clientId], removed: [] },
        "broadcast-channel",
      ]);
    }
  }

  destroy(): void {
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.channel?.close();
    this.awareness.destroy();
    this.listeners.clear();
  }

  on(event: "status" | "synced", cb: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: "status" | "synced", cb: Listener): void {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export interface LiveblocksProviderOptions {
  publicApiKey: string;
  roomId: string;
  doc: Y.Doc;
}

// ---------------------------------------------------------------------------
// Една връзка на стая, с преброяване на ползвателите.
//
// React монтира ефектите два пъти в режим на разработка (StrictMode), а също
// и при всяко повторно монтиране на компонента. Ако всяко монтиране си създава
// нов провайдър, почистването на първото прекъсва абонаментите на второто и
// документът спира да се синхронизира, макар присъствието да продължава да
// работи - точно това се случваше. Затова връзката е обща и се затваря чак
// когато последният ползвател я освободи.
// ---------------------------------------------------------------------------

interface Connection {
  /** Пази се самото обещание, а не готовият провайдър: двете монтирания
   *  тръгват едновременно и ако чакахме създаването да завърши, всяко щеше
   *  да си направи собствена връзка. */
  promise: Promise<SyncProvider>;
  refs: number;
  closing: ReturnType<typeof setTimeout> | null;
}

const connections = new Map<string, Connection>();

/** Взима (или създава) връзката за дадена стая. */
export function acquireProvider(
  roomId: string,
  create: () => Promise<SyncProvider> | SyncProvider,
): Promise<SyncProvider> {
  const existing = connections.get(roomId);
  if (existing) {
    if (existing.closing) {
      clearTimeout(existing.closing);
      existing.closing = null;
    }
    existing.refs++;
    return existing.promise;
  }

  const entry: Connection = {
    promise: Promise.resolve().then(create),
    refs: 1,
    closing: null,
  };
  connections.set(roomId, entry);
  // ако създаването се провали, махаме записа, за да може да се опита пак
  entry.promise.catch(() => connections.delete(roomId));
  return entry.promise;
}

/** Освобождава връзката; затваря я само ако никой друг не я ползва. */
export function releaseProvider(roomId: string): void {
  const entry = connections.get(roomId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0 || entry.closing) return;

  // Кратко изчакване, за да преживее двойното монтиране: ако веднага се появи
  // нов ползвател, връзката не се къса излишно.
  entry.closing = setTimeout(() => {
    if (entry.refs <= 0) {
      void entry.promise.then((p) => p.destroy()).catch(() => {});
      connections.delete(roomId);
    } else {
      entry.closing = null;
    }
  }, 1000);
}

/**
 * Обвивка около @liveblocks/client + @liveblocks/yjs (вж. PLAN.md §2.1).
 * Заредена динамично, за да не наказваме локалната разработка (Фаза 1)
 * с мрежов клиент, който не се ползва.
 */
export async function createLiveblocksProvider(
  opts: LiveblocksProviderOptions,
): Promise<SyncProvider> {
  const { createClient } = await import("@liveblocks/client");
  const { LiveblocksYjsProvider } = await import("@liveblocks/yjs");

  const client = createClient({ publicApiKey: opts.publicApiKey });
  const { room, leave } = client.enterRoom(opts.roomId, {
    initialPresence: {},
  });

  const lbProvider = new LiveblocksYjsProvider(room as any, opts.doc);

  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload: unknown) =>
    listeners.get(event)?.forEach((cb) => cb(payload));

  // Liveblocks дава YjsSyncStatus: "loading" | "synchronizing" | "synchronized".
  // Това НЕ са имената, които ползва останалата част от приложението, затова се превеждат тук.
  lbProvider.on("status", (status: string) => {
    const mapped: SyncStatus =
      status === "synchronized" || status === "synchronizing" ? "connected" : "connecting";
    emit("status", mapped);
  });
  lbProvider.on("sync", (synced: boolean) => emit("synced", synced));

  // Истинското състояние на връзката идва от самата стая (а не от синхронизацията
  // на документа) — то показва дали има мрежа изобщо.
  room.subscribe("status", (roomStatus: string) => {
    const mapped: SyncStatus =
      roomStatus === "connected"
        ? "connected"
        : roomStatus === "connecting" || roomStatus === "reconnecting" || roomStatus === "initial"
          ? "connecting"
          : "disconnected";
    emit("status", mapped);
  });

  return {
    awareness: lbProvider.awareness as unknown as Awareness,
    connect() {
      // LiveblocksYjsProvider се свързва автоматично при създаване.
    },
    destroy() {
      lbProvider.destroy();
      leave();
      listeners.clear();
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
  };
}
