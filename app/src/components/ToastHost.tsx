import { useEffect, useState } from "react";
import { subscribeToasts } from "../toast";
import type { ToastMsg } from "../toast";

const TTL_MS = 5000;

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    return subscribeToasts((msg) => {
      setItems((cur) => [...cur, msg]);
      setTimeout(() => setItems((cur) => cur.filter((m) => m.id !== msg.id)), TTL_MS);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((m) => (
        <div key={m.id} className={`toast toast-${m.kind}`}>
          {m.text}
          <button
            className="toast-close"
            aria-label="×"
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== m.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
