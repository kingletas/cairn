/** Requisitions: the triage surface, and the part of Cairn that is actually the product. */

import { clear, el, on } from '../components/dom.js';
import { sections } from '../components/sections.js';
import { goTo, refresh, refreshCounts } from './app.js';
import type { Money, Requisition, Verdict } from '../../shared/types.js';
import { titleMatched } from '../../shared/types.js';
import * as mask from '../mask.js';
import { ask } from '../components/ask.js';
import { inBatches, paged, type BulkChoice, type Page, type PageSize } from '../components/paged.js';
import { narrowingBar } from '../components/narrowing.js';
import { isNarrowed, narrow, settled, WHOLE_LIST, type Narrowing } from '../../shared/band.js';
import { toText } from '../../shared/text.js';

/** Only an outcome that changes what you do gets a label. Everything in the visible
 *  list is already something to read, so tagging each row "Read this" four times
 *  would say nothing and take the eye off the ones that do. */
const OUTCOME_LABEL: Partial<Record<Verdict['outcome'], string>> = {
  fail: 'Blocked', pass: 'Clear', unknown: 'Could not check',
};

/** Which page of each list, and how many to a page, for the life of the window. */
const leadPage: Page = { at: 0 };
const restPage: Page = { at: 0 };
const asidePage: Page = { at: 0 };
/** Ticked leads, shared by the matching list and the rest: one id is one lead wherever
 *  it is drawn, and a tick that vanished when a list was expanded would be a bug. */
const chosen = new Set<string>();
let size: PageSize = 20;
let layout: 'list' | 'grid' = 'list';

/** A reading is marked, so a second one replaces the first rather than sitting under it. */
const readByAssistant = (verdict: Verdict): boolean => verdict.check.endsWith('your assistant');

function verdictRow(verdict: Verdict): HTMLElement {
  const label = OUTCOME_LABEL[verdict.outcome];
  const pillClass = verdict.outcome === 'fail' ? 'pill due' : verdict.outcome === 'pass' ? 'pill live' : 'pill';
  return el('div', { class: readByAssistant(verdict) ? 'frow readrow' : 'frow' },
    el('div', {},
      // A verdict explains itself with the figures it read, so the sentence carries
      // the same numbers the row does.
      el('label', {}, mask.amounts(verdict.because)),
      verdict.evidence ? el('small', { class: 'quote' }, `“${verdict.evidence}”`) : null),
    label ? el('span', { class: pillClass }, label) : null);
}

/** The band, and where it came from. An employer's own figure and a listing site's
 *  copy of it have been fifty thousand apart at the ceiling, so the two are never
 *  shown as the same kind of fact. */
function payLine(pay: Money | null): string {
  if (pay === null) return 'No pay stated';
  const amount = (n: number | null): string => (n === null ? '?' : n.toLocaleString());
  const from = pay.provenance === 'first-party' ? 'the employer' : 'a listing site';
  return `${pay.currency} ${amount(pay.min)}–${amount(pay.max)} · from ${from}`;
}

/** Which half is showing. Set aside is a real place rather than a bin nobody can look
 *  in: a lead that is only marked stays in the vault for ever, and a queue of 53 above
 *  700 rows nobody can see is a number that reconciles with nothing. */
type Half = 'waiting' | 'aside';

let half: Half = 'waiting';
/** What both halves are narrowed to, kept for the life of the window like the tab. */
let narrowing: Narrowing = { ...WHOLE_LIST };

/** A lead holds the posting as it arrived. The gate screened the text of it, so that is
 *  what a skill is looked for in — the raw would match a word inside a tag. */
const readable = (requisition: Requisition): { pay: Money | null; posting: string } =>
  ({ pay: requisition.pay, posting: toText(requisition.raw) });

/** The same control as everywhere else, minus the board. */
function shapeChoice(current: 'list' | 'grid', take: (next: 'list' | 'grid') => void): {
  current: 'list' | 'grid'; shapes: readonly ('list' | 'grid')[];
  onChange: (next: 'list' | 'grid' | 'board') => void;
} {
  return {
    current,
    shapes: ['list', 'grid'],
    onChange: (next): void => {
      if (next === 'board') return;
      take(next);
      void window.cairn.settings.set('listLayout', next);
    },
  };
}

export async function renderRequisitions(body: HTMLElement): Promise<void> {
  const [all, aside, counts, settings, profile] = await Promise.all([
    window.cairn.requisitions.list(),
    window.cairn.requisitions.setAside(),
    window.cairn.requisitions.counts(),
    window.cairn.settings.get(),
    window.cairn.profile.get(),
  ]);
  layout = settings.listLayout;

  // Narrowed before the tabs are counted, so a tab never says a number the list under it
  // does not have. Both halves take the same lens: a lead you set aside is still a lead.
  const waitingRows = narrow(all, narrowing, profile, profile.skills, readable);
  const asideRows = narrow(aside, narrowing, profile, profile.skills, readable);
  const bar = narrowingBar({
    now: narrowing, skills: profile.skills, rules: profile,
    total: all.length + aside.length, shown: waitingRows.length + asideRows.length,
    onChange: (next) => { narrowing = next; leadPage.at = 0; restPage.at = 0; refresh(); },
  });

  // sections() owns what it is given, so the bar sits above a host of its own rather
  // than being cleared on every tab.
  const lens = isNarrowed(settled(narrowing, profile, profile.skills));
  if (lens && waitingRows.length === 0 && asideRows.length === 0) {
    body.append(bar, el('p', { class: 'lede' }, 'No lead matches this. Show everything to see them all.'));
    return;
  }

  const host = el('div', {});
  body.append(bar, host);
  sections({
    body: host,
    label: 'Lead sections',
    showing: half,
    // A tick means a lead on the list you were looking at. The queue and the pile you
    // have said no to are two lists, and two different decisions.
    remember: (id) => { half = id; leadPage.at = 0; restPage.at = 0; asidePage.at = 0; chosen.clear(); },
    defs: [
      // Counts read the way they do on every other list: a number, not a number in
      // brackets.
      { id: 'waiting', label: `Waiting ${waitingRows.length}`, draw: (h) => waiting(h, waitingRows, lens) },
      { id: 'aside', label: `Set aside ${asideRows.length}`, draw: (h) => setAside(h, asideRows, counts.links, lens) },
    ],
  });
}

/** Everything you have already said no to, and the only screen from which it can
 *  actually leave the vault. */
function setAside(body: HTMLElement, aside: readonly Requisition[], links: number, lens: boolean): void {
  // Shown whether or not any rows are left, because the links are what goes on
  // deciding after the rows are gone -- which reads as a figure being wrong.
  if (links > 0) body.append(remembered(links));

  if (aside.length === 0) {
    // Under a narrowing the ordinary empty state would say you have set nothing aside,
    // which is a different and untrue thing.
    body.append(lens
      ? el('p', { class: 'lede' }, 'Nothing you set aside matches this.')
      : el('div', { class: 'empty' },
          el('h2', {}, 'Nothing set aside'),
          el('p', {}, 'Leads you say Not for me to end up here, where you can look at them again or delete them for good.')));
    return;
  }

  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Set aside'),
    el('p', {},
      'They are still in your vault. Cairn remembers a hash of each link so the same posting does not ' +
      'come back on the next run — bringing one back forgets that, and deleting them keeps it.'),
  );

  const remove = el('button', { class: 'btn', type: 'button' },
    `Delete all ${aside.length} for good`);
  on(remove, 'click', () => {
    remove.setAttribute('disabled', 'true');
    void window.cairn.requisitions.forget().then((result) => {
      remove.removeAttribute('disabled');
      if (result === null) return;
      refresh();
    });
  });
  panel.append(el('div', { class: 'restbar' }, remove));

  // Paged like every other list here. It used to draw the newest hundred and say so,
  // which is a cap rather than a page: there was no way to reach the hundred and first.
  const list = el('div', {});
  panel.append(list);
  paged(list, {
    items: aside, page: asidePage, size,
    noun: 'set aside',
    onSize: (next) => { size = next; },
    render: (into, shown) => {
      for (const requisition of shown) {
        const back = el('button', { class: 'btn ghost', type: 'button' }, 'Bring it back');
        on(back, 'click', () => {
          back.setAttribute('disabled', 'true');
          void window.cairn.requisitions.restore(requisition.id).then(() => refresh());
        });
        into.append(el('div', { class: 'frow' },
          el('div', {},
            el('label', {}, mask.company(requisition.company)),
            el('small', {}, `${requisition.role} · ${requisition.sourceId} · ${mask.amounts(payLine(requisition.pay))}`)),
          back));
      }
    },
    bulk: { keyOf: (one) => one.id, chosen, choices: BACK_CHOICES, done: () => { refresh(); } },
  });
  body.append(panel);
}

/** The links Cairn is holding on to, which is not the same thing as the leads. */
function remembered(links: number): HTMLElement {
  const forget = el('button', { class: 'btn ghost', type: 'button' }, 'Forget them');
  on(forget, 'click', () => {
    forget.setAttribute('disabled', 'true');
    void window.cairn.requisitions.forgetLinks().then((result) => {
      forget.removeAttribute('disabled');
      if (result !== null) refresh();
    });
  });
  return el('section', { class: 'panel' },
    el('h3', {}, 'Postings Cairn is still saying no to'),
    el('p', {},
      `${links} ${links === 1 ? 'link' : 'links'} you set aside ${links === 1 ? 'is' : 'are'} remembered as a hash, ` +
      'so the same postings do not come back on the next run. They stay when you delete the leads below — ' +
      'which is why a run can still count them long after there is nothing here to see.'),
    el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, 'Forget the lot'),
        el('small', {}, 'They can then arrive again and be judged afresh. Nothing else changes.')),
      forget));
}

/** Both halves of the one decision a lead asks for. Taking one reads the whole of what
 *  the queue found; saying no to one remembers the link as a hash so it cannot come
 *  back as a fresh find. */
const LEAD_CHOICES: readonly BulkChoice<Requisition>[] = [
  {
    id: 'keep',
    label: 'Keep',
    asks: (n) => `Take ${n} into the pipeline?`,
    run: (rows) => inBatches(rows, (one) => window.cairn.requisitions.keep(one.id)),
  },
  {
    id: 'drop',
    label: 'Not for me',
    asks: (n) => `Set aside ${n}? They stay in the vault, and the links are remembered.`,
    run: (rows) => inBatches(rows, (one) => window.cairn.requisitions.drop(one.id)),
  },
];

const BACK_CHOICES: readonly BulkChoice<Requisition>[] = [
  {
    id: 'restore',
    label: 'Bring it back',
    asks: (n) => `Put ${n} back in the queue? Cairn forgets the links, so they can arrive again.`,
    run: (rows) => inBatches(rows, (one) => window.cairn.requisitions.restore(one.id)),
  },
];

function waiting(body: HTMLElement, requisitions: readonly Requisition[], lens: boolean): void {
  if (requisitions.length === 0 && lens) {
    body.append(el('p', { class: 'lede' }, 'No lead waiting matches this.'));
    return;
  }
  if (requisitions.length === 0) {
    const toSources = el('button', { class: 'btn solid', type: 'button' }, 'Go to Sources');
    on(toSources, 'click', () => goTo('sources'));
    body.append(
      el('div', { class: 'empty' },
        el('h2', {}, 'Nothing waiting'),
        el('p', {},
          'Leads land here when a fetch finds something that gets past your rules. ' +
          'Turn on a source and add an employer in Sources, then fetch.'),
        toSources),
    );
    return;
  }

  // Ones whose title reads like what you asked for come first. The rest are still
  // here: they cleared every rule you set, and whether a title you did not think to
  // search for is worth a look is not something Cairn should decide for you.
  const matching = requisitions.filter(titleMatched);
  const rest = requisitions.filter((r) => !titleMatched(r));

  let showingRest = rest.length > 0 && matching.length === 0;
  const restHost = el('div', {});

  const drawRest = (): void => {
    clear(restHost);
    if (rest.length === 0) return;
    const toggle = el('button', { class: 'btn', type: 'button' },
      showingRest
        ? `Hide the ${rest.length} whose title does not match`
        : `Show ${rest.length} more whose title does not match what you named`);
    on(toggle, 'click', () => { showingRest = !showingRest; drawRest(); });
    restHost.append(el('div', { class: 'restbar' }, toggle));
    if (showingRest) {
      paged(restHost, {
        items: rest, page: restPage, size,
        gridClass: 'leads',
        layout: shapeChoice(layout, (next) => { layout = next; }),
        onSize: (next) => { size = next; },
        render: (into, shown) => { for (const one of shown) into.append(card(one)); },
        bulk: { keyOf: (one) => one.id, chosen, choices: LEAD_CHOICES, done: () => { refresh(); } },
      });
    }
  };

  if (matching.length > 0) {
    paged(body, {
      items: matching, page: leadPage, size,
      noun: 'waiting',
      gridClass: 'leads',
      layout: shapeChoice(layout, (next) => { layout = next; }),
      onSize: (next) => { size = next; },
      render: (into, shown) => { for (const one of shown) into.append(card(one)); },
      bulk: { keyOf: (one) => one.id, chosen, choices: LEAD_CHOICES, done: () => { refresh(); } },
    });
  }
  body.append(restHost);
  drawRest();
}

function card(requisition: Requisition): HTMLElement {
  const settled = requisition.screening.verdicts.filter((v) => v.outcome === 'pass');
  const attention = requisition.screening.verdicts.filter((v) => v.outcome !== 'pass');

  const panel = el('section', {
    class: `panel req${titleMatched(requisition) ? '' : ' offtitle'}`,
  });
  const self = (): HTMLElement | null => panel;

  const detail = el('div', { class: 'reqdetail', hidden: true });
  const toggle = el('button', {
    class: 'reqtoggle', type: 'button', 'aria-expanded': 'false',
    'aria-label': `Details for ${requisition.company} — ${requisition.role}`,
  });

  // What is on the row when it is shut: enough to triage without opening anything.
  // A page of fully-open cards is a page nobody scrolls to the bottom of.
  const needsReading = attention.filter((v) => v.outcome === 'ask').length;
  const blocked = attention.filter((v) => v.outcome === 'fail').length;
  const shut = [
    blocked > 0 ? `${blocked} against it` : '',
    needsReading > 0 ? `${needsReading} to read` : '',
    `${settled.length} clear`,
  ].filter(Boolean).join(' · ');

  // The employer leads, as it does on every other list here. Four leads from one
  // company read as four companies while the name was the faint line under the title.
  toggle.append(
    el('div', { class: 'reqwho' },
      el('h3', {}, mask.company(requisition.company)),
      el('p', {}, requisition.role),
      el('p', { class: 'reqfrom' }, requisition.sourceId),
      el('p', { class: `payline${requisition.pay === null ? ' nopay' : ''}` }, mask.amounts(payLine(requisition.pay)))),
    el('span', { class: 'reqcount' }, shut),
    el('span', { class: 'reqchevron', 'aria-hidden': 'true' }, '▸'),
  );

  on(toggle, 'click', () => {
    const open = detail.hidden !== false;
    detail.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('open', open);
    if (open && detail.childElementCount === 0) fillDetail(detail, requisition, attention, settled, self);
  });

  panel.append(
    el('div', { class: 'reqhead' },
      toggle,
      el('div', { class: 'reqacts' },
        keepButton(requisition, self), dropButton(requisition, self))),
    detail,
  );
  return panel;
}

/** Built the first time it is opened. Fourteen leads' worth of verdicts, evidence and
 *  postings is a great deal of markup to make for cards nobody has looked at. */
function fillDetail(
  into: HTMLElement, requisition: Requisition, attention: Verdict[], settled: Verdict[],
  card: () => HTMLElement | null,
): void {
  for (const verdict of attention) into.append(verdictRow(verdict));

  if (settled.length > 0) {
    const details = el('details', { class: 'settled' },
      el('summary', {}, `${settled.length} checks passed`));
    for (const verdict of settled) details.append(verdictRow(verdict));
    into.append(details);
  }

  into.append(posting(requisition));
  into.append(readButton(requisition, card));
  into.append(excludeButton(requisition));

  if (requisition.screening.open.length > 0) {
    const open = el('div', { class: 'openq' },
      el('h4', {}, 'Cairn will not answer these'));
    for (const question of requisition.screening.open) {
      open.append(el('p', {}, question));
    }
    into.append(open);
  }
}

/** The posting itself. */
function posting(requisition: Requisition): HTMLElement {
  const body = el('div', { class: 'postingbody' });
  const summary = el('summary', {}, 'Read the posting');
  const details = el('details', { class: 'posting' }, summary, body);

  let loaded = false;
  on(details, 'toggle', () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.append(el('p', { class: 'postingloading' }, 'Reading…'));
    void window.cairn.requisitions.posting(requisition.id).then((text) => {
      clear(body);
      if (text === null) {
        body.append(
          el('p', {},
            'This source gave no description — only a title, a company and a link. ' +
            'Opening it is the only way to see what the job is.'),
        );
      } else {
        // Paragraph by paragraph. One block of text with the line breaks collapsed is
        // technically the whole posting and unreadable in practice.
        for (const block of text.split(/\n{2,}/)) {
          const trimmed = block.trim();
          if (trimmed.length > 0) body.append(el('p', {}, trimmed));
        }
      }
      if (requisition.url !== null) body.append(openLink(requisition.url));
    });
  });

  return details;
}

/** Ask the assistant to read the posting for what a rule cannot: the band written in
 *  prose, the office clause three paragraphs down, the sponsorship line. */
function readButton(requisition: Requisition, card: () => HTMLElement | null): HTMLElement {
  const button = el('button', { class: 'btn ghost', type: 'button' }, 'Read this posting for me');
  const answer = el('div', { class: 'asked', hidden: true });

  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    void ask('read-posting', requisition.id).then((result) => {
      button.removeAttribute('disabled');
      if (result === null) return;
      // Whatever a previous reading left on the card, so reading twice replaces rather
      // than stacks two copies of the same two sentences.
      for (const stale of Array.from(card()?.querySelectorAll('.readrow') ?? [])) stale.remove();
      clear(answer);
      answer.hidden = false;
      if (result.verdicts.length === 0 && result.dropped.length === 0) {
        answer.append(el('p', {}, 'It found nothing in the posting about pay, location, sponsorship or seniority.'));
      }
      for (const verdict of result.verdicts) answer.append(verdictRow(verdict));
      if (result.dropped.length > 0) {
        // A fact whose quote is not in the posting was written rather than read, so it
        // is thrown away and said out loud rather than quietly corrected.
        answer.append(el('p', { class: 'askdropped' },
          `Dropped, because the sentence quoted is not in the posting: ${result.dropped.join(', ')}.`));
      }
      // The band is written into the row rather than redrawn from the vault: a redraw
      // here rebuilds the card, which closes it and takes this answer with it.
      const line = card()?.querySelector('.payline');
      if (result.pay !== null && line !== null && line !== undefined) {
        line.textContent = mask.amounts(payLine(result.pay));
        line.classList.remove('nopay');
      }
    });
  });

  return el('div', {}, button, answer);
}

/** Never show me this employer again. */
function excludeButton(requisition: Requisition): HTMLElement {
  const button = el('button', { class: 'btn ghost', type: 'button' },
    `Never show me ${mask.company(requisition.company)} again`);
  const said = el('span', { class: 'ivnote' });
  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    void window.cairn.employers.exclude(requisition.company).then((result) => {
      said.textContent = result.dropped === 1
        ? 'Set aside, and added to the employers you never want to see.'
        : `${result.dropped} waiting leads set aside, and added to the employers you never want to see.`;
      // More than one card has gone, so this is the case that earns a redraw.
      window.setTimeout(() => refresh(), 1200);
    });
  });
  return el('p', { class: 'postingopen' }, button, said);
}

/** Opens in the user's browser, and says so. Cairn never navigates itself anywhere. */
function openLink(url: string): HTMLElement {
  const link = el('button', { class: 'btn', type: 'button' }, 'Open the original');
  on(link, 'click', () => { void window.cairn.open.external(url); });
  return el('p', { class: 'postingopen' }, link,
    el('span', { class: 'ivnote' }, 'opens in your browser'));
}

/** Take the card away and leave the rest of the page alone -- but the rest of the app
 *  has changed. A role kept here is a role in the pipeline, and the rail said otherwise
 *  until something else happened to re-read. */
function settle(requisition: Requisition, act: Promise<unknown>, card: () => HTMLElement | null): void {
  void act.then(() => {
    void refreshCounts();
    const panel = card();
    if (panel === null) return;
    panel.style.opacity = '0';
    window.setTimeout(() => {
      const list = panel.parentElement;
      panel.remove();
      if (list !== null && list.querySelector('.req') === null) refresh();
    }, 180);
  });
}

function keepButton(requisition: Requisition, card: () => HTMLElement | null): HTMLElement {
  const button = el('button', { class: 'btn solid', type: 'button' }, 'Keep');
  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    settle(requisition, window.cairn.requisitions.keep(requisition.id), card);
  });
  return button;
}

function dropButton(requisition: Requisition, card: () => HTMLElement | null): HTMLElement {
  const button = el('button', { class: 'btn', type: 'button' }, 'Not for me');
  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    settle(requisition, window.cairn.requisitions.drop(requisition.id), card);
  });
  return button;
}


