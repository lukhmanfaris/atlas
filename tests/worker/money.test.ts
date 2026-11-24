import { describe, expect, it } from "vitest";

import { ringgitToSen, senToRinggit } from "@/shared/items";

describe("ringgit to sen conversion", () => {
  it.each([
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["0.01", 1],
    ["1234.56", 123456],
    ["  7.05  ", 705],
  ])("converts %s to %i sen", (input, expected) => {
    expect(ringgitToSen(input)).toBe(expected);
  });

  it.each(["", "abc", "-1", "1.234", "1,000", "12."])("rejects %s", (input) => {
    expect(ringgitToSen(input)).toBeNull();
  });

  it("round-trips whole sen without floating point drift", () => {
    expect(senToRinggit(ringgitToSen("1234.56") ?? 0)).toBe("1234.56");
    expect(senToRinggit(1250)).toBe("12.50");
    expect(senToRinggit(0)).toBe("0.00");
  });
});
