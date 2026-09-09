// Зоните при пускане на влачена клетка (§8.13).
import { describe, expect, it } from "vitest";
import { dropZoneAt } from "./dropZone";

const rect = { left: 100, top: 200, width: 90, height: 36 };

describe("dropZoneAt", () => {
  it("дясната трета прави влачената клетка дете", () => {
    // 100 + 60 = 160 е началото на дясната трета
    expect(dropZoneAt(rect, 165, 210)).toBe("child");
    expect(dropZoneAt(rect, 189, 230)).toBe("child");
    // дясната трета важи независимо от височината
    expect(dropZoneAt(rect, 165, 235)).toBe("child");
  });

  it("горната част на левите две трети слага брат НАД целевата", () => {
    expect(dropZoneAt(rect, 105, 205)).toBe("before"); // горе вляво
    expect(dropZoneAt(rect, 140, 210)).toBe("before"); // горе в средата
  });

  it("долната част на левите две трети слага брат ПОД целевата", () => {
    expect(dropZoneAt(rect, 105, 230)).toBe("after"); // долу вляво
    expect(dropZoneAt(rect, 140, 225)).toBe("after"); // долу в средата
  });

  it("границата по средата на височината дели над от под", () => {
    expect(dropZoneAt(rect, 110, 217)).toBe("before"); // малко над средата (218)
    expect(dropZoneAt(rect, 110, 218)).toBe("after"); // точно на средата и надолу
  });
});
