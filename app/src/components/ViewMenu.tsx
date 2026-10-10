import { ROOT_ID } from "../model/doc";
import type { CanvasHandle } from "./MindMapCanvas";
import { useT } from "../i18n/useLanguage";
import { PAN_STEP_PX } from "../panStep";
import { useDropdownMenu } from "../hooks/useDropdownMenu";

export function ViewMenu({
  canvasRef,
  onOutline,
}: {
  canvasRef: React.MutableRefObject<CanvasHandle | null>;
  onOutline: () => void;
}) {
  const t = useT();
  const { open, toggle, close, rootRef, triggerRef } = useDropdownMenu();

  function centerRoot() {
    canvasRef.current?.focusNode(ROOT_ID);
    close();
  }

  // "Надясно" означава да се разкрие съдържание вдясно - самото платно се
  // отмества наляво на екрана, затова знакът на dx/dy е обратен на посоката
  // в надписа на бутона (както при бутоните за преместване в картите).
  function pan(dx: number, dy: number) {
    canvasRef.current?.panBy(dx, dy);
    close();
  }

  return (
    <div className="file-menu" ref={rootRef}>
      <button ref={triggerRef} onClick={toggle} aria-haspopup="true" aria-expanded={open}>
        {t.viewMenu}
      </button>
      {open && (
        <div className="file-menu-dropdown" data-menu-items>
          <button
            onClick={() => {
              onOutline();
              close();
            }}
          >
            {t.outline}
          </button>
          <hr />
          <button onClick={centerRoot}>{t.viewCenterRoot}</button>
          <hr />
          <button onClick={() => pan(PAN_STEP_PX, 0)}>{t.viewPanLeft}</button>
          <button onClick={() => pan(-PAN_STEP_PX, 0)}>{t.viewPanRight}</button>
          <button onClick={() => pan(0, PAN_STEP_PX)}>{t.viewPanUp}</button>
          <button onClick={() => pan(0, -PAN_STEP_PX)}>{t.viewPanDown}</button>
        </div>
      )}
    </div>
  );
}
