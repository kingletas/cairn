/** The checks run before an application goes out, and after one has.
 *  Named for the pass a printer or a pilot makes before something irreversible leaves:
 *  every check here is empty in the healthy state, which is what makes it worth
 *  opening. A screen that always has something on it stops being read. */

import { el, on } from '../components/dom.js';
import { inBatches, paged, type BulkChoice, type Page, type PageSize } from '../components/paged.js';
import { sections } from '../components/sections.js';
import { goTo, refresh } from './app.js';
import { CHANNELS, gateState, undrafted, type Opportunity } from '../../shared/types.js';
import { readableDate } from '../components/dates.js';
import * as mask from '../mask.js';

interface Check {
  id: string;
  /** Short enough to be a tab. The long version is what the check is called in the
   *  procedure it came from, and this screen is not the place to recite it. */
  title: string;
  /** What the row is missing, where the title does not already say it. Empty when it
   *  does: a reason repeating the check it came from is the check twice over. */
  says: (o: Opportunity) => string;
  find: (roles: readonly Opportunity[]) => Opportunity[];
  /** A record rather than a task. It has its own tab and stays out of the count, so
   *  importing a hundred applications does not bury the four checks that ask something. */
  advisory?: boolean;
}

const sent = (o: Opportunity): boolean => o.appliedAt !== null && o.archivedAt === null;

export const CHECKS: readonly Check[] = [
  {
    id: 'gate',
    // Nothing to add: the check is named for the state, so a reason would be the title
    // said again beside itself.
    title: 'No gate',
    says: (o) => {
      const state = gateState(o.gate);
      if (state === 'blocked') return 'Blocked — no route to apply';
      if (state !== 'partial') return '';
      const blanks = undrafted(o.gate);
      return blanks.length === 0
        ? 'Part-answered'
        : `Part-answered — ${blanks.length} required ${blanks.length === 1 ? 'box' : 'boxes'} undrafted`;
    },
    find: (roles) => roles.filter((o) => {
      const state = gateState(o.gate);
      return sent(o) && state !== 'run' && state !== 'retrofitted';
    }),
  },
  {
    id: 'concession',
    title: 'Concession owed',
    says: () => 'Owed, and not delivered',
    find: (roles) => roles.filter((o) => sent(o) && o.concession === 'owed'),
  },
  {
    id: 'blocker',
    title: 'Blocked',
    says: (o) => o.blocker ?? 'Something outstanding',
    find: (roles) => roles.filter((o) => o.archivedAt === null
      && o.blocker !== null && !o.blocker.toLowerCase().includes('cleared')),
  },
  {
    id: 'channel',
    title: 'No channel',
    // The title already says which check this is. What it cannot say is when the nudge
    // it has nowhere to send is due.
    says: (o) => `Due ${readableDate(o.nextActionDue)}`,
    find: (roles) => roles.filter((o) => sent(o)
      && o.nextActionDue !== null && o.followupChannel === null),
  },
  {
    id: 'before',
    title: 'Sent before Cairn',
    says: () => 'Recorded, and not something to do',
    find: (roles) => roles.filter((o) => sent(o) && gateState(o.gate) === 'retrofitted'),
    advisory: true,
  },
];

/** What a screenful of findings can be answered with. Each of these is the thing the
 *  check is asking for, applied to more than one row -- which is how they arrive. */
type Finding = { check: Check; role: Opportunity };

/** One role can be out of step in two ways at once, so it is on the screen twice.
 *  Acting on both findings is acting on one role, and doing it twice would write the
 *  same row twice and count it as two. */
function rolesIn(rows: readonly Finding[]): Opportunity[] {
  const seen = new Map<string, Opportunity>();
  for (const { role } of rows) if (!seen.has(role.id)) seen.set(role.id, role);
  return [...seen.values()];
}

const howManyRoles = (rows: readonly Finding[]): number => rolesIn(rows).length;

const FINDING_CHOICES: readonly BulkChoice<Finding>[] = [
  {
    id: 'before',
    label: 'Mark as sent before Cairn',
    counts: howManyRoles,
    asks: (n) => `Say of ${n} that they went out before there was a gate to run? `
      + 'They move to their own tab. Answering the gate on one brings it back.',
    run: (rows) => markBeforeCairn(rolesIn(rows)),
  },
  {
    id: 'channel',
    label: 'Set how a nudge travels',
    counts: howManyRoles,
    field: { label: 'Channel', options: CHANNELS.map((one) => [one, one] as const) },
    asks: (n, via) => (via === 'none-found'
      ? `Say of ${n} that the search was run and there is no human channel?`
      : `Send a nudge on ${n} by ${via}?`),
    run: (rows, via) => inBatches(rolesIn(rows), (role) => window.cairn.opportunities.save({
      ...role, followupChannel: via as Opportunity['followupChannel'],
    })),
  },
  {
    id: 'aside',
    label: 'Set aside',
    counts: howManyRoles,
    field: { label: 'Why', placeholder: 'Why — gone quiet, withdrew, took something else…' },
    asks: (n, why) => (why.trim() === ''
      ? `Set aside ${n}? A reason is what tells them apart from rows nobody looked at.`
      : `Set aside ${n}, because ${why.trim()}?`),
    run: (rows, why) => inBatches(rolesIn(rows), (role) =>
      window.cairn.opportunities.archive(role.id, why)),
  },
];

/** One implementation, two ways in: the offer on the No gate tab is the shortcut for
 *  the set that matters on import day, and the action list is the general way. */
function markBeforeCairn(rows: readonly Opportunity[]): Promise<void> {
  return inBatches(rows, (role) => window.cairn.opportunities.save({
    ...role,
    gate: { ...(role.gate ?? { answers: [] }), declared: 'retrofitted' },
  }));
}

/** Which check is open, and which page of it. */
let showing = 'all';
const page: Page = { at: 0 };
const chosen = new Set<string>();
let size: PageSize = 20;
let layout: 'list' | 'grid' = 'list';

export async function renderPreflight(body: HTMLElement): Promise<void> {
  const [roles, settings] = await Promise.all([
    window.cairn.opportunities.list(),
    window.cairn.settings.get(),
  ]);
  // Board is the pipeline's alone: a column here is not somewhere anything can go.
  layout = settings.listLayout;
  const found = CHECKS.map((check) => ({ check, rows: check.find(roles) }));
  const asking = found.filter(({ check }) => check.advisory !== true);
  const recorded = found.filter(({ check }) => check.advisory === true);
  const total = asking.reduce((sum, one) => sum + one.rows.length, 0);
  const kept = recorded.reduce((sum, one) => sum + one.rows.length, 0);

  if (total === 0) {
    body.append(el('div', { class: 'empty' },
      el('h2', {}, 'Nothing is out of step'),
      el('p', {}, `All four checks are clear across ${roles.length} `
        + `${roles.length === 1 ? 'role' : 'roles'}. This page is meant to be empty.`),
      kept === 0 ? null : el('p', { class: 'lede' },
        `${kept} went out before Cairn, and are kept as a record rather than a task.`)));
    return;
  }

  // Every finding, with the check it came from on the row. A screen of four lists and
  // no way to see the whole of it is the filter with no way out that the pipeline had.
  const everything = asking.flatMap(({ check, rows }) => rows.map((role) => ({ check, role })));

  const draw = (host: HTMLElement, items: readonly { check: Check; role: Opportunity }[],
                named: boolean): void => {
    if (items.length === 0) {
      host.append(el('p', { class: 'lede' }, 'Clear.'));
      return;
    }
    paged(host, {
      items,
      page,
      size,
      noun: 'out of step',
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
      bulk: {
        // A finding, not a role: the same role under two checks is two findings, and
        // ticking one of them must not silently tick the other.
        keyOf: ({ check, role }) => `${check.id}:${role.id}`,
        chosen,
        choices: FINDING_CHOICES,
        done: () => { refresh(); },
      },
      render: (into, shown) => {
        for (const { check, role } of shown) {
          const said = check.says(role);
          const why = named ? [check.title, said].filter((one) => one !== '').join(' — ') : said;
          // The row is the control. A button beside it did the one thing the row is for,
          // and the row itself did nothing -- so the target was a third of its width.
          const opens = el('button', {
            class: `row opens${layout === 'grid' ? ' rolecard' : ''}`, type: 'button',
          },
            el('span', {}, el('b', {}, mask.company(role.company)), el('small', {}, role.role)),
            el('span', {}, why === '' ? null : el('small', { class: 'nextsmall' }, why)),
            el('span', { class: 'opensign' }));
          on(opens, 'click', () => goTo('pipeline', role.id));
          into.append(opens);
        }
      },
    });
  };

  const opening = showing === 'all'
    || found.some((one) => one.check.id === showing && one.rows.length > 0)
    ? showing
    : 'all';

  sections({
    body,
    label: 'Checks',
    showing: opening,
    remember: (id) => { showing = id; page.at = 0; chosen.clear(); },
    defs: [
      {
        id: 'all',
        label: `All ${total}`,
        draw: (host: HTMLElement): void => draw(host, everything, true),
      },
      ...found
        .filter(({ check, rows }) => check.advisory !== true || rows.length > 0)
        .map(({ check, rows }) => ({
          id: check.id,
          label: `${check.title} ${rows.length}`,
          draw: (host: HTMLElement): void => {
            if (check.id === 'gate' && rows.length > 0) host.append(beforeCairn(rows));
            draw(host, rows.map((role) => ({ check, role })), false);
          },
        })),
    ],
  });
}

/** The day a pipeline is imported, every application in it went out before there was a
 *  gate to run -- and a screen built to be empty opens with a finding against all of
 *  them. Saying so once is a record; saying it sixty-six times is a wall. */
function beforeCairn(rows: readonly Opportunity[]): HTMLElement {
  const box = el('div', { class: 'sweep' });
  const offer = el('button', { class: 'btn', type: 'button' },
    `Mark ${rows.length} as sent before Cairn`);
  on(offer, 'click', () => {
    const confirm = el('button', { class: 'btn solid', type: 'button' }, 'Mark them');
    const cancel = el('button', { class: 'btn quiet', type: 'button' }, 'Cancel');
    const asked = el('div', { class: 'inline wrapping' },
      el('small', {}, `${rows.length} move to their own tab and out of this count. `
        + 'Answering the gate on one brings it back.'),
      confirm, cancel);
    offer.replaceWith(asked);
    on(cancel, 'click', () => { asked.replaceWith(offer); });
    on(confirm, 'click', () => {
      confirm.setAttribute('disabled', 'true');
      void markBeforeCairn(rows).then(() => { refresh(); });
    });
  });
  box.append(offer);
  return box;
}
