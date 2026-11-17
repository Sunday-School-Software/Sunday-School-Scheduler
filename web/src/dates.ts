const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

// A YYYY-MM-DD date from the API, such as "2026-11-22", as "November 22, 2026".
// The date is a day on the calendar, not a moment, so this formats midnight UTC
// on that day in UTC. Formatting it in the browser's time zone would show the
// day before anywhere west of UTC.
export function formatDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}
