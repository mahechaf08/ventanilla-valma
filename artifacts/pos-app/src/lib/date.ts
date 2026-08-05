/** Local calendar day as YYYY-MM-DD */
export function toDateKey(input: Date | string = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
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

/** Monday of the week containing `ref` (local) */
export function startOfWeekDateKey(ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return toDateKey(d);
}

export function startOfMonthDateKey(ref = new Date()): string {
  return toDateKey(new Date(ref.getFullYear(), ref.getMonth(), 1));
}

export function dateKeyMatches(iso: string, dateKey: string): boolean {
  return toDateKey(iso) === dateKey;
}

export function isSameLocalDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}
