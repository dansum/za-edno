import { describe, expect, it } from "vitest";
import { generateRoomId } from "./roomId";

describe("generateRoomId", () => {
  it("по подразбиране дава 5 знака от четимата азбука", () => {
    const id = generateRoomId();
    expect(id).toHaveLength(5);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  });

  it("не съдържа лесно объркваеми знаци (0/1/l/i/o)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomId()).not.toMatch(/[01lio]/);
    }
  });

  it("зачита подадена дължина", () => {
    expect(generateRoomId(8)).toHaveLength(8);
  });
});
