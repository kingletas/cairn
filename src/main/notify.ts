/** What is worth interrupting somebody for, and when it is not.
 *  Pure: given what is due and the clock, it says what to say. Nothing here reaches
 *  Electron, so every rule can be tested without a desktop. */

import type { DatedThing } from '../shared/types.js';

export interface QuietHours {
  /** Minutes from midnight. Equal values mean no quiet hours at all. */
  from: number;
  to: number;
}

/** Whether the clock is inside quiet hours, which wrap past midnight far more often
 *  than they do not -- 22:00 to 08:00 is the ordinary case, not the exception. */
export function isQuiet(now: Date, hours: QuietHours): boolean {
  if (hours.from === hours.to) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  return hours.from < hours.to
    ? minute >= hours.from && minute < hours.to
    : minute >= hours.from || minute < hours.to;
}

/** The same day, in the reader's own timezone rather than in UTC -- a deadline at
 *  23:00 on Friday is Friday to the person it belongs to. */
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface Summary {
  title: string;
  body: string;
}

/** One notice for the day, or none. One rather than one per item: five notifications
 *  about a job search is a channel somebody turns off, and the real one goes with it. */
export function dailySummary(things: readonly DatedThing[], now: Date): Summary | null {
  const today = things.filter((thing) => sameDay(new Date(thing.at), now));
  const overdue = things.filter((thing) => new Date(thing.at) < now && !sameDay(new Date(thing.at), now));
  if (today.length === 0 && overdue.length === 0) return null;

  const interviews = today.filter((thing) => thing.kind === 'interview');
  const parts: string[] = [];
  if (interviews.length > 0) {
    parts.push(`${interviews.length} interview${interviews.length === 1 ? '' : 's'} today`);
  }
  const rest = today.length - interviews.length;
  if (rest > 0) parts.push(`${rest} thing${rest === 1 ? '' : 's'} due today`);
  if (overdue.length > 0) parts.push(`${overdue.length} past due`);

  return {
    title: interviews.length > 0 ? 'An interview today' : 'Something is due',
    body: parts.join(' · '),
  };
}

/** Whether today's notice has already been given. Kept as a date rather than a
 *  timestamp: the question is which day, and a machine asleep past midnight should
 *  still be told once when it wakes. */
export function alreadyTold(lastToldOn: string | null, now: Date): boolean {
  return lastToldOn === now.toISOString().slice(0, 10);
}
