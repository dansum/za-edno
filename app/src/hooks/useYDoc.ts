import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  ROOT_ID,
  createMindMapDoc,
  ensureRootSides,
  ensureStyleMigrated,
  getAllLinks,
  getAllSnapshots,
  getLinksMap,
  getStylesArray,
  reattachOrphans,
} from "../model/doc";
import type { LinkInfo, NodeSnapshot } from "../model/doc";
import { attachLocalPersistence } from "../sync/persistence";
import { AutoSnapshotter, purgeLegacyBinarySnapshots } from "../history/snapshots";
import {
  LocalOnlyProvider,
  acquireProvider,
  createLiveblocksProvider,
  releaseProvider,
} from "../sync/provider";
import type { SyncProvider, SyncStatus } from "../sync/provider";
import { touchMyMap } from "../registry/myMaps";
import { notify } from "../toast";
import { useT } from "../i18n/useLanguage";
import { replaceDocWithTree } from "../importExport/freemind";
import type { PlainNode } from "../importExport/freemind";
import { pendingCopyKey } from "../pendingCopy";

const LIVEBLOCKS_PUBLIC_KEY = import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY as string | undefined;

export interface YDocState {
  doc: Y.Doc;
  provider: SyncProvider | null;
  status: SyncStatus;
  nodes: Record<string, NodeSnapshot>;
  links: LinkInfo[];
  authorName: string;
  setAuthorName: (name: string) => void;
  /** Кога за последно е потвърдена връзка със сървъра - `null` преди първата. */
  lastSyncedAt: number | null;
}

function loadAuthorName(): string {
  try {
    const existing = localStorage.getItem("mindmap-author-name");
    if (existing) return existing;
    const generated = randomName();
    localStorage.setItem("mindmap-author-name", generated);
    return generated;
  } catch {
    return randomName();
  }
}

function randomName(): string {
  const adjectives = ["Бърз", "Тих", "Ясен", "Смел", "Весел", "Спокоен"];
  const animals = ["Лисугер", "Бухал", "Мечок", "Заек", "Сокол", "Рис"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${
    animals[Math.floor(Math.random() * animals.length)]
  }`;
}

/** Създава документа веднъж, свързва персистентност и (по избор) Liveblocks. */
export function useYDoc(roomId: string): YDocState {
  const t = useT();
  const docRef = useRef<Y.Doc | undefined>(undefined);
  if (!docRef.current) docRef.current = createMindMapDoc();
  const doc = docRef.current;

  const [nodes, setNodes] = useState<Record<string, NodeSnapshot>>(() => getAllSnapshots(doc));
  const [links, setLinks] = useState<LinkInfo[]>(() => getAllLinks(doc));
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [provider, setProvider] = useState<SyncProvider | null>(null);
  const [authorName, setAuthorNameState] = useState<string>(loadAuthorName);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const authorNameRef = useRef(authorName);
  authorNameRef.current = authorName;
  const lastTitleRef = useRef<string | null>(null);

  useEffect(() => {
    const nodesMap = doc.getMap("nodes");
    const stylesArray = getStylesArray(doc);
    const linksMap = getLinksMap(doc);
    const onUpdate = () => {
      reattachOrphans(doc, "auto-reattach");
      ensureRootSides(doc, "assign-sides");
      ensureStyleMigrated(doc, "migrate-style");
      // Изчиства раздутите снимки от стария формат (§8.11) - те идват със
      // синхронизацията, затова проверката е тук, а не само при монтиране.
      purgeLegacyBinarySnapshots(doc);
      const snapshots = getAllSnapshots(doc);
      setNodes(snapshots);
      setLinks(getAllLinks(doc));
      // Таблото (admin.html, §8.3) показва централната тема като заглавие -
      // записваме само когато наистина се е променила, не при всяка редакция.
      const title = snapshots[ROOT_ID]?.text ?? "";
      if (title !== lastTitleRef.current) {
        lastTitleRef.current = title;
        touchMyMap(roomId, title);
      }
    };
    nodesMap.observeDeep(onUpdate);
    // Стилът живее в отделен Y.Array (вж. model/doc.ts) - трябва отделно наблюдение,
    // иначе промени само в стила (без промяна на "nodes") не презареждат UI-я.
    stylesArray.observeDeep(onUpdate);
    // Връзките (стрелките, §8.2) живеят в собствена Y.Map - същата причина.
    linksMap.observeDeep(onUpdate);

    // "Запази копие в нова стая" (§8.18): ако тази стая е тъкмо новосъздадена
    // за копие, дървото чака в localStorage - прилага се веднъж тук и се
    // маха, за да не се приложи пак при следващо отваряне на същата стая.
    try {
      const key = pendingCopyKey(roomId);
      const pending = localStorage.getItem(key);
      if (pending) {
        replaceDocWithTree(doc, JSON.parse(pending) as PlainNode, "pending-copy");
        localStorage.removeItem(key);
      }
    } catch {
      /* повреден/недостъпен localStorage - просто пропускаме копието */
    }

    // Записва картата в таблото (§8.3) веднага при отваряне - не само при
    // първата промяна, иначе разглеждане без редакция не мести "последно отворена".
    touchMyMap(roomId, getAllSnapshots(doc)[ROOT_ID]?.text ?? "");

    const persistence = attachLocalPersistence(doc, roomId);
    const snapshotter = new AutoSnapshotter(doc, () => authorNameRef.current);
    snapshotter.start();

    let cancelled = false;
    let acquired = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      // Връзката е обща за стаята и се брои по ползватели, за да преживее
      // двойното монтиране на React (вж. коментара в sync/provider.ts).
      const p = await acquireProvider(roomId, async () => {
        if (LIVEBLOCKS_PUBLIC_KEY) {
          try {
            return await createLiveblocksProvider({
              publicApiKey: LIVEBLOCKS_PUBLIC_KEY,
              roomId,
              doc,
            });
          } catch (err) {
            console.error("Неуспешно свързване с Liveblocks, преминаваме към локален режим:", err);
          }
        }
        const local = new LocalOnlyProvider(doc, roomId);
        local.connect();
        return local;
      });
      acquired = true;

      if (cancelled) {
        releaseProvider(roomId);
        return;
      }
      // Ясен офлайн индикатор (§8.4): всеки път, когато статусът потвърждава
      // връзка, отбелязваме момента. Докато е свързан, "опресняваме" го и на
      // ритъм (heartbeat) - без ново редактиране статусът сам по себе си не би
      // пратил събитие, а таймерът в UI-я трябва от какво да брои минутите.
      let lastStatus: SyncStatus | null = null;
      const onStatus = (s: unknown) => {
        // Видимо известие (§8.16) само при ИСТИНСКА промяна - не при
        // първоначалното свързване (lastStatus е null тогава).
        if (lastStatus === "connected" && s === "disconnected") notify(t.networkDisconnected, "error");
        else if (lastStatus === "disconnected" && s === "connected") notify(t.networkReconnected, "info");
        lastStatus = s as SyncStatus;

        setStatus(s as SyncStatus);
        if (s === "connected") {
          setLastSyncedAt(Date.now());
          if (!heartbeat) heartbeat = setInterval(() => setLastSyncedAt(Date.now()), 20_000);
        } else if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };
      p.on("status", onStatus);
      setProvider(p);
      onStatus("connected");
      if (import.meta.env.DEV) {
        // помощ при диагностика в конзолата на браузъра
        (window as unknown as Record<string, unknown>).__mindmap = { doc, provider: p };
      }
    }
    setup();

    return () => {
      cancelled = true;
      nodesMap.unobserveDeep(onUpdate);
      stylesArray.unobserveDeep(onUpdate);
      linksMap.unobserveDeep(onUpdate);
      if (heartbeat) clearInterval(heartbeat);
      persistence?.destroy();
      snapshotter.stop();
      if (acquired) releaseProvider(roomId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, roomId]);

  const setAuthorName = (name: string) => {
    setAuthorNameState(name);
    try {
      localStorage.setItem("mindmap-author-name", name);
    } catch {
      /* localStorage недостъпен - продължаваме без запис */
    }
  };

  return { doc, provider, status, nodes, links, authorName, setAuthorName, lastSyncedAt };
}
