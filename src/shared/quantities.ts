/** Quantities are integer thousandths: "2.5" -> 2500. */

export function qtyToMilli(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(milli) ? milli : null;
}

export function milliToQty(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(Math.abs(milli % 1000)).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
