/** Business timezone for Ventanilla Valma (Colombia). */
export const BUSINESS_TIMEZONE = 'America/Bogota';

/**
 * Calendar day as YYYY-MM-DD in America/Bogota.
 * Avoids UTC vs local PC offset hiding sales near midnight.
 */
export function toDateKey(input: Date | string = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return toDateKey(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Parse YYYY-MM-DD as a noon Bogota-safe local Date for arithmetic. */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive day count between two YYYY-MM-DD keys */
export function daysBetweenInclusive(fromKey: string, toKey: string): number {
  const ms = parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** Period of the same length immediately before `fromKey` */
export function previousPeriodRange(
  fromKey: string,
  toKey: string,
): { fromKey: string; toKey: string } {
  const len = daysBetweenInclusive(fromKey, toKey);
  const prevTo = addDaysToDateKey(fromKey, -1);
  const prevFrom = addDaysToDateKey(prevTo, -(len - 1));
  return { fromKey: prevFrom, toKey: prevTo };
}

export function isDateKeyInRange(isoOrKey: string, fromKey: string, toKey: string): boolean {
  const key = isoOrKey.length === 10 && !isoOrKey.includes('T') ? isoOrKey : toDateKey(isoOrKey);
  return key >= fromKey && key <= toKey;
}

/** Monday of the week containing `ref` (Bogota calendar) */
export function startOfWeekDateKey(ref = new Date()): string {
  const key = toDateKey(ref);
  const d = parseDateKey(key);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

export function startOfMonthDateKey(ref = new Date()): string {
  const key = toDateKey(ref);
  const [y, m] = key.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function dateKeyMatches(iso: string, dateKey: string): boolean {
  return toDateKey(iso) === dateKey;
}

export function isSameLocalDay(iso: string, ref = new Date()): boolean {
  return toDateKey(iso) === toDateKey(ref);
}
