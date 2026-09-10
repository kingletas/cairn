/** Applications: what you sent, when, and what came back. */

import { clear, el, on } from '../components/dom.js';
import { goTo, refresh } from './app.js';
import { scheduleInterview } from '../components/schedule-interview.js';
import type { DocumentRecord, Opportunity, TimelineEvent } from '../../shared/types.js';
import { CHANNELS } from '../../shared/types.js';
import { daysFromToday, readableDate, readableDue } from '../components/dates.js';
import { inBatches, paged, type BulkChoice, type Page, type PageSize } from '../components/paged.js';
import { sections } from '../components/sections.js';
import { narrowingBar } from '../components/narrowing.js';
import { narrow, WHOLE_LIST, type Narrowing } from '../../shared/band.js';
import * as mask from '../mask.js';

interface Row {
  opportunity: Opportunity;
  lastEvent: TimelineEvent | null;
  resume: DocumentRecord | null;
  resumeReplaced: boolean;
}

const EVENT_LABEL: Record<TimelineEvent['kind'], string> = {
  applied: 'Sent', reply: 'They replied', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn', note: 'Note',
};

/** What to offer next, given where a role has got to. Showing every possible event on
 *  every row makes the one that matters harder to find. */
const NEXT_EVENTS: Record<string, TimelineEvent['kind'][]> = {
  applied: ['reply', 'interview', 'rejected'],
  interviewing: ['interview', 'offer', 'rejected'],
  decision: ['offer', 'rejected', 'withdrawn'],
};

type Group = 'all' | 'waiting' | 'heard' | 'ended';

/** Which list is open, which page of it, and what it is narrowed to, kept for the life
 *  of the window. */
let showing: Group = 'all';
const page: Page = { at: 0 };
const chosen = new Set<string>();
let size: PageSize = 20;
let narrowing: Narrowing = { ...WHOLE_LIST };

function silentFor(row: Row, now = new Date()): number | null {
  const since = row.lastEvent?.at ?? row.opportunity.appliedAt;
  if (since === null || since === undefined) return null;
  const days = daysFromToday(since, now);
  return days === null ? null : Math.max(0, -days);
}

export async function renderApplications(body: HTMLElement): Promise<void> {
  const [all, settings, profile] = await Promise.all([
    window.cairn.applications.list(),
    window.cairn.settings.get(),
    window.cairn.profile.get(),
  ]);
  // Board is the pipeline's alone, so a saved board falls back to a list here.
  let layout: 'list' | 'grid' = settings.listLayout;

  if (all.length === 0) {
    body.append(
      el('div', { class: 'empty' },
        el('h2', {}, 'Nothing sent yet'),
        el('p', {},
          'A role appears here once you mark it sent from the pipeline. Cairn records the date, ' +
          'sets a reminder to chase it, and then keeps count of the silence.'),
        goToPipeline()),
    );
    return;
  }

  // Narrowed before the tabs are counted. Counted after, "All 47" would sit above twelve
  // rows -- the same two-numbers-for-one-thing the tab counts were fixed for.
  const rows = narrow(all, narrowing, profile, profile.skills, (row) => row.opportunity);
  body.append(narrowingBar({
    now: narrowing, skills: profile.skills, rules: profile,
    total: all.length, shown: rows.length,
    onChange: (next) => { narrowing = next; page.at = 0; refresh(); },
  }));
  if (rows.length === 0) {
    body.append(el('p', { class: 'lede' }, 'Nothing you sent matches this. Show everything to see them all.'));
    return;
  }

  // Where it got to, as three lists rather than one of 150. An application waiting on
  // an answer and one that ended are different work, and the silence only means
  // something on the first.
  const ended = (r: Row): boolean => r.opportunity.archivedAt !== null;
  const heard = (r: Row): boolean => !ended(r) && r.lastEvent !== null && r.lastEvent.kind !== 'applied';
  const groups = {
    all: rows,
    waiting: rows.filter((r) => !ended(r) && !heard(r)),
    heard: rows.filter(heard),
    ended: rows.filter(ended),
  };
  const answered = rows.filter((r) => r.lastEvent !== null && r.lastEvent.kind !== 'applied').length;
  const rate = rows.length === 0 ? 0 : Math.round((answered / rows.length) * 100);
  // The rail counts what is still open and the first tab counts everything ever sent.
  // Both are right and one word carried them, so the screen says which is which.
  const open = groups.waiting.length + groups.heard.length;

  // Two figures, not four. The other two were the tab counts said a second time and
  // said differently -- "Heard back 58" beside a tab reading "Heard back 17", because
  // one of them counted the ones that had already ended and the other did not.

  /** Follow-ups arrive in batches, because applications go out in them. The two things
   *  a batch decides are how each one travels and which are not worth chasing, and both
   *  were one row at a time. */
  const choices: readonly BulkChoice<Row>[] = [
    {
      id: 'channel',
      label: 'Set how a nudge travels',
      field: { label: 'Channel', options: CHANNELS.map((one) => [one, one] as const) },
      asks: (n, via) => (via === 'none-found'
        ? `Say of ${n} that the search was run and there is no human channel?`
        : `Send a nudge on ${n} by ${via}?`),
      run: (rows, via) => inBatches(rows, (r) => window.cairn.opportunities.save({
        ...r.opportunity, followupChannel: via as Opportunity['followupChannel'],
      })),
    },
    {
      id: 'nodate',
      label: 'Clear the chase date',
      asks: (n) => `Take the chase date off ${n}? A date nobody will act on makes the due list lie.`,
      run: (rows) => inBatches(rows, (r) => window.cairn.opportunities.save({
        ...r.opportunity, nextActionDue: null,
      })),
    },
    {
      id: 'aside',
      label: 'Set aside',
      field: { label: 'Why', placeholder: 'Why — gone quiet, withdrew, took something else…' },
      asks: (n, why) => (why.trim() === ''
        ? `Set aside ${n}? A reason is what tells them apart from rows nobody looked at.`
        : `Set aside ${n}, because ${why.trim()}?`),
      run: (rows, why) => inBatches(rows, (r) =>
        window.cairn.opportunities.archive(r.opportunity.id, why)),
    },
  ];

  const host = el('div', {});
  body.append(host);
  sections({
    body: host,
    label: 'Where it got to',
    showing,
    remember: (id) => { showing = id as Group; page.at = 0; chosen.clear(); },
    defs: ([
      ['all', 'All'], ['waiting', 'Waiting'], ['heard', 'Heard back'], ['ended', 'Ended'],
    ] as const).map(([id, label]) => ({
      id: id as Group,
      label: `${label} ${groups[id].length}`,
      draw: (into: HTMLElement): void => {
        if (groups[id].length === 0) {
          into.append(el('p', { class: 'lede' }, 'Nothing here.'));
          return;
        }
        paged(into, {
          items: groups[id],
          page,
          size,
          note: `${open} still open · ${rate}% answered`,
          // The same choice as the pipeline, minus the board: a column here would be
          // somewhere nothing can be moved to.
          layout: {
            current: layout,
            shapes: ['list', 'grid'],
            onChange: (next) => {
              if (next === 'board') return;
              layout = next;
              void window.cairn.settings.set('listLayout', next);
            },
          },
          onSize: (next) => { size = next; },
          render: (list, shown) => {
            for (const row of shown) list.append(ledgerRow(row, id, layout));
          },
          bulk: {
            keyOf: (row) => row.opportunity.id,
            chosen,
            choices,
            done: () => { refresh(); },
          },
        });
      },
    })),
  });
}

/** One application, in the same shape as a role on the pipeline. It was a table, and a
 *  table needs a header to say what its columns are -- which is how three of them came
 *  to be a word repeated down the page under a heading explaining it. A row says what
 *  it is as it goes. */
function ledgerRow(row: Row, group: Group, layout: 'list' | 'grid'): HTMLElement {
  const { opportunity: o } = row;
  const days = silentFor(row);
  const ended = o.archivedAt !== null;
  const last = row.lastEvent;

  const quiet = ended || days === null
    ? null
    : el('span', { class: days >= 14 ? 'stale' : 'nextsmall' },
        days === 0 ? 'no wait yet' : `${days} ${days === 1 ? 'day' : 'days'} quiet`);

  const detail = el('div', { class: 'appdetail', hidden: true });
  const expand = el('button', { class: 'btn quiet', type: 'button', 'aria-expanded': 'false' }, 'Timeline');
  on(expand, 'click', (event) => {
    event.stopPropagation();
    const open = detail.hidden;
    expand.setAttribute('aria-expanded', String(open));
    detail.hidden = !open;
    if (open && detail.childElementCount === 0) void fillTimeline(detail, o, row);
  });

  const cells = el('div', {
    class: `row appline ${group}${layout === 'grid' ? ' rolecard' : ''}`,
    'data-role': o.id, style: `--stage: var(--stage-${o.stage})`,
  },
    el('span', {}, el('b', {}, mask.company(o.company)), el('small', {}, o.role)),
    el('span', { class: 'when' }, o.appliedAt === null ? '—' : `Sent ${sentOn(o.appliedAt)}`));

  // Only where it varies: in Waiting it is Sent on every row.
  if (group !== 'waiting') {
    cells.append(el('span', {}, el('small', { class: 'nextsmall' },
      last === null ? 'No word yet' : EVENT_LABEL[last.kind])));
  }
  cells.append(el('span', {}, quiet), el('span', { class: 'rowacts' }, expand));

  return el('div', { class: `appwrap${ended ? ' ended' : ''}` }, cells, detail);
}

/** The day it went, read as a day. A timestamp stored at midnight UTC renders as the
 *  day before anywhere west of Greenwich. */
function sentOn(iso: string): string {
  return readableDate(iso);
}

async function fillTimeline(into: HTMLElement, o: Opportunity, row?: Row): Promise<void> {
  if (row !== undefined) {
    // Which file went. A column of "not recorded" says it twenty times and answers
    // nothing; here it is beside the dates it belongs to.
    into.append(el('p', { class: 'sentwith' },
      row.resume === null ? 'No résumé recorded against this one.'
        : `Sent with ${row.resume.title}${row.resumeReplaced ? ' — an earlier version of it' : ''}.`));
  }
  const events = await window.cairn.applications.events(o.id);
  for (const event of events) {
    into.append(
      el('div', { class: 'tl' },
        el('span', { class: 'tlwhen' }, readableDate(event.at)),
        el('span', {}, EVENT_LABEL[event.kind]),
        event.detail ? el('small', {}, event.detail) : null),
    );
  }

  const offer = NEXT_EVENTS[o.stage] ?? ['note'];
  const actions = el('div', { class: 'tlactions' });
  for (const kind of offer) {
    if (kind === 'interview') {
      actions.append(scheduleInterview(o, () => { goTo('interviews'); refresh(); }));
      continue;
    }
    const button = el('button', { class: 'btn', type: 'button' }, EVENT_LABEL[kind]);
    on(button, 'click', () => {
      void window.cairn.applications.addEvent(o.id, kind, null).then(() => { refresh(); });
    });
    actions.append(button);
  }
  into.append(actions);
}

function goToPipeline(): HTMLElement {
  const button = el('button', { class: 'btn', type: 'button' }, 'Go to the pipeline');
  on(button, 'click', () => goTo('pipeline'));
  return button;
}


export { clear, readableDue };
