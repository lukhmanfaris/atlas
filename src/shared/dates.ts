const MALAYSIA_OFFSET_MS = 8 * 3_600_000;

/** A YYYY-MM-DD business date shown as DD/MM/YYYY; a dash when there is none. */
export function formatBusinessDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** A Unix-ms timestamp shown as DD/MM/YYYY HH:MM in Malaysia time (UTC+8). */
export function formatMalaysiaTimestamp(at: number): string {
  const iso = new Date(at + MALAYSIA_OFFSET_MS).toISOString();
  return `${formatBusinessDate(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
}
