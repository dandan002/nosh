// Parses the ?from=YYYY-MM-DD&to=YYYY-MM-DD range used by the transaction
// report and its CSV export. `to` is inclusive in the UI and converted to
// an exclusive upper bound here. Dates are interpreted in UTC — restaurants
// don't carry a timezone yet, so "a day" is a UTC day for now.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): { from: string; to: string; fromIso: string; toIso: string } {
  const today = toDateString(now);
  let toDate = to && DATE_RE.test(to) && !Number.isNaN(Date.parse(to)) ? to : today;
  let fromDate =
    from && DATE_RE.test(from) && !Number.isNaN(Date.parse(from))
      ? from
      : toDateString(new Date(Date.parse(toDate) - 6 * DAY_MS));

  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  if (Date.parse(toDate) - Date.parse(fromDate) > MAX_RANGE_DAYS * DAY_MS) {
    fromDate = toDateString(new Date(Date.parse(toDate) - MAX_RANGE_DAYS * DAY_MS));
  }

  return {
    from: fromDate,
    to: toDate,
    fromIso: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
    toIso: new Date(Date.parse(`${toDate}T00:00:00.000Z`) + DAY_MS).toISOString(),
  };
}
