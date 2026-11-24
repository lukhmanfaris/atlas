/** Shared by the API and the editor so both agree on every sen. */

export type TotalsLine = {
  quantityMilli: number;
  unitPriceSen: number;
  discountSen: number;
};

function halfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/** round_half_up(quantity_milli * unit_price_sen / 1000) */
export function grossLineSen(quantityMilli: number, unitPriceSen: number): number {
  const product = quantityMilli * unitPriceSen;
  if (!Number.isSafeInteger(product)) {
    throw new Error("Line amount is too large");
  }
  return halfUpDiv(product, 1000);
}

export function lineTotalSen(line: TotalsLine): number {
  const gross = grossLineSen(line.quantityMilli, line.unitPriceSen);
  return Math.max(0, gross - Math.max(0, line.discountSen));
}

export type ComputedTotals = {
  lineTotalsSen: number[];
  subtotalSen: number;
  totalSen: number;
};

export function computeTotals(
  lines: TotalsLine[],
  documentDiscountSen = 0,
  taxSen = 0,
): ComputedTotals {
  const lineTotalsSen = lines.map(lineTotalSen);
  const subtotalSen = lineTotalsSen.reduce((sum, value) => sum + value, 0);
  const totalSen = Math.max(
    0,
    subtotalSen - Math.max(0, documentDiscountSen) + Math.max(0, taxSen),
  );
  return { lineTotalsSen, subtotalSen, totalSen };
}
