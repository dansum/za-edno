import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import {
  createMindMapDoc,
  ensureRootSides,
  ensureStyleMigrated,
  getAllSnapshots,
  getStylesArray,
  reattachOrphans,
} from "../model/doc";
import type { NodeSnapshot } from "../model/doc";
import { attachLocalPersistence } from "../sync/persistence";
import { AutoSnapshotter } from "../history/snapshots";
import {
  LocalOnlyProvider,
  acquireProvider,
  createLiveblocksProvider,
  releaseProvider,
} from "../sync/provider";
import type { SyncProvider, SyncStatus } from "../sync/provider";

const LIVEBLOCKS_PUBLIC_KEY = import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY as string | undefined;

export interface YDocState {
  doc: Y.Doc;
  provider: SyncProvider | null;
  status: SyncStatus;
  nodes: Record<string, NodeSnapshot>;
  authorName: string;
  setAuthorName: (name: string) => void;
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
  const docRef = useRef<Y.Doc | undefined>(undefined);
  if (!docRef.current) docRef.current = createMindMapDoc();
  const doc = docRef.current;

  const [nodes, setNodes] = useState<Record<string, NodeSnapshot>>(() => getAllSnapshots(doc));
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [provider, setProvider] = useState<SyncProvider | null>(null);
  const [authorName, setAuthorNameState] = useState<string>(loadAuthorName);
  const authorNameRef = useRef(authorName);
  authorNameRef.current = authorName;

  useEffect(() => {
    const nodesMap = doc.getMap("nodes");
    const stylesArray = getStylesArray(doc);
    const onUpdate = () => {
      reattachOrphans(doc, "auto-reattach");
      ensureRootSides(doc, "assign-sides");
      ensureStyleMigrated(doc, "migrate-style");
      setNodes(getAllSnapshots(doc));
    };
    nodesMap.observeDeep(onUpdate);
    // Стилът живее в отделен Y.Array (вж. model/doc.ts) - трябва отделно наблюдение,
    // иначе промени само в стила (без промяна на "nodes") не презареждат UI-я.
    stylesArray.observeDeep(onUpdate);

    const persistence = attachLocalPersistence(doc, roomId);
    const snapshotter = new AutoSnapshotter(doc, () => authorNameRef.current);
    snapshotter.start();

    let cancelled = false;
    let acquired = false;

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
      p.on("status", (s) => setStatus(s as SyncStatus));
      setProvider(p);
      setStatus("connected");
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
      persistence.destroy();
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

  return { doc, provider, status, nodes, authorName, setAuthorName };
}
