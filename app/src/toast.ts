// Видими, кратковременни съобщения (§8.16): провал на внос/износ, прекъсната
// мрежа, отказано местене. Нарочно без context/проп-прокарване през всички
// компоненти - прост pub/sub, извикваем от всяко място в кода.

export type ToastKind = "error" | "info";

export interface ToastMsg {
  id: string;
  kind: ToastKind;
  text: string;
}

type Listener = (msg: ToastMsg) => void;
const listeners = new Set<Listener>();

export function notify(text: string, kind: ToastKind = "error"): void {
  const msg: ToastMsg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, text };
  listeners.forEach((l) => l(msg));
}

export function subscribeToasts(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
