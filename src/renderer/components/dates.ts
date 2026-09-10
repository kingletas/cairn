/** Dates a person reads. */

const DAY = 86_400_000;

/** A stored value naming a calendar day rather than a moment. A due date is written
 *  by a date field and carries no time; an application's timestamp does. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local midnight that starts the day a stored value names.
 *  A date-only string is a calendar day and has to be read as one: `new Date('2026-08-11')`
 *  is UTC midnight, which is the 10th anywhere west of Greenwich, so every date drew a
 *  day early. Anything carrying a time is a moment and stays one. */
export function startOfStoredDay(iso: string): number | null {
  const named = DATE_ONLY.exec(iso.trim());
  if (named) {
    return new Date(Number(named[1]), Number(named[2]) - 1, Number(named[3])).getTime();
  }
  const moment = Date.parse(iso);
  return Number.isFinite(moment) ? startOfDay(new Date(moment)) : null;
}

/** Which cell on a calendar a stored value belongs in. */
export function dayKey(iso: string): string | null {
  const start = startOfStoredDay(iso);
  if (start === null) return null;
  return keyOf(new Date(start));
}

/** The same key, for a date the grid already holds. */
export function keyOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Whole days between a stored value and now, positive for the future. */
export function daysFromToday(iso: string, now = new Date()): number | null {
  const start = startOfStoredDay(iso);
  if (start === null) return null;
  return Math.round((start - startOfDay(now)) / DAY);
}

/** "Today", "Tomorrow", "Overdue by 3 days", or a short date.
 *  A weekday inside the week carries its date too: "Friday" alone leaves the reader
 *  asking which one, and it is the interview screen that asks it loudest. */
export function readableDue(iso: string | null, now = new Date()): string {
  if (iso === null) return 'No date set';
  const days = daysFromToday(iso, now);
  if (days === null) return 'No date set';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < -1) return `Overdue by ${Math.abs(days)} days`;

  const start = startOfStoredDay(iso) ?? 0;
  const short = new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return days < 7
    ? `${new Date(start).toLocaleDateString(undefined, { weekday: 'long' })} ${short}`
    : short;
}

/** A stored day, written the way every other date in the app is written.
 *  `9/7/2026` is two dates in two countries, and it was on the screen with the most
 *  of them. The year is only said when it is not this one. */
export function readableDate(iso: string | null, now = new Date()): string {
  if (iso === null) return '—';
  const start = startOfStoredDay(iso);
  if (start === null) return '—';
  const when = new Date(start);
  return when.toLocaleDateString(undefined, when.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Due today, or past it. */
export function isDueToday(iso: string | null, now = new Date()): boolean {
  if (iso === null) return false;
  const days = daysFromToday(iso, now);
  return days !== null && days <= 0;
}
