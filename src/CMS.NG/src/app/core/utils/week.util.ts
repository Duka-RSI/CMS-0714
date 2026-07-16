/**
 * Date helpers for the FeaturedPromoItem board. Weeks run Monday–Sunday, matching the
 * API's own snapping (FeaturedPromoItemQuery.MondayOf).
 *
 * Everything here works in LOCAL time on purpose: ScheduleOn is a SQL `date` with no
 * zone, so going through Date#toISOString (UTC) would shift the day for anyone east or
 * west of UTC and land rows under the wrong weekday.
 */

/** Weekday labels indexed Monday..Sunday, as the mockups show them: 3/16 (一). */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** Format a Date as 'YYYY-MM-DD' in local time (the wire format for DateOnly). */
export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse a 'YYYY-MM-DD' wire value into a local-time Date at midnight. */
export function fromIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The Monday on or before `date`. Sunday belongs to the week that just ended. */
export function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  return addDays(monday, -((monday.getDay() + 6) % 7));
}

/** '3/16' — the compact form used in the week navigator. */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** Monday-based weekday index (0 = Monday .. 6 = Sunday). */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** '3/16 (一)' — the day-group header. */
export function formatDayLabel(date: Date): string {
  return `${formatShortDate(date)} (${WEEKDAY_LABELS[weekdayIndex(date)]})`;
}
