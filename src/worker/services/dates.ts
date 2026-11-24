/** Business dates are `YYYY-MM-DD` in Malaysia time (UTC+8, no DST). */

export function todayInMalaysia(now: number = Date.now()): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** Adds whole days to a business date without touching time zones. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const start = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}
