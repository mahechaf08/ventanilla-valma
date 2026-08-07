/** America/Bogota calendar day as YYYY-MM-DD (Colombia POS standard). */
export function bogotaDateKey(input: Date | string = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return bogotaDateKey(new Date());
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
