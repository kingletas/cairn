/** Today: what to do in the next hour, and the four figures that decide the day. */

import { el, on } from '../components/dom.js';
import { goTo, type ViewId } from './app.js';
import { gateState, type Opportunity, type Settings } from '../../shared/types.js';
import { daysFromToday, isDueToday, readableDue, startOfStoredDay } from '../components/dates.js';
import { CHECKS } from './preflight.js';
import * as mask from '../mask.js';

/** How many of a group are worth putting on a page that is meant to be short. */
const FEW = 5;

/** The next interview, when there is one close enough to be today's business. */
function nextInterview(body: HTMLElement): void {
  const host = el('div', { hidden: true });
  body.append(host);
  void window.cairn.interviews.next().then((found) => {
    if (found === null) return;
    const when = Date.parse(found.interview.at);
    if (!Number.isFinite(when) || when - Date.now() > 7 * 86_400_000) return;
    const at = new Date(when);
    const row = el('button', { class: 'row interviewnext', type: 'button' },
      el('span', {},
        el('b', {}, `${found.interview.round} with ${mask.company(found.opportunity.company)}`),
        el('small', {}, found.opportunity.role)),
      el('span', { class: `next${isDueToday(found.interview.at) ? ' due' : ''}` },
        // The date, not only the weekday: "Friday" leaves the reader asking which one,
        // and this is the line where it matters most.
        `${at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`
        + ` · ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`),
      el('span', { class: 'pill' }, 'Interview'));
    on(row, 'click', () => goTo('interviews'));
    host.hidden = false;
    host.append(el('div', { class: 'agenda' }, row));
  });
}

/** Preflight is a screen somebody has to remember to open, which is the failure it
 *  exists to prevent. When it has something, it says so here. When it is clean, this
 *  is not on the page at all. */
function preflightLine(body: HTMLElement, roles: readonly Opportunity[]): void {
  const found = CHECKS.map((check) => ({ check, rows: check.find(roles) })).filter((one) => one.rows.length > 0);
  if (found.length === 0) return;
  const total = found.reduce((sum, one) => sum + one.rows.length, 0);
  const line = el('button', { class: 'notice', type: 'button' },
    el('b', {}, `${total} ${total === 1 ? 'thing is' : 'things are'} out of step`),
    el('small', {}, found.map((one) => `${one.rows.length} ${one.check.title.toLowerCase()}`).join(' · ')));
  on(line, 'click', () => goTo('preflight'));
  body.append(line);
}

interface Group {
  id: string;
  title: string;
  /** Why this is its own pile rather than a date in a longer list. */
  why: string;
  rows: Opportunity[];
  to: ViewId;
}

/** The day's work, in piles by what kind of work it is. A single list sorted by date
 *  puts a nudge, a half-finished gate and something ready to send next to each other,
 *  and they are not the same job. */
function work(roles: readonly Opportunity[], silence: Map<string, number>, settings: Settings): Group[] {
  const live = roles.filter((o) => o.archivedAt === null);
  const unsent = live.filter((o) => o.appliedAt === null);
  const chaseAfter = settings.chaseAfterDays;

  const groups: Group[] = [
    {
      id: 'due', title: 'Due today', to: 'pipeline',
      why: 'You gave these a date and the date is today.',
      rows: live.filter((o) => o.nextAction !== null && daysFromToday(o.nextActionDue ?? '') === 0),
    },
    {
      id: 'overdue', title: 'Overdue', to: 'pipeline',
      why: 'Past the date you set. The oldest first, because that is the one going stale.',
      rows: live.filter((o) => {
        const days = o.nextActionDue === null ? null : daysFromToday(o.nextActionDue);
        return o.nextAction !== null && days !== null && days < 0;
      }).sort((a, b) => (a.nextActionDue ?? '').localeCompare(b.nextActionDue ?? '')),
    },
    {
      id: 'ready', title: 'Ready to send', to: 'pipeline',
      why: 'Every gate question answered and nothing sent. This is the shortest distance to an application.',
      rows: unsent.filter((o) => gateState(o.gate) === 'run'),
    },
    {
      id: 'finish', title: 'Gate half-finished', to: 'pipeline',
      why: 'Started and not settled — usually one question that was read rather than answered.',
      rows: unsent.filter((o) => gateState(o.gate) === 'partial'),
    },
    {
      id: 'chase', title: 'Silent too long', to: 'applications',
      why: chaseAfter === null
        ? 'Sent, and nothing has come back.'
        : `Sent more than ${chaseAfter} days ago with no word. An application that goes quiet is the commonest way one ends.`,
      rows: chaseAfter === null ? [] : live
        .filter((o) => o.appliedAt !== null && (silence.get(o.id) ?? 0) >= chaseAfter)
        .sort((a, b) => (silence.get(b.id) ?? 0) - (silence.get(a.id) ?? 0)),
    },
  ];
  return groups.filter((group) => group.rows.length > 0);
}

/** One pile, folded shut unless it is the one to start on. Five piles open at once is
 *  the wall this page was meant to replace; the summary line is the shape of the day
 *  and the open one is the work. */
function pile(group: Group, silence: Map<string, number>, open: boolean): HTMLElement {
  const panel = el('details', open ? { class: 'panel pile', open: 'open' } : { class: 'panel pile' },
    el('summary', {},
      el('b', {}, group.title),
      el('span', { class: 'pilecount' }, String(group.rows.length))),
    el('p', {}, group.why));

  for (const o of group.rows.slice(0, FEW)) {
    const days = silence.get(o.id);
    const said = group.id === 'chase' && days !== undefined
      ? `${days} days of silence`
      : o.nextActionDue === null ? (o.nextAction ?? '') : readableDue(o.nextActionDue);
    const row = el('button', { class: 'row', type: 'button', style: `--stage: var(--stage-${o.stage})` },
      el('span', {},
        el('b', {}, mask.company(o.company)),
        el('small', {}, o.role)),
      el('span', {}, el('small', { class: 'nextsmall' }, o.nextAction ?? 'Nothing written')),
      el('span', { class: `next${group.id === 'overdue' || group.id === 'due' ? ' due' : ''}` }, said));
    on(row, 'click', () => goTo(group.to, o.id));
    panel.append(row);
  }

  if (group.rows.length > FEW) {
    const more = el('button', { class: 'btn quiet', type: 'button' },
      `${group.rows.length - FEW} more`);
    on(more, 'click', () => goTo(group.to));
    panel.append(more);
  }
  return panel;
}

/** The middle value, which a couple of very slow answers cannot drag around the way a
 *  mean can. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : sorted[middle] ?? null;
}

export async function renderToday(
  body: HTMLElement, opportunities: Opportunity[], settings: Settings,
): Promise<void> {
  const today = new Date();
  body.append(el('p', { class: 'daystamp' },
    today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })));

  nextInterview(body);

  if (opportunities.length === 0) {
    body.append(
      el('div', { class: 'empty' },
        el('h2', {}, 'Nothing here yet'),
        el('p', {},
          'Cairn starts empty on purpose — it has no idea what you are looking for until you tell it. ' +
          'Add a role you have already found in Pipeline, or turn on a source in Sources and let it fetch.'),
        addButton()),
    );
    return;
  }

  const sent = await window.cairn.applications.list();
  const silence = new Map<string, number>();
  const answers: number[] = [];
  for (const row of sent) {
    const since = row.lastEvent?.at ?? row.opportunity.appliedAt;
    const days = since === null || since === undefined ? null : daysFromToday(since);
    if (days !== null) silence.set(row.opportunity.id, Math.max(0, -days));
    if (row.lastEvent !== null && row.lastEvent.kind !== 'applied' && row.opportunity.appliedAt !== null) {
      const from = startOfStoredDay(row.opportunity.appliedAt);
      const to = startOfStoredDay(row.lastEvent.at);
      if (from !== null && to !== null) answers.push(Math.max(0, Math.round((to - from) / 86_400_000)));
    }
  }

  preflightLine(body, opportunities);

  const piles = work(opportunities, silence, settings);
  const yours = new Set(piles.filter((g) => g.to === 'pipeline').flatMap((g) => g.rows.map((o) => o.id))).size;
  const theirs = opportunities.filter((o) => o.archivedAt === null && o.appliedAt !== null
    && (sent.find((r) => r.opportunity.id === o.id)?.lastEvent?.kind ?? 'applied') === 'applied').length;
  const replied = sent.filter((r) => r.lastEvent !== null && r.lastEvent.kind !== 'applied').length;
  const typical = median(answers);

  body.append(
    el('div', { class: 'strip' },
      // Two counts that do not overlap: one is your work and one is not.
      cell(String(yours), 'Waiting on you', 'pipeline'),
      cell(String(theirs), 'Waiting on them', 'applications'),
      cell(sent.length === 0 ? '—' : `${Math.round((replied / sent.length) * 100)}%`, 'Reply rate', 'applications'),
      cell(typical === null ? '—' : `${typical}d`, 'Typical reply', 'applications')),
  );

  if (piles.length === 0) {
    body.append(el('div', { class: 'empty' },
      el('h2', {}, 'Nothing needs you'),
      el('p', {}, `You are tracking ${opportunities.length} `
        + `${opportunities.length === 1 ? 'role' : 'roles'} and none of them is waiting on you today.`)));
    return;
  }
  // Open the first, which is the most pressing kind of work there is any of. The rest
  // are one line each until somebody wants them.
  piles.forEach((group, at) => body.append(pile(group, silence, at === 0)));
}

/** The empty state's only control used to do nothing at all, which is a poor first
 *  thing for somebody to press. */
function addButton(): HTMLElement {
  const button = el('button', { class: 'btn solid', type: 'button' }, 'Turn on a source');
  on(button, 'click', () => goTo('sources'));
  return button;
}

function cell(value: string, label: string, to: ViewId): HTMLElement {
  const tile = el('button', { class: 'cell', type: 'button' },
    el('b', {}, value), el('small', {}, label));
  on(tile, 'click', () => goTo(to));
  return tile;
}
