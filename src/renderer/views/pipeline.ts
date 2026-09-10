/** Pipeline: a list grouped by stage, not a board. */

import { clear, el, on, saying } from '../components/dom.js';
import { sections } from '../components/sections.js';
import { narrowingBar } from '../components/narrowing.js';
import { narrow, WHOLE_LIST, type Narrowing } from '../../shared/band.js';
import { inBatches, paged, type BulkChoice, type Page } from '../components/paged.js';
import { focusedRole, refresh } from './app.js';
import type { Opportunity, Settings, Stage } from '../../shared/types.js';
import { CHANNELS, GATE_QUESTIONS, STAGES, gateState, stageName } from '../../shared/types.js';
import type { Gate, GateDeclaration, GateField } from '../../shared/types.js';
import * as mask from '../mask.js';
import { ask } from '../components/ask.js';

/** Which stage is open. Kept for the life of the window, so a redraw after a move
 *  does not throw you back to the first tab. */
let showing: Stage | 'aside' | 'all' = 'all';
/** What the pipeline is narrowed to, kept for the life of the window like the tab. */
let narrowing: Narrowing = { ...WHOLE_LIST };

/** Which page of the open stage. Reset when the stage changes: a page number means
 *  nothing once the list under it is a different list. */
const page: Page = { at: 0 };
/** Which rows a bulk action is pointed at. Held here so a redraw or a page turn does
 *  not quietly drop what somebody has picked. */
const chosen = new Set<string>();

/** The set-aside list pages on its own, because it is a different list. */
const asidePage: Page = { at: 0 };

const NEXT: Record<Stage, Stage | null> = {
  considering: 'preparing', preparing: 'applied', applied: 'interviewing',
  interviewing: 'decision', decision: null,
};

/** The way to the form at the foot of the page, from the top of it where somebody
 *  decides they want it. Scrolling to a form and not landing in it is half an answer. */
function addRoleCta(): HTMLElement {
  const button = el('button', { class: 'btn solid', type: 'button' }, 'Add a role');
  on(button, 'click', () => {
    const panel = document.getElementById('addrole');
    if (panel instanceof HTMLDetailsElement) panel.open = true;
    panel?.scrollIntoView({ block: 'center' });
    (document.getElementById('newcompany') as HTMLInputElement | null)?.focus();
  });
  return button;
}

/** A role you found somewhere Cairn does not read. */
function addByHand(): HTMLElement {
  // Folded, because adding a role by hand is the rarest thing on this screen and it
  // was taking the room at the foot of every one of them.
  const company = el('input', { type: 'text', id: 'newcompany', placeholder: 'Who it is with' });
  const role = el('input', { type: 'text', id: 'newrole', placeholder: 'What the role is called' });
  const url = el('input', { type: 'text', id: 'newurl', placeholder: 'https://… (optional)' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const add = el('button', { class: 'btn solid', type: 'submit' }, 'Add this role');

  const form = el('form', {},
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'newcompany' }, 'Company')), company),
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'newrole' }, 'Role')), role),
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'newurl' }, 'Link')), url),
    problem, add);

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    if (company.value.trim() === '' || role.value.trim() === '') {
      problem.textContent = 'A role needs a company and a title, or there is nothing to track.';
      problem.hidden = false;
      return;
    }
    const link = url.value.trim();
    void window.cairn.opportunities
      .create({
        company: company.value.trim(),
        role: role.value.trim(),
        url: link === '' ? null : link,
        nextAction: 'Read the role description',
      })
      .then(() => { refresh(); })
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  return el('details', { class: 'panel addrole', id: 'addrole' },
    el('summary', {}, 'Add a role by hand'),
    el('p', {}, 'For one you were sent, or found somewhere Cairn does not read.'),
    form);
}

function money(o: Opportunity): string {
  if (o.pay === null) return 'No pay stated';
  const fmt = (n: number | null): string => (n === null ? '?' : n.toLocaleString());
  const provenance = o.pay.provenance === 'first-party' ? 'employer' : 'listing site';
  return `${o.pay.currency} ${fmt(o.pay.min)}–${fmt(o.pay.max)} · ${provenance}`;
}

/** Look an employer up before talking to them. Present only for a provider that can
 *  search and cite, because a note nobody can check is worse than no note. */
function researchPanel(opportunities: Opportunity[]): HTMLElement {
  const panel = el('section', { class: 'panel', hidden: true });

  void window.cairn.assistant.get().then(({ ready, grounded }) => {
    if (!ready || !grounded) return;
    const picker = el('select', { 'aria-label': 'Which employer' },
      ...opportunities.map((one) => el('option', { value: one.id }, mask.company(one.company))));
    const button = el('button', { class: 'btn', type: 'button' }, 'Look them up');
    const note = el('div', { class: 'asked', hidden: true });

    on(button, 'click', () => {
      button.setAttribute('disabled', 'true');
      void ask('research', picker.value).then((result) => {
        button.removeAttribute('disabled');
        if (result === null) return;
        clear(note);
        note.hidden = false;
        if (result.refused.length > 0) {
          note.append(el('h4', {}, 'Refused'), el('p', {},
            `${result.refused.length} of its sentences named no source, so Cairn kept none of it. `
            + 'Sourced or not at all: a note that is half sourced is the harder one to read.'));
          return;
        }
        for (const paragraph of result.text.split(/\n{2,}/)) {
          if (paragraph.trim() !== '') note.append(el('p', {}, paragraph.trim()));
        }
        for (const citation of result.citations) {
          note.append(el('small', { class: 'askcite' }, `${citation.title} — ${citation.url}`));
        }
        note.append(keepNote(picker.value, result.text));
      });
    });

    panel.hidden = false;
    panel.append(
      el('h3', {}, 'Look an employer up'),
      el('p', {}, 'Your assistant searches and has to name a source for every sentence. '
        + 'Nothing about the role changes on its own, and the note is yours to keep or ignore.'),
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, 'Employer'), el('small', {}, 'From your pipeline.')),
        el('div', { class: 'inline' }, picker, button)),
      note);
  });

  return panel;
}

/** Keeping it is a press, not a side effect: research that filed itself would be the
 *  assistant changing the pipeline. */
function keepNote(opportunityId: string, text: string): HTMLElement {
  const keep = el('button', { class: 'btn', type: 'button' }, 'Keep this on the role');
  const said = el('span', { class: 'saved', hidden: true }, 'Kept');
  on(keep, 'click', () => {
    keep.setAttribute('disabled', 'true');
    void window.cairn.applications.addEvent(opportunityId, 'note', text).then(() => {
      said.hidden = false;
    });
  });
  return el('div', { class: 'answeract' }, keep, said);
}




/** How many of a column are drawn before it says how many more there are. Six fit, and
 *  five is what leaves the column room to breathe -- a board is for the shape of the
 *  whole pipeline rather than for reading three thousand cards. */
const COLUMN_CAP = 5;

/** The board: every stage at once, as columns you can move a role between.
 *  This is the one layout where the columns are somewhere a card can go — which is what
 *  separates a board from a grid, and why Today could never be one. */
function drawBoard(
  body: HTMLElement, opportunities: readonly Opportunity[],
  LABELS: (s: Stage) => string,
): void {
  const bar = el('div', { class: 'pagebar' });
  // The same control as every other list: the shape you are in, not a sentence about
  // what pressing it does. The board is every stage at once, so leaving goes to one.
  const shape = el('button', {
    class: 'btn shape shape-board', type: 'button',
    'aria-label': 'Board view', title: 'Board view',
  });
  on(shape, 'click', () => {
    void window.cairn.settings.set('pipelineLayout', 'list').then(() => { refresh(); });
  });
  bar.append(addRoleCta(), el('span', { class: 'pagecount' },
    `${opportunities.length} ${opportunities.length === 1 ? 'role' : 'roles'} across ${STAGES.length} stages`),
    shape);
  body.append(bar);

  const move = (id: string, to: Stage, card?: HTMLElement): void => {
    const role = opportunities.find((o) => o.id === id);
    if (!role || role.stage === to) return;
    const anchor = card ?? document.querySelector(`[data-role="${CSS.escape(id)}"]`);
    if (anchor instanceof HTMLElement) {
      if (to === 'decision') { askDecision(anchor, role); return; }
      if (to === 'applied') { askSend(anchor, role); return; }
    }
    void window.cairn.opportunities.save({ ...role, stage: to }).then(() => { refresh(); });
  };

  const board = el('div', { class: 'board' });
  for (const stage of STAGES) {
    const inStage = opportunities.filter((o) => o.stage === stage);
    const column = el('div', { class: 'boardcol', style: `--stage: var(--stage-${stage})` },
      el('div', { class: 'boardhead' },
        el('b', {}, LABELS(stage)),
        el('span', { class: 'count' }, String(inStage.length))));

    on(column, 'dragover', (event) => {
      event.preventDefault();
      column.classList.add('over');
    });
    on(column, 'dragleave', () => column.classList.remove('over'));
    on(column, 'drop', (event) => {
      event.preventDefault();
      column.classList.remove('over');
      const id = (event as DragEvent).dataTransfer?.getData('text/plain');
      if (id) move(id, stage);
    });

    for (const o of inStage.slice(0, COLUMN_CAP)) {
      const card = el('div', { class: 'boardcard', draggable: 'true', 'data-role': o.id },
        el('b', {}, mask.company(o.company)),
        el('small', {}, o.role),
        el('small', { class: 'band' }, mask.amounts(money(o))));
      on(card, 'dragstart', (event) => {
        (event as DragEvent).dataTransfer?.setData('text/plain', o.id);
        card.classList.add('lifting');
      });
      on(card, 'dragend', () => card.classList.remove('lifting'));
      // Dragging is not the only way in: a card carries the next stage as a press too.
      const advance = NEXT[stage];
      if (advance) {
        const button = el('button', { class: 'btn quiet', type: 'button' }, `→ ${LABELS(advance)}`);
        on(button, 'click', (event) => { event.stopPropagation(); move(o.id, advance, card); });
        card.append(button);
      }
      column.append(card);
    }

    if (inStage.length > COLUMN_CAP) {
      // Five is what a column shows; the rest are one press away, in the list for that
      // stage rather than a taller column.
      const rest = el('button', { class: 'btn quiet', type: 'button' },
        `${inStage.length - COLUMN_CAP} more`);
      on(rest, 'click', () => {
        showing = stage;
        page.at = 0;
        void window.cairn.settings.set('pipelineLayout', 'list').then(() => { refresh(); });
      });
      column.append(rest);
    }
    if (inStage.length === 0) {
      column.append(el('p', { class: 'lede' }, 'Empty'));
    }
    board.append(column);
  }
  body.append(board);
}

/** One page of one stage. */
function drawStage(
  host: HTMLElement, inStage: readonly Opportunity[], stage: Stage | null,
  LABELS: (s: Stage) => string, settings: Settings,
): void {
  let layout = settings.pipelineLayout;
  paged(host, {
    items: inStage,
    page,
    size: settings.pipelinePageSize,
    lead: addRoleCta,
    onSize: (size) => { void window.cairn.settings.set('pipelinePageSize', size); },
    layout: {
      current: layout,
      shapes: ['list', 'grid', 'board'],
      onChange: (next) => {
        layout = next;
        // The board is every stage at once, so it is a different screen rather than a
        // different class on this one -- it needs the view drawn again.
        const saved = window.cairn.settings.set('pipelineLayout', next);
        if (next === 'board') void saved.then(() => { refresh(); });
      },
    },
    render: (into, shown) => {
      // On a stage tab the tab is the answer. On All there is no tab to ask, and the
      // only clue left was which stage the button happened to name.
      for (const o of shown) into.append(roleRow(o, stage ?? o.stage, LABELS, layout, stage === null));
    },
    bulk: {
      keyOf: (o) => o.id,
      chosen,
      done: () => { refresh(); },
      choices: bulkChoices(LABELS),
    },
  });
}

/** What can be done to several roles at once, and what deliberately cannot.
 *  Sending and reaching the last stage each ask a question at the moment of the move --
 *  who a nudge goes to, and what actually happened -- and a question asked of forty
 *  rows at once is a question nobody answers. Those two stages are not offered here. */
function bulkChoices(LABELS: (s: Stage) => string): readonly BulkChoice<Opportunity>[] {
  const movable: Stage[] = ['considering', 'preparing', 'interviewing'];
  return [
    {
      id: 'aside',
      label: 'Set aside',
      field: { label: 'Why', placeholder: 'Why — band, location, discipline, already applied there…' },
      asks: (n, why) => why.trim() === ''
        ? `Set aside ${n}? A reason is what tells them apart from roles nobody looked at.`
        : `Set aside ${n}, because ${why.trim()}?`,
      run: (rows, why) => inBatches(rows, (o) => window.cairn.opportunities.archive(o.id, why)),
    },
    {
      id: 'stage',
      label: 'Move to a stage',
      field: { label: 'Which stage', options: movable.map((one) => [one, LABELS(one)] as const) },
      asks: (n, to) => `Move ${n} to ${LABELS(to as Stage)}?`,
      run: (rows, to) => inBatches(rows, (o) =>
        window.cairn.opportunities.save({ ...o, stage: to as Stage })),
    },
    {
      id: 'fit',
      label: 'Set the fit',
      field: {
        label: 'Fit',
        options: [['strong', 'strong'], ['possible', 'possible'], ['weak', 'weak'], ['', 'Not decided']],
      },
      asks: (n, fit) => fit === ''
        ? `Leave the fit undecided on ${n}?`
        : `Call ${n} a ${fit} fit?`,
      run: (rows, fit) => inBatches(rows, (o) =>
        window.cairn.opportunities.save({ ...o, fit: fit === '' ? null : (fit as Opportunity['fit']) })),
    },
  ];
}

/** What the colour on the word means, said in words. A hue between two other quiet
 *  buttons is not a state anybody can read. */
const GATE_SAID: Record<ReturnType<typeof gateState>, string> = {
  'not-run': 'The gate has not been run on this one',
  blocked: 'The gate cannot be run — there is no route to apply',
  partial: 'The gate is part-answered',
  run: 'The gate is run, and every required box has an answer',
  retrofitted: 'This went out before Cairn',
};

/** One role, built to be scanned rather than read. The employer leads, because that is
 *  what somebody is looking for; the next action is the same sentence on a dozen rows,
 *  so it is small. It was the other way round, and the boldest thing on the row was the
 *  one that repeated. */
function roleRow(o: Opportunity, stage: Stage, LABELS: (s: Stage) => string,
                 layout: Settings['pipelineLayout'] = 'list',
                 sayStage = false): HTMLElement {
  const advance = NEXT[stage];
  const state = gateState(o.gate);
  const row = el('div', {
    class: layout === 'grid' ? 'row rolecard' : 'row',
    'data-role': o.id, style: `--stage: var(--stage-${stage})`,
    role: 'button', tabindex: '0',
    title: o.url === null ? 'No link was captured for this one' : 'Open the posting',
  },
    el('span', {},
      el('b', {}, mask.company(o.company)),
      el('small', {}, o.role),
      sayStage ? el('small', { class: 'stagesaid' }, LABELS(stage)) : null),
    el('span', { class: 'band' }, mask.amounts(money(o))),
    el('span', {}, el('small', { class: 'nextsmall' }, o.nextAction ?? 'Nothing due')),
    el('span', { class: 'rowacts' },
      advance
        ? el('button', { class: 'btn', type: 'button', 'data-act': 'advance' }, `Move to ${LABELS(advance)}`)
        : el('span', { class: 'pill' }, 'Final stage'),
      el('button', { class: `btn quiet gate-${state}`, type: 'button', 'data-act': 'gate',
                     title: GATE_SAID[state] }, 'Gate'),
      el('button', { class: 'btn quiet', type: 'button', 'data-act': 'edit', title: 'Change this role' }, 'Edit'),
      el('button', { class: 'btn quiet', type: 'button', 'data-act': 'archive', title: 'Set this role aside' }, 'Archive')));

  const act = (name: string): HTMLElement | null => row.querySelector(`[data-act="${name}"]`);

  const advanceButton = act('advance');
  if (advanceButton && advance) {
    on(advanceButton, 'click', (event) => {
      event.stopPropagation();
      if (advance === 'decision') { askDecision(row, o); return; }
      if (advance === 'applied') { askSend(row, o); return; }
      advanceButton.setAttribute('disabled', 'true');
      void window.cairn.opportunities.save({ ...o, stage: advance }).then(() => { refresh(); });
    });
  }

  const gateButton = act('gate');
  if (gateButton) {
    on(gateButton, 'click', (event) => { event.stopPropagation(); openGate(row, o); });
  }

  const editButton = act('edit');
  if (editButton) {
    on(editButton, 'click', (event) => { event.stopPropagation(); openEditor(row, o); });
  }

  const archiveButton = act('archive');
  if (archiveButton) {
    on(archiveButton, 'click', (event) => { event.stopPropagation(); openArchive(row, o); });
  }

  // Pressing the row reads the role. Opening the posting in a browser is one press
  // inside that, because a link that has gone dead answers nothing and the text is
  // the thing you actually wanted.
  const open = (): void => openPosting(row, o);
  on(row, 'click', open);
  on(row, 'keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  });
  return row;
}

/** The posting, as it read when it was taken. Pressing the row again closes it: a
 *  control that only opens needs a second one to undo it, and that was a button on the
 *  panel doing what the row could do by itself. */
function openPosting(row: HTMLElement, o: Opportunity): void {
  const showing = row.nextElementSibling;
  const mine = showing?.classList.contains('posting') === true
    && showing.getAttribute('data-for') === o.id;
  row.parentElement?.querySelector('.rowpanel')?.remove();
  if (mine) return;

  const panel = el('div', { class: 'rowpanel posting', 'data-for': o.id },
    el('h4', {}, `${o.company} — ${o.role}`));

  const facts = el('p', { class: 'lede' },
    [o.location, o.remote === 'unstated' ? null : o.remote, mask.amounts(money(o))]
      .filter((one) => one !== null && one !== '').join(' · '));
  panel.append(facts);

  if (o.posting === null || o.posting.trim() === '') {
    panel.append(el('p', {},
      'No posting was kept for this one. A role added by hand has nothing to read, and '
      + 'a lead taken before Cairn started keeping them has nothing either — paste it in '
      + 'under Edit and it stays with the role after the link dies.'));
  } else {
    const text = el('div', { class: 'postingtext' });
    for (const block of o.posting.split(/\n{2,}/)) {
      const line = block.trim();
      if (line !== '') text.append(el('p', {}, line));
    }
    panel.append(text);
  }

  // A link, because that is what it is. It opens in a browser rather than in here,
  // and the row you pressed to read this closes it again.
  if (o.url !== null) {
    const link = el('a', { class: 'exlink', href: o.url, rel: 'noreferrer' }, 'Open the posting');
    on(link, 'click', (event) => {
      event.preventDefault();
      if (o.url !== null) void window.cairn.open.external(o.url);
    });
    panel.append(el('p', {}, link));
  }

  row.after(panel);
}


/** The six questions, the form behind them, and the three things no question could say.
 *  Every question but the last asks about the posting; the last asks about us, and
 *  Cairn answers it outright because it already holds every application. */
function openGate(row: HTMLElement, o: Opportunity): void {
  row.parentElement?.querySelector('.rowpanel')?.remove();

  const existing = new Map((o.gate?.answers ?? []).map((a) => [a.id, a]));
  const fields = GATE_QUESTIONS.map((question) => {
    const held = existing.get(question.id);
    const answer = el('input', { type: 'text', class: 'wide', value: held?.answer ?? '',
      id: `answer-${question.id}-${o.id}` });
    const settled = el('input', {
      type: 'checkbox', id: `settled-${question.id}-${o.id}`,
    });
    if (held?.settled) settled.setAttribute('checked', 'checked');
    return { question, answer, settled };
  });

  const form = formEditor(o);

  const blocker = el('input', { type: 'text', class: 'wide', value: o.blocker ?? '',
    placeholder: 'What is outstanding — clear it by writing “cleared” in front, never by deleting' });
  const concession = el('select', {},
    ...([['', 'None'], ['owed', 'Owed — named nowhere yet'], ['delivered', 'Delivered']] as const)
      .map(([value, label]) => el('option',
        value === (o.concession ?? '') ? { value, selected: 'selected' } : { value }, label)));
  const contact = el('input', { type: 'text', class: 'wide', value: o.contact ?? '',
    placeholder: 'Name, title, and an address or link' });
  const channel = el('select', {},
    ...['', ...CHANNELS].map((value) => el('option',
      value === (o.followupChannel ?? '') ? { value, selected: 'selected' } : { value },
      value === '' ? 'Not looked yet' : value)));
  // Two states the answers can never add up to. Blocked is not "nobody has started":
  // it is a role with no route, where there is nothing to start.
  const declared = el('select', {},
    ...([['', 'Run it normally'],
         ['blocked', 'Cannot be run — no route to apply'],
         ['retrofitted', 'Sent before Cairn']] as const)
      .map(([value, label]) => el('option',
        value === (o.gate?.declared ?? '') ? { value, selected: 'selected' } : { value }, label)));

  const save = el('button', { class: 'btn solid', type: 'button' }, 'Save the gate');
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Cancel');

  const panel = el('div', { class: 'rowpanel' }, el('p', {}, `The gate for ${o.company} — ${o.role}.`));
  for (const { question, answer, settled } of fields) {
    panel.append(el('div', { class: 'frow' },
      el('div', {}, el('label', { for: answer.id }, question.ask)),
      el('div', { class: 'gateanswer' }, answer,
        el('label', { class: 'ticked', for: settled.id }, settled, 'Answered'))));
  }
  panel.append(form.block);
  panel.append(
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Blocker')), blocker),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Concession'),
      el('small', {}, 'A gap that had to be named, on a form with nowhere to name it.')), concession),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Contact')), contact),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Follow-up channel')), channel),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'State of the gate')), declared),
    el('div', { class: 'inline' }, save, cancel));

  on(cancel, 'click', () => panel.remove());
  on(save, 'click', () => {
    save.setAttribute('disabled', 'true');
    const chosenDeclaration = (declared as HTMLSelectElement).value;
    const gate: Gate = {
      answers: fields.map(({ question, answer, settled }) => ({
        id: question.id,
        answer: answer.value.trim() === '' ? null : answer.value.trim(),
        settled: (settled as HTMLInputElement).checked,
      })),
      fields: form.read(),
      declared: chosenDeclaration === '' ? null : (chosenDeclaration as GateDeclaration),
    };
    const chosen = (concession as HTMLSelectElement).value;
    const via = (channel as HTMLSelectElement).value;
    void window.cairn.opportunities.save({
      ...o,
      gate,
      blocker: blocker.value.trim() === '' ? null : blocker.value.trim(),
      concession: chosen === '' ? null : (chosen as Opportunity['concession']),
      contact: contact.value.trim() === '' ? null : contact.value.trim(),
      followupChannel: via === '' ? null : (via as Opportunity['followupChannel']),
    }).then(() => { refresh(); });
  });

  // Question 6, answered from what Cairn already holds.
  void window.cairn.opportunities.liveAt(o.company, o.id).then((at) => {
    if (at.live.length === 0 && at.declined.length === 0) return;
    const note = el('div', { class: 'gatenote' });
    if (at.live.length > 0) {
      note.append(
        el('b', {}, `You already have ${at.live.length} live at ${o.company}.`),
        el('small', {}, at.live.map((one) => `${one.role} — sent ${(one.appliedAt ?? '').slice(0, 10)}`).join('; ')),
        el('small', {}, 'A lower row waits behind a higher one rather than going alongside it.'));
    }
    if (at.declined.length > 0) {
      note.append(
        el('b', {}, `${o.company} has turned you down ${at.declined.length === 1 ? 'once' : `${at.declined.length} times`}.`),
        el('small', {}, at.declined.map((one) => `${one.role} — ${one.at.slice(0, 10)}`).join('; ')),
        el('small', {}, 'Applying again the same week reads as not having heard the answer.'));
    }
    panel.querySelector('p')?.after(note);
  });

  row.after(panel);
}

/** What the apply form demands, one row per box. Observing a field is not answering it,
 *  so a required box with nothing in it holds the gate at partial however many of the
 *  six questions are ticked. */
function formEditor(o: Opportunity): { block: HTMLElement; read: () => GateField[] } {
  const rows = el('div', { class: 'formfields' });
  const made: { label: HTMLInputElement; required: HTMLInputElement;
                own: HTMLInputElement; answer: HTMLTextAreaElement; row: HTMLElement }[] = [];

  const add = (held: GateField | null): void => {
    const label = el('input', { type: 'text', class: 'wide', value: held?.label ?? '',
      placeholder: 'What the form calls this box' }) as HTMLInputElement;
    const required = el('input', { type: 'checkbox' }) as HTMLInputElement;
    if (held?.required ?? true) required.setAttribute('checked', 'checked');
    const own = el('input', { type: 'checkbox' }) as HTMLInputElement;
    if (held?.ownWords) own.setAttribute('checked', 'checked');
    const answer = el('textarea', { rows: '2',
      placeholder: 'What goes in it' }) as HTMLTextAreaElement;
    answer.value = held?.answer ?? '';
    const drop = el('button', { class: 'btn quiet', type: 'button' }, 'Remove');
    const draft = el('button', { class: 'btn quiet', type: 'button' }, 'Ask for a draft');
    const row = el('div', { class: 'formfield' },
      el('div', { class: 'inline wrapping' }, label,
        el('label', { class: 'ticked' }, required, 'Required'),
        el('label', { class: 'ticked' }, own, 'My own words'),
        draft, drop),
      answer);
    on(draft, 'click', () => {
      const question = label.value.trim();
      if (question === '') { label.focus(); return; }
      draft.setAttribute('disabled', 'true');
      void ask('suggest-answer', `ask:${question}`, own.checked ? 'own-words' : undefined)
        .then((result) => {
          draft.removeAttribute('disabled');
          if (result?.text !== undefined && result.text !== null && result.text.trim() !== '') {
            answer.value = result.text.trim();
          }
        });
    });
    on(drop, 'click', () => {
      row.remove();
      const at = made.findIndex((one) => one.row === row);
      if (at > -1) made.splice(at, 1);
    });
    // The employer asked for the candidate's own words, so what goes here is raw
    // material for them rather than prose to paste, and nothing drafts it.
    const sayOwn = (): void => {
      answer.setAttribute('placeholder', own.checked
        ? 'Facts and angles for them to write from — not sentences to paste'
        : 'What goes in it');
      draft.textContent = own.checked ? 'Ask for material' : 'Ask for a draft';
    };
    on(own, 'change', sayOwn);
    sayOwn();
    made.push({ label, required, own, answer, row });
    rows.append(row);
  };

  for (const held of o.gate?.fields ?? []) add(held);

  const more = el('button', { class: 'btn', type: 'button' }, 'Add a field');
  on(more, 'click', () => { add(null); });

  const block = el('div', { class: 'frow' },
    el('div', {}, el('label', {}, 'The form, box by box'),
      el('small', {}, 'A required box with nothing in it holds the gate at part-answered.')),
    el('div', {}, rows, more));

  return {
    block,
    read: () => made
      .map((one) => ({
        label: one.label.value.trim(),
        required: one.required.checked,
        ownWords: one.own.checked,
        answer: one.answer.value.trim() === '' ? null : one.answer.value.trim(),
      }))
      .filter((one) => one.label !== ''),
  };
}

/** Sending is the move the gate exists in front of, and the board made it one drag.
 *  It does not refuse -- an application sent before the gate existed is a real thing,
 *  and Preflight already records the ones that went without one. It asks first, which
 *  is the difference between a decision and an accident. */
function askSend(anchor: HTMLElement, o: Opportunity): void {
  const state = gateState(o.gate);
  const settled = state === 'run' || state === 'retrofitted';
  const reachable = o.followupChannel !== null;
  if (settled && reachable) { markSent(o, null, null); return; }
  anchor.parentElement?.querySelector('.rowpanel')?.remove();

  const panel = el('div', { class: 'rowpanel' },
    el('p', {}, `Sending ${o.company} — ${o.role}.`));

  if (!settled) {
    panel.append(el('p', { class: 'lede' }, state === 'not-run'
      ? 'The gate has not been run on this one.'
      : 'The gate on this one is part-answered.'));
  }

  // The one step of the follow-up that belongs in this sitting rather than in two
  // weeks: a posting names its poster, and a taken-down posting names nobody.
  const contact = el('input', { type: 'text', class: 'wide', value: o.contact ?? '',
    placeholder: 'Name, title, and an address or link' });
  const channel = el('select', {},
    ...['', ...CHANNELS].map((value) => el('option',
      value === (o.followupChannel ?? '') ? { value, selected: 'selected' } : { value },
      value === '' ? 'Not looked yet' : value)));
  panel.append(
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Who a nudge goes to')), contact),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'How it travels'),
      el('small', {}, 'Findable today and not in a fortnight. “none-found” is an answer.')), channel));

  const record = (): void => {
    const via = (channel as HTMLSelectElement).value;
    markSent(o, contact.value.trim() === '' ? null : contact.value.trim(),
      via === '' ? null : (via as Opportunity['followupChannel']));
  };

  const acts = el('div', { class: 'inline wrapping' });
  if (!settled) {
    const run = el('button', { class: 'btn solid', type: 'button' }, 'Run the gate first');
    on(run, 'click', () => { panel.remove(); openGate(anchor, o); });
    const anyway = el('button', { class: 'btn', type: 'button' }, 'Send it anyway');
    on(anyway, 'click', () => { anyway.setAttribute('disabled', 'true'); record(); });
    acts.append(run, anyway);
  } else {
    const go = el('button', { class: 'btn solid', type: 'button' }, 'Record it as sent');
    on(go, 'click', () => { go.setAttribute('disabled', 'true'); record(); });
    acts.append(go);
  }
  const cancel = el('button', { class: 'btn quiet', type: 'button' }, 'Cancel');
  on(cancel, 'click', () => panel.remove());
  acts.append(cancel);

  panel.append(acts);
  anchor.after(panel);
}

/** Reaching applied is an event rather than a field edit: it records the date, starts
 *  the clock on the silence, and sets the reminder to chase. */
function markSent(o: Opportunity, contact: string | null,
                  channel: Opportunity['followupChannel']): void {
  const first = contact === null && channel === null
    ? Promise.resolve(true)
    : window.cairn.opportunities.save({ ...o, contact, followupChannel: channel });
  void first
    .then(() => window.cairn.applications.markSent(o.id, null))
    .then(() => { refresh(); });
}

/** What happened. Reaching the last stage is not an outcome -- offered, turned down and
 *  withdrawn all land in the same column, and a month later the row cannot tell you
 *  which. Asked at the moment of the move, which is the only moment anybody knows. */
function askDecision(anchor: HTMLElement, o: Opportunity): void {
  anchor.parentElement?.querySelector('.rowpanel')?.remove();

  const panel = el('div', { class: 'rowpanel' },
    el('p', {}, `What happened with ${o.company} — ${o.role}?`));

  const record = (kind: 'offer' | 'rejected' | 'withdrawn' | null, detail: string | null): void => {
    if (kind === null) {
      void window.cairn.opportunities.save({ ...o, stage: 'decision' }).then(() => { refresh(); });
      return;
    }
    // The event moves the role on its own: an offer to the last stage, a refusal or a
    // withdrawal out of the pipeline entirely.
    void window.cairn.applications.addEvent(o.id, kind, detail).then(() => { refresh(); });
  };

  const choices: [string, () => void][] = [
    ['They made an offer', () => record('offer', null)],
    ['They turned me down', () => record('rejected', null)],
    ['Not the fit I wanted', () => record('withdrawn', 'Not the fit I wanted')],
    ['I withdrew', () => record('withdrawn', null)],
    ['Not decided yet', () => record(null, null)],
  ];
  const row = el('div', { class: 'inline wrapping' });
  for (const [label, take] of choices) {
    const button = el('button', { class: 'btn', type: 'button' }, label);
    on(button, 'click', () => { button.setAttribute('disabled', 'true'); take(); });
    row.append(button);
  }
  const cancel = el('button', { class: 'btn quiet', type: 'button' }, 'Cancel');
  on(cancel, 'click', () => panel.remove());
  row.append(cancel);
  panel.append(row);
  anchor.after(panel);
}

/** Setting a role aside asks why, because the reason is the whole value of the record:
 *  a role dropped for a reason and a role never looked at read identically later. */
function openArchive(row: HTMLElement, o: Opportunity): void {
  const existing = row.parentElement?.querySelector('.rowpanel');
  if (existing) existing.remove();

  const reason = el('input', { type: 'text', class: 'wide',
    placeholder: 'Why — band, location, discipline, already applied there…' });
  const confirm = el('button', { class: 'btn solid', type: 'button' }, 'Set aside');
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Keep it');
  const panel = el('div', { class: 'rowpanel' },
    el('p', {}, `Setting aside ${o.company} — ${o.role}. It leaves the pipeline and keeps its record.`),
    el('div', { class: 'inline' }, reason, confirm, cancel));

  on(cancel, 'click', () => panel.remove());
  on(confirm, 'click', () => {
    confirm.setAttribute('disabled', 'true');
    void window.cairn.opportunities.archive(o.id, reason.value).then(() => { refresh(); });
  });
  row.after(panel);
  reason.focus();
}

/** Everything about a role that a person decides. Fit is the one the screens leave
 *  open on purpose, and until now there was nowhere to put it. */
function openEditor(row: HTMLElement, o: Opportunity): void {
  const existing = row.parentElement?.querySelector('.rowpanel');
  if (existing) existing.remove();

  const fit = el('select', {},
    ...(['', 'strong', 'possible', 'weak'] as const).map((value) =>
      el('option', value === (o.fit ?? '') ? { value, selected: 'selected' } : { value },
        value === '' ? 'Not decided' : value)));
  const action = el('input', { type: 'text', class: 'wide', value: o.nextAction ?? '',
    placeholder: 'What has to happen next' });
  const due = el('input', { type: 'date', value: (o.nextActionDue ?? '').slice(0, 10) });
  const notes = el('textarea', { rows: '4', placeholder: 'Anything worth keeping about this one' });
  notes.textContent = o.notes ?? '';
  const posting = el('textarea', { rows: '6',
    placeholder: 'Paste the posting here and it stays with the role after the link dies' });
  posting.textContent = o.posting ?? '';

  const save = el('button', { class: 'btn solid', type: 'button' }, 'Save');
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Cancel');
  const panel = el('div', { class: 'rowpanel' },
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Fit'),
      el('small', {}, 'No screen sets this.')), fit),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Next action')), action),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Due')), due),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Notes')), notes),
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'The posting')), posting),
    el('div', { class: 'inline' }, save, cancel));

  on(cancel, 'click', () => panel.remove());
  on(save, 'click', () => {
    save.setAttribute('disabled', 'true');
    const chosen = (fit as HTMLSelectElement).value;
    void window.cairn.opportunities.save({
      ...o,
      fit: chosen === '' ? null : (chosen as Opportunity['fit']),
      nextAction: action.value.trim() === '' ? null : action.value.trim(),
      nextActionDue: due.value === '' ? null : due.value,
      notes: notes.value.trim() === '' ? null : notes.value.trim(),
      posting: posting.value.trim() === '' ? null : posting.value.trim(),
    }).then(() => { refresh(); });
  });
  row.after(panel);
}


/** What was set aside, and why. Everything archived used to be reachable only as rows
 *  in the raw table browser -- and the reason it was set aside was not there at all. */
function drawSetAside(host: HTMLElement): Promise<void> {
  return window.cairn.opportunities.archived().then((rows) => {
    clear(host);
    if (rows.length === 0) {
      host.append(el('p', { class: 'lede' }, 'Nothing set aside yet.'));
      return;
    }
    host.append(el('p', { class: 'lede' },
      `${rows.length} ${rows.length === 1 ? 'role' : 'roles'}, newest first.`));
    paged(host, {
      items: rows,
      page: asidePage,
      size: 20,
      onSize: () => { /* the set-aside list keeps its own size, and nothing else uses it */ },
      render: (into, shown) => {
        for (const one of shown) into.append(asideRow(one));
      },
    });
  });
}

/** One role that was set aside, with why and a way back. */
function asideRow({ opportunity, reason }: { opportunity: Opportunity; reason: string | null }): HTMLElement {
      const back = el('button', { class: 'btn', type: 'button' }, 'Put it back');
      on(back, 'click', () => {
        back.setAttribute('disabled', 'true');
        void window.cairn.opportunities.restore(opportunity.id).then(() => { refresh(); });
      });
  return el('div', { class: 'row', 'data-role': opportunity.id },
    el('span', {},
      el('b', {}, mask.company(opportunity.company)),
      el('small', {}, opportunity.role)),
    el('span', { class: 'band' }, mask.amounts(money(opportunity))),
    el('span', {}, el('small', { class: 'nextsmall' }, reason ?? 'No reason recorded')),
    el('span', { class: 'rowacts' }, back));
}

export async function renderPipeline(
  body: HTMLElement, all: Opportunity[], settings: Settings,
): Promise<void> {
  const LABELS = (stage: Stage): string => stageName(stage, settings);
  if (all.length === 0) {
    body.append(
      el('div', { class: 'empty' },
        el('h2', {}, 'Your pipeline is empty'),
        el('p', {},
          'Roles you keep from Leads land here, grouped by where they have got to — ' +
          'and a role you found somewhere Cairn does not read can be added by hand.')),
      addByHand(),
    );
    return;
  }

  const profile = await window.cairn.profile.get();
  // Narrowed before the stage counts are taken, so a tab never says a number the list
  // under it does not have.
  const opportunities = narrow(all, narrowing, profile, profile.skills, (one) => one);
  const bar = narrowingBar({
    now: narrowing, skills: profile.skills, rules: profile,
    total: all.length, shown: opportunities.length,
    onChange: (next) => { narrowing = next; page.at = 0; refresh(); },
  });
  if (opportunities.length === 0) {
    body.append(bar, el('p', { class: 'lede' }, 'No role matches this. Show everything to see them all.'));
    return;
  }

  const wanted = focusedRole();

  // A jump asks for one role. The board draws five cards a column, so the one you asked
  // for is usually not on it -- and a board is a place you choose to be rather than
  // somewhere to be dropped. The choice is not changed, only this drawing of it.
  if (settings.pipelineLayout === 'board' && wanted === null) {
    body.append(bar);
    drawBoard(body, opportunities, LABELS);
    body.append(addByHand());
    return;
  }

  // One stage at a time. All five at once was 156 rows and fourteen screens, with the
  // heading that said which stage you were in seven screens behind you.
  const holding = wanted === null ? null : opportunities.find((o) => o.id === wanted)?.stage ?? null;
  const filled: (Stage | 'aside' | 'all')[] = [
    'all', ...STAGES.filter((stage) => opportunities.some((o) => o.stage === stage)), 'aside',
  ];
  // Set aside is a real tab, so returning to it is remembered like any other.
  const opening: Stage | 'aside' | 'all' =
    holding ?? (filled.includes(showing) ? showing : filled[0] ?? 'all');

  // sections() owns what it is given, so it gets a host of its own and the bar sits
  // above it rather than being cleared on every tab.
  const host = el('div', {});
  body.append(bar, host);
  sections({
    body: host,
    label: 'Pipeline stages',
    showing: opening,
    remember: (id) => {
      showing = id as Stage | 'aside' | 'all';
      page.at = 0;
      // A tick means a row on the list you were looking at. Another tab is another list.
      chosen.clear();
    },
    defs: [
      {
        // Every stage tab is a filter, and until this one there was no way back out of
        // it except the board.
        id: 'all' as Stage | 'aside' | 'all',
        label: `All ${opportunities.length}`,
        draw: (host: HTMLElement): void => drawStage(host, opportunities, null, LABELS, settings),
      },
      ...STAGES.map((stage) => ({
        id: stage as Stage | 'aside' | 'all',
        label: `${LABELS(stage)} ${opportunities.filter((o) => o.stage === stage).length}`,
        draw: (host: HTMLElement): void => {
          const inStage = opportunities.filter((o) => o.stage === stage);
          if (inStage.length === 0) {
            host.append(el('p', { class: 'lede' }, 'Nothing at this stage.'));
            return;
          }
          drawStage(host, inStage, stage, LABELS, settings);
        },
      })),
      {
        id: 'aside' as Stage | 'aside' | 'all',
        label: 'Set aside',
        draw: (host: HTMLElement): void | Promise<void> => drawSetAside(host),
      },
    ],
  });

  body.append(addByHand(), researchPanel(opportunities));
}
