// Collection dates are YYYY-MM-DD in Europe/London. Timestamps are ISO 8601 UTC.

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in London, as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Tuesday 23 December" */
export function formatCollectionDate(date: string, opts: { year?: boolean; short?: boolean } = {}): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: opts.short ? "short" : "long",
    day: "numeric",
    month: opts.short ? "short" : "long",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(d);
}

/** "5 December 2026 at 23:59" in London time. */
export function formatLondonDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} at ${time}`;
}

export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
