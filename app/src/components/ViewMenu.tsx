import { useState } from "react";
import { ROOT_ID } from "../model/doc";
import type { CanvasHandle } from "./MindMapCanvas";
import { useT } from "../i18n/useLanguage";

// 1cm = 37.7952755906px по дефиницията на CSS за референтен пиксел (96dpi) -
// не е физически точно на всеки екран, но е стандартният начин да се преведе
// "сантиметър" в уеб контекст (§8.8).
const PAN_STEP_PX = Math.round(2 * 37.7952755906);

export function ViewMenu({ canvasRef }: { canvasRef: React.MutableRefObject<CanvasHandle | null> }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  function centerRoot() {
    canvasRef.current?.focusNode(ROOT_ID);
    setOpen(false);
  }

  // "Надясно" означава да се разкрие съдържание вдясно - самото платно се
  // отмества наляво на екрана, затова знакът на dx/dy е обратен на посоката
  // в надписа на бутона (както при бутоните за преместване в картите).
  function pan(dx: number, dy: number) {
    canvasRef.current?.panBy(dx, dy);
    setOpen(false);
  }

  return (
    <div className="file-menu">
      <button onClick={() => setOpen((v) => !v)}>{t.viewMenu}</button>
      {open && (
        <div className="file-menu-dropdown">
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
