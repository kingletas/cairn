/** The month, with everything dated on it. */

import { clear, el, on } from '../components/dom.js';
import { goTo } from './app.js';
import type { DatedThing, Settings } from '../../shared/types.js';
import { dayKey, keyOf } from '../components/dates.js';

const WEEKDAYS_MONDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One entry on a day. A deadline you can see and cannot open is a dead end, so every
 *  chip names a role and pressing it goes to that role rather than to a screen. */
function chipFor(thing: DatedThing): HTMLElement {
  const chip = el('button', {
    class: `calthing ${thing.kind}`, type: 'button',
    title: thing.detail ?? thing.title,
    style: thing.stage ? `--stage: var(--stage-${thing.stage})` : '',
  }, thing.title);
  if (thing.opportunityId !== null) {
    const to = thing.kind === 'interview' ? 'interviews'
      : thing.kind === 'sent' ? 'applications' : 'pipeline';
    const target = thing.opportunityId;
    on(chip, 'click', () => goTo(to, target));
  }
  return chip;
}

function grid(year: number, month: number, weekStartsOn: Settings['weekStartsOn']): Date[][] {
  const first = new Date(year, month, 1);
  const offset = weekStartsOn === 'monday' ? (first.getDay() + 6) % 7 : first.getDay();
  const cursor = new Date(year, month, 1 - offset);
  const weeks: Date[][] = [];
  // Six rows always: a grid that changes height between months makes everything
  // below it jump.
  for (let week = 0; week < 6; week += 1) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

export async function renderCalendar(body: HTMLElement, settings: Settings): Promise<void> {
  const things = await window.cairn.calendar.things();
  const byDay = new Map<string, DatedThing[]>();
  for (const thing of things) {
    const cell = dayKey(thing.at);
    if (cell === null) continue;
    byDay.set(cell, [...(byDay.get(cell) ?? []), thing]);
  }

  const today = new Date();
  let shown = new Date(today.getFullYear(), today.getMonth(), 1);
  const container = el('div', { class: 'calwrap' });

  const draw = (): void => {
    clear(container);
    const heading = el('div', { class: 'calbar' },
      el('h2', {}, shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));

    // The same two arrows as every other list. "This month" stays a word, because it
    // is a place rather than a direction.
    const back = el('button', {
      class: 'btn step step-back', type: 'button', 'aria-label': 'Previous', title: 'Previous',
    });
    const now = el('button', { class: 'btn', type: 'button' }, 'This month');
    const forward = el('button', {
      class: 'btn step step-on', type: 'button', 'aria-label': 'Next', title: 'Next',
    });
    on(back, 'click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1); draw(); });
    on(now, 'click', () => { shown = new Date(today.getFullYear(), today.getMonth(), 1); draw(); });
    on(forward, 'click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1); draw(); });
    heading.append(el('div', { class: 'calnav' }, back, now, forward));
    container.append(heading);

    const names = settings.weekStartsOn === 'monday' ? WEEKDAYS_MONDAY : WEEKDAYS_SUNDAY;
    const head = el('div', { class: 'calhead' }, ...names.map((n) => el('span', {}, n)));
    const cells = el('div', { class: 'calgrid' });

    for (const week of grid(shown.getFullYear(), shown.getMonth(), settings.weekStartsOn)) {
      for (const day of week) {
        const outside = day.getMonth() !== shown.getMonth();
        const isToday = keyOf(day) === keyOf(today);
        const cell = el('div', {
          class: `calday${outside ? ' outside' : ''}${isToday ? ' today' : ''}`,
        }, el('span', { class: 'daynum' }, String(day.getDate())));

        const onThisDay = byDay.get(keyOf(day)) ?? [];
        // A cell that grows to fit everything turns a month into forty thousand pixels.
        // Four, and then a count that opens the rest of that day.
        const SHOWN = 4;
        const first = onThisDay.slice(0, SHOWN);
        for (const thing of first) cell.append(chipFor(thing));
        if (onThisDay.length > first.length) {
          const rest = onThisDay.length - first.length;
          const more = el('button', { class: 'calmore', type: 'button' }, `${rest} more`);
          on(more, 'click', () => {
            more.remove();
            for (const thing of onThisDay.slice(SHOWN)) cell.append(chipFor(thing));
          });
          cell.append(more);
        }
        cells.append(cell);
      }
    }
    container.append(head, cells);
  };

  draw();
  body.append(container);

  if (things.length === 0) {
    body.append(
      el('p', { class: 'lede' },
        'Nothing dated yet. Interviews, the days you applied, and anything you have given a ' +
        'deadline all appear here on their own.'),
    );
  }
}
