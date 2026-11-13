// Dates as YYYY-MM-DD strings, the format docs/data-model.md stores and sorts.
// They use the machine's local date, the "server's date" that the dashboard's
// 28-day window is measured from (#37).

// The next `count` Sundays, counting today if it's a Sunday.
export function nextSundays(today: Date, count: number): string[] {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  day.setDate(day.getDate() + ((7 - day.getDay()) % 7));

  const sundays: string[] = [];
  for (let i = 0; i < count; i++) {
    sundays.push(localDate(day));
    day.setDate(day.getDate() + 7);
  }
  return sundays;
}

// A date as YYYY-MM-DD in the machine's local time zone. toISOString() would
// give the UTC date, which is a day off in the evening in the Americas.
export function localDate(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}
