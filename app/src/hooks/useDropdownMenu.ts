import { useCallback, useEffect, useRef, useState } from "react";

const ITEM_SELECTOR = "[data-menu-items] button:not(:disabled)";

/**
 * Общо поведение на падащите менюта в горната лента (§8.20): затваряне при
 * клик извън менюто и навигация със стрелки ВЪТРЕ в менюто.
 *
 * Слушателите са на `window` във фаза „capture", т.е. преди всеки друг -
 * така `stopPropagation` гарантира, че докато менюто е отворено, нито един
 * клавиш не стига до платното (там стрелките местят избраната клетка, а
 * Enter/интервал добавят клетка или сгъват). Естественото действие на
 * клавиша не се спира, затова Enter/интервал върху бутон в менюто го
 * натискат както обикновено.
 */
export function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      e.stopPropagation();
      const items = Array.from(root.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);

      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Home":
        case "End": {
          e.preventDefault();
          if (items.length === 0) return;
          let next: number;
          if (e.key === "Home") next = 0;
          else if (e.key === "End") next = items.length - 1;
          else if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
          else next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
          items[next].focus();
          return;
        }
        case "ArrowLeft":
        case "ArrowRight":
          e.preventDefault();
          return;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        case "Tab":
          setOpen(false);
          return;
      }
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return { open, toggle, close, rootRef, triggerRef };
}
