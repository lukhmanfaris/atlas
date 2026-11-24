import { describe, expect, it } from "vitest";

import { amountInWords } from "@/worker/services/amount-in-words";
import { addDays, todayInMalaysia } from "@/worker/services/dates";
import { computeTotals, grossLineSen, lineTotalSen } from "@/worker/services/totals";

describe("line totals", () => {
  it("multiplies thousandths by sen and rounds half up", () => {
    expect(grossLineSen(2500, 2350)).toBe(5875);
    expect(grossLineSen(1500, 333)).toBe(500); // 499.5 rounds up
    expect(grossLineSen(1, 1)).toBe(0); // 0.001 rounds down
    expect(grossLineSen(999, 1)).toBe(1); // 0.999 rounds up
    expect(grossLineSen(1000, 0)).toBe(0);
  });

  it("subtracts the line discount and never goes below zero", () => {
    expect(lineTotalSen({ quantityMilli: 1000, unitPriceSen: 1000, discountSen: 250 })).toBe(750);
    expect(lineTotalSen({ quantityMilli: 1000, unitPriceSen: 1000, discountSen: 5000 })).toBe(0);
  });

  it("sums rounded lines, not the unrounded total", () => {
    const lines = [
      { quantityMilli: 1500, unitPriceSen: 333, discountSen: 0 }, // 500
      { quantityMilli: 1500, unitPriceSen: 333, discountSen: 0 }, // 500
    ];
    expect(computeTotals(lines)).toEqual({
      lineTotalsSen: [500, 500],
      subtotalSen: 1000,
      totalSen: 1000,
    });
  });

  it("applies a whole-document discount and clamps at zero", () => {
    const lines = [{ quantityMilli: 1000, unitPriceSen: 1000, discountSen: 0 }];
    expect(computeTotals(lines, 300).totalSen).toBe(700);
    expect(computeTotals(lines, 5000).totalSen).toBe(0);
  });
});

describe("amount in words", () => {
  it("writes ringgit and sen", () => {
    expect(amountInWords(125050)).toBe(
      "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED FIFTY AND SEN FIFTY ONLY",
    );
    expect(amountInWords(125000)).toBe("RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED FIFTY ONLY");
    expect(amountInWords(0)).toBe("RINGGIT MALAYSIA ZERO ONLY");
    expect(amountInWords(1005)).toBe("RINGGIT MALAYSIA TEN AND SEN FIVE ONLY");
    expect(amountInWords(123456789)).toBe(
      "RINGGIT MALAYSIA ONE MILLION TWO HUNDRED THIRTY FOUR THOUSAND FIVE HUNDRED SIXTY SEVEN AND SEN EIGHTY NINE ONLY",
    );
  });
});

describe("business dates", () => {
  it("adds days without time zones", () => {
    expect(addDays("2026-11-24", 30)).toBe("2026-12-24");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("uses Malaysia time", () => {
    expect(todayInMalaysia(Date.parse("2026-11-24T16:30:00Z"))).toBe("2026-11-25");
  });
});
