// История на промените върху Yjs — вж. PLAN.md §5.
// Не разчитаме на функция от платен план: пазим снимки на състоянието
// на самия документ (encodeStateAsUpdate), кодирани в base64.

import * as Y from "yjs";

export interface VersionEntry {
  id: string;
  createdAt: number;
  author: string;
  label: string | null; // null = автоматична снимка, низ = именувана
  nodeCount: number;
  update: string; // base64 на Y.encodeStateAsUpdate
}

const MAX_AUTO_SNAPSHOTS = 50;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function getVersionsMap(doc: Y.Doc): Y.Map<VersionEntry> {
  return doc.getMap("versions");
}

export function takeSnapshot(
  doc: Y.Doc,
  author: string,
  label: string | null,
): VersionEntry {
  const update = Y.encodeStateAsUpdate(doc);
  const nodes = doc.getMap("nodes");
  const entry: VersionEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    author,
    label,
    nodeCount: nodes.size,
    update: bytesToBase64(update),
  };

  const versions = getVersionsMap(doc);
  doc.transact(() => {
    versions.set(entry.id, entry);
  }, "snapshot");

  pruneAutoSnapshots(doc);
  return entry;
}

/** Пази последните MAX_AUTO_SNAPSHOTS автоматични снимки; именуваните остават завинаги. */
function pruneAutoSnapshots(doc: Y.Doc): void {
  const versions = getVersionsMap(doc);
  const autoEntries = Array.from(versions.values())
    .filter((v) => v.label === null)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (autoEntries.length <= MAX_AUTO_SNAPSHOTS) return;

  const toRemove = autoEntries.slice(MAX_AUTO_SNAPSHOTS);
  doc.transact(() => {
    for (const v of toRemove) versions.delete(v.id);
  }, "snapshot-prune");
}

export function listVersions(doc: Y.Doc): VersionEntry[] {
  return Array.from(getVersionsMap(doc).values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function nameVersion(doc: Y.Doc, id: string, label: string): void {
  const versions = getVersionsMap(doc);
  const entry = versions.get(id);
  if (!entry) return;
  doc.transact(() => {
    versions.set(id, { ...entry, label });
  }, "snapshot-rename");
}

/**
 * Зарежда снимка в отделен, изолиран Y.Doc — за преглед "само за четене"
 * без да пипа текущия документ (вж. PLAN.md §5).
 */
export function loadSnapshotAsDoc(entry: VersionEntry): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, base64ToBytes(entry.update), "snapshot-preview");
  return doc;
}

/**
 * Прилага снимка върху текущия документ като нова промяна (не изтрива
 * съществуващата история) — възстановяването е обратимо действие.
 */
export function restoreSnapshot(doc: Y.Doc, entry: VersionEntry): void {
  Y.applyUpdate(doc, base64ToBytes(entry.update), "snapshot-restore");
}

/** Проста автоматична подкана за снимка: на всеки N промени или интервал от време. */
export class AutoSnapshotter {
  private changeCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private doc: Y.Doc;
  private getAuthor: () => string;
  private opts: { everyNChanges: number; everyMs: number };

  constructor(
    doc: Y.Doc,
    getAuthor: () => string,
    opts: { everyNChanges?: number; everyMs?: number } = {},
  ) {
    this.doc = doc;
    this.getAuthor = getAuthor;
    const { everyNChanges = 200, everyMs = 5 * 60 * 1000 } = opts;
    this.opts = { everyNChanges, everyMs };
  }

  start(): void {
    this.doc.on("update", this.onUpdate);
    this.timer = setInterval(() => this.maybeSnapshot(), this.opts.everyMs);
  }

  stop(): void {
    this.doc.off("update", this.onUpdate);
    if (this.timer) clearInterval(this.timer);
  }

  private onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (typeof origin === "string" && origin.startsWith("snapshot")) return;
    this.changeCount++;
    if (this.changeCount >= (this.opts.everyNChanges ?? 200)) {
      this.maybeSnapshot();
    }
  };

  private maybeSnapshot(): void {
    if (this.changeCount === 0) return;
    takeSnapshot(this.doc, this.getAuthor(), null);
    this.changeCount = 0;
  }
}
