/** Sources: what Cairn reads, how often, and what came back. */

import { clear, el, on, saying } from '../components/dom.js';
import { sections } from '../components/sections.js';
import { readableDue } from '../components/dates.js';
import { refresh } from './app.js';
import type { BoardRegistration, HarvestSummary, SourceState } from '../../shared/types.js';
import * as mask from '../mask.js';

/** Which part of the screen is showing. Three short pages: what a run will do and what
 *  the last one did, the employers you follow, and the feeds themselves. */
type Part = 'harvest' | 'employers' | 'feeds';

let part: Part = 'harvest';

/** What each screen is called, in the words the rest of the app uses. A check id on
 *  screen would be the app talking to itself. */
const SET_ASIDE: Record<string, string> = {
  title: 'Not one of your job titles',
  'already-known': 'Already in your list',
  'dropped-before': 'You said no to this before',
  'seen-this-run': 'The same posting under another search',
  'pay-floor': 'Under your pay floor',
  freshness: 'Older than your limit',
  'employer-excluded': 'An employer you excluded',
  'pay-provenance': 'Pay came from a listing site',
  unknown: 'Set aside by a screen',
};

interface Catalogue {
  id: string; label: string; kind: string; provenance: string;
  docs: string; note: string; host: string;
  origin: 'builtin' | 'shipped' | 'yours' | 'imported';
}

type Feed = NonNullable<Awaited<ReturnType<typeof window.cairn.sources.definition>>>;

export async function renderSources(body: HTMLElement): Promise<void> {
  // Which feed the editor is open on: an id to change one, null to write a new one,
  // and undefined when it is closed. The form takes the whole screen while it is open,
  // because a long form under a long list is two things competing for one scroll.
  let editing: string | null | undefined = undefined;

  // Everything here is read again on every draw. The header used to describe the state
  // the page had when it loaded, so turning a source on left it saying one thing while
  // the switches said another -- two truths on one screen, and no way to tell which.
  const draw = async (): Promise<void> => {
    const close = (): void => { editing = undefined; void draw(); };
    if (editing !== undefined) {
      const feed = editing === null ? null : await window.cairn.sources.definition(editing);
      clear(body);
      body.append(feedEditor(feed, close));
      return;
    }

    const [states, catalogue, boards, suggested, plan, harvestState, problems, packs] = await Promise.all([
      window.cairn.sources.list(),
      window.cairn.sources.catalogue() as Promise<Catalogue[]>,
      window.cairn.boards.list(),
      window.cairn.boards.suggested(),
      window.cairn.harvest.plan(),
      window.cairn.harvest.state(),
      window.cairn.sources.problems(),
      window.cairn.sources.packs(),
    ]);

    sections({
      body,
      label: 'Sources sections',
      showing: part,
      remember: (id) => { part = id; },
      defs: [
        {
          id: 'harvest',
          label: 'Fetching',
          draw: (host) => {
            host.append(runBar(states, plan, catalogue, harvestState,
              () => void draw(), () => { part = 'employers'; void draw(); }));
            if (problems.length > 0) host.append(problemsPanel(problems));
          },
        },
        {
          id: 'employers',
          label: 'Employers',
          draw: (host) => {
            const offer = suggested.length > 0 ? suggestedPanel(suggested, () => void draw()) : null;
            if (boards.length === 0 && offer) host.append(offer);
            host.append(addBoardPanel(), boardsPanel(boards));
            if (boards.length > 0 && offer) host.append(offer);
          },
        },
        {
          id: 'feeds',
          label: 'Feeds',
          draw: (host) => {
            host.append(
              sourcesPanel(states, catalogue, () => void draw(), (id) => { editing = id; void draw(); },
                () => { part = 'employers'; void draw(); }),
              packPanel(packs, () => { editing = null; void draw(); }, () => void draw()),
            );
          },
        },
      ],
    });
  };

  await draw();
}

interface Plan {
  targets: { sourceId: string; token: string; company: string }[];
  blocked: { sourceId: string; because: string }[];
  requests: number;
}

interface Progress { boards: { done: number; total: number }; feeds: { done: number; total: number } }

interface HarvestState {
  running: boolean;
  startedAt: string | null;
  progress: Progress | null;
  nextRunAt: string | null;
  lastResult: { requisitions: number; ranAt: string } | null;
  lastSummary: HarvestSummary | null;
}

function runBar(
  states: SourceState[], plan: Plan, catalogue: Catalogue[],
  harvestState: HarvestState, redraw: () => void, toEmployers: () => void,
): HTMLElement {
  const enabled = states.filter((s) => s.enabled).length;
  const lastRun = states.map((s) => s.lastRun).filter(Boolean).sort().at(-1) ?? null;
  const idle = !harvestState.running;
  const button = el('button', {
    class: 'btn solid', type: 'button',
    ...(plan.requests === 0 || harvestState.running ? { disabled: 'true' } : {}),
  }, harvestState.running ? 'Fetching…' : plan.requests === 0 ? 'Nothing to fetch' : 'Fetch now');
  const report = el('p', { class: 'runreport', hidden: idle, role: 'status' },
    harvestState.running ? 'Reading both kinds at once. This keeps going if you look at something else.' : '');

  // The two kinds, side by side, told apart by colour rather than by reading the label
  // under them. A run reads both at once, so one bar for the pair would say nothing
  // about which half is slow.
  const lanes = laneCards(plan, catalogue, harvestState, toEmployers);

  /** Watch a run to the end and redraw once it stops. */
  let following = false;
  const follow = (): void => {
    if (following) return;
    following = true;
    const timer = window.setInterval(() => {
      void window.cairn.harvest.state().then((state) => {
        if (state.progress !== null) lanes.update(state.progress);
        if (!state.running) {
          window.clearInterval(timer);
          following = false;
          // The whole shell, not this screen. A run writes requisitions, and redrawing
          // only Sources left the rail counting what it had counted before the run and
          // the queue itself showing nothing until the window was reloaded.
          refresh();
        }
      });
    }, 400);
  };

  on(button, 'click', () => {
    // Disabled the moment it is pressed, and the run itself refuses a second start.
    // The button alone is not enough: leaving this screen and coming back used to
    // hand back a fresh, enabled one.
    button.setAttribute('disabled', 'true');
    button.textContent = 'Fetching…';
    report.hidden = false;
    report.textContent = 'Reading both kinds at once. This keeps going if you look at something else.';
    follow();
    void window.cairn.harvest.run().catch((error: unknown) => {
      report.textContent = `The harvest stopped: ${saying(error)}`;
      redraw();
    });
  });

  // A run started elsewhere, or before this screen was opened. Follow it to the end
  // rather than showing a button that would do nothing.
  if (harvestState.running) follow();

  // What can actually fetch, rather than what is switched on. Four employer boards
  // are on out of the box and none of them can do anything until somebody adds a
  // board, so "9 sources on" beside "0 boards" read as boards having gone missing.
  const ready = new Set(plan.targets.map((target) => target.sourceId)).size;
  const summary = el('div', {},
    el('h3', {},
      ready === enabled
        ? `${enabled} ${enabled === 1 ? 'source' : 'sources'} on`
        : `${ready} of ${enabled} sources can run`),
    el('p', {},
      lastRun === null
        ? 'Cairn has never fetched anything on this machine.'
        : `Last run ${new Date(lastRun).toLocaleString()}.`));

  // What the last run actually did, kept from one session to the next. "Kept none"
  // and "did not run" look identical without it, which is how somebody presses a
  // button ten times and cannot tell whether anything is happening.
  if (harvestState.lastSummary !== null) summary.append(lastRunFigures(harvestState.lastSummary));

  // And when the next unattended one falls due. A schedule nobody can see is one
  // nobody can tell is working, on the app that counts every request it makes.
  if (harvestState.nextRunAt !== null) {
    const at = new Date(harvestState.nextRunAt);
    summary.append(el('p', { class: 'planline' },
      `Next check on its own: ${readableDue(harvestState.nextRunAt)} at ` +
      `${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`));
  }

  summary.append(report);
  summary.append(lanes.element);

  return el('section', { class: 'runbar' }, summary, button);
}

/** One card per kind of source: how many requests it will make, how far it has got,
 *  and what is stopping it. */
function laneCards(
  plan: Plan, catalogue: Catalogue[], harvestState: HarvestState, toEmployers: () => void,
): { element: HTMLElement; update: (progress: Progress) => void } {
  const kindOf = new Map(catalogue.map((c) => [c.id, c.kind]));
  const label = (id: string): string => catalogue.find((c) => c.id === id)?.label ?? id;
  const isBoard = (id: string): boolean => kindOf.get(id) === 'ats';

  const element = el('div', { class: 'lanes' });
  const bars = new Map<'boards' | 'feeds', { fill: HTMLElement; note: HTMLElement; total: number }>();

  const build = (
    lane: 'boards' | 'feeds', title: string, what: string, mine: (id: string) => boolean,
    empty?: HTMLElement,
  ): void => {
    const targets = plan.targets.filter((t) => mine(t.sourceId));
    const blocked = plan.blocked.filter((b) => mine(b.sourceId));
    const done = harvestState.progress?.[lane].done ?? 0;
    const total = harvestState.progress?.[lane].total ?? targets.length;

    const fill = el('span', { style: `width: ${total === 0 ? 0 : Math.round((done / total) * 100)}%` });
    const note = el('p', { class: 'lanenote' },
      harvestState.running ? `${done} of ${total} read` : '');
    const card = el('div', { class: 'lane', 'data-lane': lane },
      el('h4', {}, title),
      el('p', {}, targets.length === 0
        ? `Nothing to read. ${what}`
        : `${targets.length} ${targets.length === 1 ? 'request' : 'requests'}, one at a time.`),
      el('div', { class: 'lanebar', role: 'progressbar' }, fill),
      note);
    // The form that fixes this used to be on the same page. It is a section away now,
    // so the way to it is here rather than the word "below".
    if (targets.length === 0 && empty !== undefined) card.append(empty);

    // Grouped by reason. Three identical sentences is three chances to skip the one
    // thing worth acting on.
    const byReason = new Map<string, string[]>();
    for (const one of blocked) {
      byReason.set(one.because, [...(byReason.get(one.because) ?? []), label(one.sourceId)]);
    }
    for (const [because, names] of byReason) {
      card.append(el('p', { class: 'planline blocked' }, `${listOf(names)}: ${because}.`));
    }

    bars.set(lane, { fill, note, total });
    element.append(card);
  };

  const addBoard = el('button', { class: 'btn ghost', type: 'button' }, 'Add an employer');
  on(addBoard, 'click', toEmployers);

  build('boards', 'Employer boards', 'Cairn polls an employer’s own board by name.',
    (id) => isBoard(id), el('p', { class: 'laneact' }, addBoard));
  build('feeds', 'Listing sites', 'Turn one on under Feeds and Cairn searches it for your job titles.',
    (id) => !isBoard(id));

  return {
    element,
    update: (progress) => {
      for (const lane of ['boards', 'feeds'] as const) {
        const bar = bars.get(lane);
        if (bar === undefined) continue;
        const { done, total } = progress[lane];
        bar.fill.style.width = `${total === 0 ? 0 : Math.round((done / total) * 100)}%`;
        bar.note.textContent = total === 0 ? '' : `${done} of ${total} read`;
      }
    },
  };
}

/** Adding or removing a board changes the plan in the header, so the whole view is
 *  drawn again rather than the one panel that changed. */
const redrawAll = (): void => refresh();

/** Boards Cairn knows are real, so a first run has somewhere to fetch from without
 *  anybody hunting for eleven careers pages. Nothing here is being watched: adding one
 *  is what records it, and the list is the same for everybody until you change it. */
function suggestedPanel(suggested: BoardRegistration[], done: () => void): HTMLElement {
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const rows = el('div', {});

  const add = (wanted: BoardRegistration[], button: HTMLElement): void => {
    button.setAttribute('disabled', 'true');
    void window.cairn.boards
      .addSuggested(wanted.map((one) => ({ sourceId: one.sourceId, token: one.token, company: one.company })))
      .then(done)
      .catch((error: unknown) => {
        button.removeAttribute('disabled');
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  };

  for (const one of suggested) {
    const button = el('button', { class: 'btn ghost', type: 'button' }, 'Add');
    on(button, 'click', () => add([one], button));
    rows.append(el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, mask.company(one.company)),
        el('small', {}, `${one.sourceId} · ${one.token}`)),
      button));
  }

  const all = el('button', { class: 'btn', type: 'button' },
    `Add all ${suggested.length}`);
  on(all, 'click', () => add(suggested, all));

  return el('section', { class: 'panel' },
    el('h3', {}, 'Employers Cairn already knows'),
    el('p', {},
      'None of these is being watched. They are here so a first run has somewhere to fetch from — ' +
      'adding one records it in your vault, and removing it takes it out again.'),
    el('div', { class: 'frow' },
      el('div', {}, el('label', {}, 'All of them')),
      all),
    rows, problem);
}

function addBoardPanel(): HTMLElement {
  const url = el('input', { type: 'text', id: 'boardurl', placeholder: 'https://…' });
  const company = el('input', { type: 'text', id: 'boardname', placeholder: 'What to call them' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Add this board');

  const form = el('form', {},
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'boardurl' }, 'A link to any job on their careers page'),
        el('small', {}, 'Cairn reads which board it is from the address. It does not open the page.')),
      url),
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'boardname' }, 'Company name')), company),
    problem, submit);

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    window.cairn.boards
      .add(url.value, company.value)
      .then(redrawAll)
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  return el('section', { class: 'panel' },
    el('h3', {}, 'Add an employer'),
    el('p', {}, 'Open a company’s careers page, copy the address of any job on it, and paste it here.'),
    form);
}

function boardsPanel(boards: BoardRegistration[]): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Employers I follow'));
  if (boards.length === 0) {
    panel.append(el('p', {},
      'None yet. Cairn knows a few to start from, listed below, and none of them is watched until you ' +
      'add it. An employer’s own board is the part that keeps working when a listing site closes its API.'));
    return panel;
  }
  for (const board of boards) {
    const remove = el('button', { class: 'btn ghost', type: 'button' }, 'Remove');
    on(remove, 'click', () => {
      void window.cairn.boards.remove(board.sourceId, board.token).then(redrawAll);
    });
    panel.append(
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, mask.company(board.company)),
        el('small', {}, `${board.sourceId} · ${mask.company(board.token)}`)),
        remove),
    );
  }
  return panel;
}

/** A file Cairn was told to read and could not. Said out loud rather than swallowed:
 *  a feed that failed to load looks exactly like a feed with nothing new, and nothing
 *  new is what a healthy run looks like. */
function problemsPanel(problems: string[]): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Something you added could not be read'));
  for (const problem of problems) panel.append(el('p', { class: 'planline blocked' }, problem));
  return panel;
}

function packPanel(
  packs: { file: string; sources: string[] }[], write: () => void, changed: () => void,
): HTMLElement {
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const result = el('p', { class: 'planline', hidden: true, role: 'status' });
  const button = el('button', { class: 'btn', type: 'button' }, 'Import a source pack…');
  const add = el('button', { class: 'btn solid', type: 'button' }, 'Write a feed');
  on(add, 'click', write);

  on(button, 'click', () => {
    problem.hidden = true;
    result.hidden = true;
    void window.cairn.sources
      .importPack()
      .then((imported) => {
        if (imported === null) return;
        result.textContent =
          `Read ${imported.file}: ${listOf(imported.sources)}. ` +
          `Nothing was switched on — turn on what you want above.`;
        result.hidden = false;
        changed();
      })
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Add a feed Cairn has never heard of'),
    el('p', {},
      'A listing site is an address and a list of what its fields are called. Write one here, or import a ' +
      'source pack — the same thing as a file, which is how you would send one to somebody else. Neither ' +
      'fetches anything: a new feed arrives switched off like every other, and you can read where it points ' +
      'before you turn it on.'),
    el('div', { class: 'frow' }, add, button), result, problem);

  for (const pack of packs) {
    const remove = el('button', { class: 'btn ghost', type: 'button' }, 'Remove');
    on(remove, 'click', () => { void window.cairn.sources.removePack(pack.file).then(changed); });
    panel.append(
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, pack.file),
          el('small', {}, `Imported · ${listOf(pack.sources)}`)),
        remove),
    );
  }
  return panel;
}

/** "Greenhouse, Lever and Ashby" rather than a comma-separated run. */
function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** The form behind "Edit". A feed is an address with the search term in it and a list
 *  saying what its fields are called, so that is what this asks for -- and it is judged
 *  by the same reader that judges a file somebody sends you. */
function feedEditor(feed: Feed | null, done: () => void): HTMLElement {
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const fields = (feed?.fields ?? {}) as Record<string, string>;

  const text = (id: string, value: string, placeholder: string): HTMLInputElement => {
    const input = el('input', { type: 'text', id, placeholder });
    input.value = value;
    return input;
  };
  const box = (id: string, label: string, hint: string, input: HTMLElement): HTMLElement =>
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: id }, label), el('small', {}, hint)), input);

  const label = text('f-label', feed?.label ?? '', 'What to call it');
  const endpoint = text('f-endpoint', feed?.endpoint ?? '', 'https://example.com/api/jobs?q={query}');
  const list = text('f-list', feed?.list ?? '', 'jobs');
  const note = text('f-note', feed?.note ?? '', 'What it is good for, and where it is weak');
  const searchless = el('button', {
    class: 'sw', type: 'button', 'aria-label': 'It takes no search term',
    'aria-pressed': String(feed?.searchless === true),
  });
  on(searchless, 'click', () => {
    searchless.setAttribute('aria-pressed', String(searchless.getAttribute('aria-pressed') !== 'true'));
  });

  const map: [string, string, string][] = [
    ['company', 'Company', 'Required. A dotted path such as employer.name works.'],
    ['role', 'Job title', 'Required.'],
    ['url', 'Link to the posting', ''],
    ['description', 'Description', 'What the screens read for pay, location and your skills.'],
    ['location', 'Location', ''],
    ['postedAt', 'Date posted', 'A date, or a unix stamp.'],
    ['remoteFlag', 'Remote flag', 'A true/false field, used only when there is no location.'],
    ['payMin', 'Pay, bottom', ''],
    ['payMax', 'Pay, top', ''],
    ['payDisclosure', 'Where the pay figure came from', 'Read only when it says the employer posted it.'],
  ];
  const inputs = new Map<string, HTMLInputElement>();
  const mapRows = el('div', {});
  for (const [key, title, hint] of map) {
    const input = text(`f-${key}`, fields[key] ?? '', key);
    inputs.set(key, input);
    mapRows.append(box(`f-${key}`, title, hint, input));
  }

  const save = el('button', { class: 'btn solid', type: 'submit' }, feed === null ? 'Add this feed' : 'Save');
  const cancel = el('button', { class: 'btn ghost', type: 'button' }, 'Cancel');
  on(cancel, 'click', done);

  const form = el('form', {},
    box('f-label', 'Name', 'Shown on this screen and nowhere else.', label),
    box('f-endpoint', 'Address', 'https only. Put {query} where the search term goes.', endpoint),
    box('f-list', 'Where the jobs are', 'The key holding the list. Leave empty if the answer is itself a list.', list),
    box('f-note', 'What it is', 'A sentence for the next person to read this screen, which is usually you.', note),
    el('div', { class: 'frow' },
      el('div', {}, el('label', {}, 'It takes no search term'),
        el('small', {}, 'Some feeds hand back one list of everything. Those are fetched once a run rather than once per job title.')),
      searchless),
    el('h4', {}, 'What its fields are called'),
    mapRows, problem,
    el('div', { class: 'frow' }, save, cancel));

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    const built: Record<string, string> = {};
    for (const [key, input] of inputs) {
      if (input.value.trim() !== '') built[key] = input.value.trim();
    }
    const definition = {
      // An id is never edited: it is what a saved feed is found by, and changing it
      // would leave the old one behind rather than renaming anything.
      id: feed?.id ?? slug(label.value),
      label: label.value.trim(),
      kind: (feed?.kind ?? 'aggregator') as 'ats' | 'aggregator',
      docs: feed?.docs ?? '',
      endpoint: endpoint.value.trim(),
      ...(list.value.trim() === '' ? {} : { list: list.value.trim() }),
      ...(searchless.getAttribute('aria-pressed') === 'true' ? { searchless: true } : {}),
      ...(note.value.trim() === '' ? {} : { note: note.value.trim() }),
      fields: built,
    };
    void window.cairn.sources
      .saveFeed(definition)
      .then(done)
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  return el('section', { class: 'panel' },
    el('h3', {}, feed === null ? 'A feed of your own' : `Editing ${feed.label}`),
    el('p', {},
      'This is saved in your vault rather than in the app, so a feed you add or change here is yours. ' +
      'There is nowhere to put a key or a password: a feed that needs an account is one Cairn does not read.'),
    form);
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'feed';
}

function sourcesPanel(
  states: SourceState[], catalogue: Catalogue[], changed: () => void, edit: (id: string) => void,
  toEmployers: () => void,
): HTMLElement {
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Where Cairn can read from'),
    el('p', {}, 'An employer’s own board states its own pay and location. A listing site republishes somebody else’s, and Cairn labels every figure from one as a claim.'));

  for (const state of states) {
    const source = byId.get(state.id);
    const toggle = el('button', {
      class: 'sw', type: 'button',
      'aria-pressed': String(state.enabled),
      'aria-label': `Use ${source?.label ?? state.id}`,
    });
    on(toggle, 'click', () => {
      const next = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(next));
      // Redraw once it is saved, so the header is never describing an older state
      // than the switch beside it.
      void window.cairn.sources.setEnabled(state.id, next).then(changed);
    });

    const name = source?.label ?? state.id;
    const detail = [
      source?.kind === 'ats' ? 'The employer’s own board' : 'A listing site',
      // Where the requests go. Worth reading before a switch is turned on, and the
      // only thing on this screen that a pack from somebody else decides.
      source?.host,
      // In words, because the pencil beside the name says a feed can be edited and
      // not whether this one is already your own version of it.
      source?.origin === 'yours' ? 'Yours' : null,
      state.boards > 0 ? `${state.boards} ${state.boards === 1 ? 'board' : 'boards'}` : null,
      state.lastError,
    ].filter(Boolean).join(' · ');

    // Beside the name rather than in a column of its own. "Make it mine" was a button
    // wide enough to need three lines in the space left over next to the switch, on
    // every row, for the rarest thing on the screen.
    const named = el('div', { class: 'srcname' }, el('label', {}, name));
    // A built-in board is code and this form cannot describe it. Everything else came
    // from a file, so it can be changed -- and changing a shipped one writes your
    // version beside it rather than over it.
    if (source !== undefined && source.origin !== 'builtin') {
      const yours = source.origin === 'yours';
      const change = el('button', {
        class: 'iconbtn', type: 'button',
        title: yours ? `Edit your version of ${name}` : `Make ${name} yours and edit it`,
        'aria-label': yours ? `Edit your version of ${name}` : `Make ${name} yours and edit it`,
      }, '✎');
      on(change, 'click', () => edit(state.id));
      named.append(change);
    }
    if (source?.origin === 'yours') {
      const revert = el('button', {
        class: 'iconbtn', type: 'button',
        title: `Remove your version of ${name} and go back to the one Cairn ships`,
        'aria-label': `Remove your version of ${name} and go back to the one Cairn ships`,
      }, '↺');
      on(revert, 'click', () => { void window.cairn.sources.removeFeed(state.id).then(changed); });
      named.append(revert);
    }

    const about = el('div', {}, named,
      el('small', { class: state.lastError ? 'failed' : '' }, detail));
    if (source?.note) about.append(el('small', {}, source.note));
    // A board family on with nothing to poll fetches nothing, and the only place that
    // said so was the Fetching tab -- not here, where the switch was just turned on.
    if (source?.kind === 'ats' && state.enabled && state.boards === 0) {
      const fix = el('button', { class: 'linkbtn', type: 'button' }, 'Add employers');
      on(fix, 'click', toEmployers);
      about.append(el('small', { class: 'failed' },
        'On, and polling nothing: this reads an employer\u2019s own board and you have added none. ', fix));
    }

    panel.append(el('div', { class: 'frow' }, about, toggle));
  }
  return panel;
}

/** The last run, figure by figure. */
function lastRunFigures(summary: HarvestSummary): HTMLElement {
  const figures = el('div', { class: 'runfigs' });
  const line = (label: string, value: number): HTMLElement =>
    el('div', {}, el('span', {}, label), el('b', {}, value.toLocaleString()));

  figures.append(line(`Read, from ${summary.searches} ${summary.searches === 1 ? 'search' : 'searches'}`, summary.read));
  figures.append(line('Kept for you to judge', summary.kept));
  for (const [check, count] of Object.entries(summary.setAside).sort((a, b) => b[1] - a[1])) {
    figures.append(line(SET_ASIDE[check] ?? check, count));
  }
  if (summary.failed > 0) figures.append(line('Sources that did not answer', summary.failed));

  // Silent when they agree, which they should: a posting is kept or set aside for one
  // reason. A figure nobody can account for is worth more than a total that looks tidy.
  const accounted = summary.kept + Object.values(summary.setAside).reduce((total, n) => total + n, 0);
  if (accounted !== summary.read) figures.append(line('Not accounted for', summary.read - accounted));

  const reasons = Object.keys(summary.setAside);
  const OLD_NEWS = new Set(['already-known', 'dropped-before', 'seen-this-run']);
  const nothingNew = summary.kept === 0 && reasons.length > 0
    && reasons.every((check) => OLD_NEWS.has(check));

  const block = el('div', {}, figures);
  if (nothingNew) {
    block.append(el('p', { class: 'planline lastrun' },
      'Everything it read was already in your list — a listing site hands back the same postings each time.'));
  }
  return block;
}
