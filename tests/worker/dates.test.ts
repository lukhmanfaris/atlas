import { describe, expect, it } from "vitest";

import { formatBusinessDate, formatMalaysiaTimestamp } from "@/shared/dates";

describe("date display", () => {
  it("shows a business date as DD/MM/YYYY", () => {
    expect(formatBusinessDate("2026-11-01")).toBe("01/11/2026");
    expect(formatBusinessDate("2027-01-31")).toBe("31/01/2027");
  });

  it("shows a dash when there is no date", () => {
    expect(formatBusinessDate(null)).toBe("—");
    expect(formatBusinessDate(undefined)).toBe("—");
    expect(formatBusinessDate("")).toBe("—");
  });

  it("leaves anything that is not YYYY-MM-DD unchanged", () => {
    expect(formatBusinessDate("soon")).toBe("soon");
  });

  it("shows a timestamp as DD/MM/YYYY HH:MM in Malaysia time", () => {
    // 2026-11-25 08:48 UTC is 16:48 in Malaysia (UTC+8).
    expect(formatMalaysiaTimestamp(Date.UTC(2026, 10, 25, 8, 48))).toBe("25/11/2026 16:48");
    // 2026-12-31 20:05 UTC is already 1 January in Malaysia.
    expect(formatMalaysiaTimestamp(Date.UTC(2026, 11, 31, 20, 5))).toBe("01/01/2027 04:05");
  });
});
