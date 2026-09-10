/** The shell: rail, topbar, status bar, and whichever view is current. */

import { clear, el, on, readableSize } from '../components/dom.js';
import { setScreenShare } from '../mask.js';
import { findEverything } from '../components/find.js';
import type { Opportunity, Settings, VaultStatus } from '../../shared/types.js';
import { STAGES } from '../../shared/types.js';
import { renderToday } from './today.js';
import { renderPipeline } from './pipeline.js';
import { renderSettings } from './settings.js';
import { renderPrivacy } from './privacy.js';
import { renderRequisitions } from './requisitions.js';
import { renderSources } from './sources.js';
import { renderAnswers } from './answers.js';
import { renderDocuments } from './documents.js';
import { renderApplications } from './applications.js';
import { renderInterviews } from './interviews.js';
import { renderCalendar } from './calendar.js';
import { renderPreflight } from './preflight.js';

/** Which key reaches which view. Eleven views and nine digits: the two left over are
 *  the two nobody moves between constantly, and Settings takes the shortcut every
 *  application already uses for it rather than a leftover number. */
const SHORTCUTS: Record<string, string> = { '0': 'privacy', '.': 'documents', ',': 'settings' };

export type ViewId =
  | 'today' | 'pipeline' | 'sources' | 'requisitions' | 'applications'
  | 'interviews' | 'calendar' | 'preflight' | 'answers' | 'documents' | 'privacy' | 'settings';

interface NavItem { id: ViewId; label: string; group: 'Workspace' | 'Library' }

const NAV: readonly NavItem[] = [
  { id: 'today', label: 'Today', group: 'Workspace' },
  { id: 'pipeline', label: 'Pipeline', group: 'Workspace' },
  { id: 'sources', label: 'Sources', group: 'Workspace' },
  { id: 'requisitions', label: 'Leads', group: 'Workspace' },
  { id: 'applications', label: 'Applications', group: 'Workspace' },
  { id: 'interviews', label: 'Interviews', group: 'Workspace' },
  { id: 'calendar', label: 'Calendar', group: 'Workspace' },
  { id: 'preflight', label: 'Preflight', group: 'Workspace' },
  { id: 'answers', label: 'Answer bank', group: 'Library' },
  { id: 'documents', label: 'Documents', group: 'Library' },
  { id: 'privacy', label: 'Vault & privacy', group: 'Library' },
  { id: 'settings', label: 'Settings', group: 'Library' },
];

/** The listener currently in force, so drawing the shell again replaces it rather than
 *  adding to it. */
let jumping: ((event: KeyboardEvent) => void) | null = null;

/** The key that reaches a view, and the label that says so. Built from one list so a
 *  hint on a button and the key that answers it cannot disagree. */
const KEYS = new Map<string, ViewId>([
  ...NAV.slice(0, 9).map((item, at) => [String(at + 1), item.id] as [string, ViewId]),
  ...Object.entries(SHORTCUTS).map(([key, id]) => [key, id as ViewId] as [string, ViewId]),
]);

const modifier = (): string => (navigator.userAgent.includes('Mac OS X') ? '\u2318' : 'Ctrl+');

function shortcutFor(view: ViewId): string {
  for (const [key, id] of KEYS) if (id === view) return `${modifier()}${key}`;
  return '';
}

/** What the top of each screen is called. It carried a sentence explaining the screen
 *  as well, on every screen, forever -- the interface teaching itself to somebody who
 *  is looking at it. */
const TITLES: Record<ViewId, string> = {
  today: 'Today',
  pipeline: 'Pipeline',
  sources: 'Sources',
  requisitions: 'Leads',
  applications: 'Applications',
  interviews: 'Interviews',
  calendar: 'Calendar',
  preflight: 'Preflight',
  answers: 'Answer bank',
  documents: 'Documents',
  privacy: 'Vault & privacy',
  settings: 'Settings',
};

/** Re-read what the shell shows, and redraw whichever view is showing. */
let reload: (() => Promise<void>) | null = null;

export function refresh(): void {
  void reload?.();
}

/** Re-read the counts and redraw the rail alone. */
let recount: (() => Promise<void>) | null = null;

export async function refreshCounts(): Promise<void> {
  await recount?.();
}

/** The rail alone, reading what is already in hand. The accent swatches show which one
 *  is on, so a change made anywhere else has to reach them or the two sit there
 *  disagreeing. */
let rail: (() => void) | null = null;

export function redrawRail(): void {
  rail?.();
}

/** Go to a view. Rows across the app looked like controls and did nothing, because
 *  the only thing that could change the view was the rail. */
let navigate: ((view: ViewId, focus?: string) => void) | null = null;

/** The role a jump was aimed at. Going to the screen that contains a role is not
 *  finding it: the pipeline is fourteen screens long, and arriving at the top of it
 *  leaves the reader doing the search the click was supposed to do. */
let pendingFocus: string | null = null;

export function goTo(view: ViewId, focus?: string): void {
  navigate?.(view, focus);
}

/** Which role a jump is aimed at, for a view that has to open on the right part of
 *  itself to show it. Reading it does not spend it -- the reveal below still runs. */
export function focusedRole(): string | null {
  return pendingFocus;
}

/** Put the row a jump was aimed at on screen, and say which one it is. Nothing happens
 *  when the row is not on this screen -- an archived role is not in the pipeline. */
function reveal(body: HTMLElement): void {
  if (pendingFocus === null) return;
  const row = body.querySelector(`[data-role="${CSS.escape(pendingFocus)}"]`);
  if (!(row instanceof HTMLElement)) return;
  pendingFocus = null;
  row.scrollIntoView({ block: 'center' });
  row.classList.add('found');
  window.setTimeout(() => row.classList.remove('found'), 2400);
}

export async function renderApp(root: HTMLElement, first: VaultStatus): Promise<void> {
  // Everything the shell draws is re-read together, in place, so a change made on one
  // screen reaches every other one. Held by value, a setting changed in Settings was
  // still the old value in Sources, and the bar along the bottom never moved at all.
  const status: VaultStatus = { ...first };
  const settings = await window.cairn.settings.get();
  applyAppearance(settings);

  let current: ViewId = 'today';
  const [opportunities, waiting] = await Promise.all([
    window.cairn.opportunities.list(),
    window.cairn.requisitions.list(),
  ]);

  const railEl = el('aside', { class: 'rail', id: 'rail' });
  const mainEl = el('main', { class: 'main' });
  const scrim = el('div', { class: 'scrim', hidden: true });

  const buildRail = (): void => {
    clear(railEl);
    railEl.append(
      el('div', { class: 'mark' },
        el('div', {},
          el('b', {}, 'Cairn'),
          // What you asked to be called, when you have. The machine name is a fallback
          // rather than the label: it exists to tell two machines apart, not to name you.
          el('small', {}, status.displayName.trim() !== ''
            ? status.displayName.trim()
            : status.machineName ? `Unlocked on ${status.machineName}` : 'Unlocked'))),
    );
    for (const group of ['Workspace', 'Library'] as const) {
      const section = el('div', { class: 'railgroup' }, el('h2', {}, group));
      for (const item of NAV.filter((n) => n.group === group)) {
        // Roles at the interviewing stage, which is what Today's tile counts. Counting
        // scheduled interviews instead left the rail and the tile disagreeing.
        const count =
          item.id === 'pipeline' ? opportunities.length
          : item.id === 'requisitions' ? waiting.length
          // Sent and still open, which is what the screen leads with. Everything ever
          // sent would be a number that only goes up and never asks anything of you.
          : item.id === 'applications'
            ? opportunities.filter((one) => one.appliedAt !== null && one.archivedAt === null).length
          : item.id === 'interviews' ? opportunities.filter((one) => one.stage === 'interviewing').length
          : null;
        const button = el('button', {
          class: 'nav', type: 'button', 'data-view': item.id,
          'aria-current': String(item.id === current),
          title: shortcutFor(item.id),
        }, item.label, count !== null && count > 0 ? el('span', { class: 'count' }, String(count)) : null);
        on(button, 'click', () => { navigate?.(item.id); });
        section.append(button);
      }
      railEl.append(section);
    }

    const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent colour' });
    for (const accent of ['pine', 'slate', 'mulberry', 'olive'] as const) {
      const swatch = el('button', {
        type: 'button', 'data-accent': accent, title: accent,
        'aria-pressed': String(settings.accent === accent),
      });
      on(swatch, 'click', () => {
        settings.accent = accent;
        applyAppearance(settings);
        void window.cairn.settings.set('accent', accent);
        buildRail();
      });
      swatches.append(swatch);
    }

    const shareButton = el('button', {
      class: 'lockbtn sharebtn', type: 'button', 'aria-pressed': String(settings.screenShare),
    }, settings.screenShare ? 'Showing masked' : 'Mask for sharing');
    on(shareButton, 'click', () => {
      const next = !settings.screenShare;
      settings.screenShare = next;
      applyAppearance(settings);
      void window.cairn.settings.set('screenShare', next);
      draw();
    });

    const lockButton = el('button', { class: 'lockbtn', type: 'button' }, 'Lock vault');
    on(lockButton, 'click', () => {
      // Locking is the one case that genuinely needs the whole renderer rebuilt: the
      // vault is gone and every view behind it would be reading nothing.
      void window.cairn.vault.lock();
    });
    railEl.append(el('div', { class: 'railfoot' },
      el('h2', { class: 'sr' }, 'Accent'), swatches, shareButton, lockButton));
  };

  const draw = (): void => {
    buildRail();
    clear(mainEl);
    const wide = current === 'calendar' || current === 'interviews';
    mainEl.className = wide ? 'main wide-view' : 'main';
    const heading = TITLES[current];
    const toggle = el('button', { class: 'railtoggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'rail' },
      el('span', { 'aria-hidden': 'true' }, '≡'), el('span', { class: 'sr' }, 'Show navigation'));
    on(toggle, 'click', () => {
      const open = railEl.dataset['open'] !== 'true';
      railEl.dataset['open'] = String(open);
      scrim.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });

    mainEl.append(
      el('header', { class: 'topbar' }, toggle,
        el('div', { class: 'titles' }, el('h1', {}, heading))),
    );
    // A board takes the window rather than the reading column: five columns inside a
    // 960-pixel measure leaves the fifth one off the edge, which is the one thing a
    // board must not do.
    const shape = current === 'pipeline' && settings.pipelineLayout === 'board' ? 'wrap full'
      : current === 'calendar' || current === 'interviews' ? 'wrap wide'
        : 'wrap';
    const body = el('div', { class: shape });
    mainEl.append(body);
    void Promise.resolve(paint(body, current, opportunities, settings)).then(() => reveal(body));
  };

  // Held on the window rather than the rail, so it works from anywhere in the app --
  // and released when the shell is drawn again, or a lock would leave one behind.
  const jump = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      finder.open();
      return;
    }
    const view = KEYS.get(event.key);
    if (view === undefined) return;
    event.preventDefault();
    navigate?.(view);
  };
  // The shell is drawn again on every unlock, and a listener per unlock would mean one
  // keypress jumping several times.
  if (jumping !== null) window.removeEventListener('keydown', jumping);
  jumping = jump;
  window.addEventListener('keydown', jump);

  on(scrim, 'click', () => {
    railEl.dataset['open'] = 'false';
    scrim.hidden = true;
  });

  // One overlay for the life of the shell. A second would answer the same key, and
  // both would be listening for it.
  const finder = findEverything((view, focus) => navigate?.(view as ViewId, focus));

  const barEl = el('footer', { class: 'status' });
  const drawBar = (): void => fillStatusBar(barEl, status);
  drawBar();

  clear(root);
  root.append(el('div', { class: 'shell' }, railEl, mainEl, barEl), scrim, finder.element);
  /** Everything the shell draws, read again together. Says whether anything moved, so
   *  a redraw nobody would see is one nobody has to watch flicker. */
  const reread = async (): Promise<boolean> => {
    const [freshOpportunities, freshWaiting, freshSettings, freshStatus] = await Promise.all([
      window.cairn.opportunities.list(),
      window.cairn.requisitions.list(),
      window.cairn.settings.get(),
      window.cairn.vault.status(),
    ]);
    const before = JSON.stringify([opportunities, waiting, settings, status]);
    opportunities.length = 0;
    opportunities.push(...freshOpportunities);
    waiting.length = 0;
    waiting.push(...freshWaiting);
    Object.assign(settings, freshSettings);
    Object.assign(status, freshStatus);
    applyAppearance(settings);
    return JSON.stringify([opportunities, waiting, settings, status]) !== before;
  };

  reload = async (): Promise<void> => {
    await reread();
    drawBar();
    draw();
  };
  recount = async (): Promise<void> => {
    await reread();
    drawBar();
    buildRail();
  };
  rail = (): void => buildRail();
  navigate = (view: ViewId, focus?: string): void => {
    current = view;
    pendingFocus = focus ?? null;
    draw();
    // Then again from the vault, and drawn a second time only if something moved: a
    // role kept on one screen is in the list on the next without every screen that
    // changes something having to remember to announce it.
    void reread().then((moved) => { if (moved) { drawBar(); draw(); } });
  };
  draw();
}

function paint(body: HTMLElement, view: ViewId, opportunities: Opportunity[], settings: Settings): void | Promise<void> {
  switch (view) {
    case 'today': return renderToday(body, opportunities, settings);
    case 'pipeline': return renderPipeline(body, opportunities, settings);
    case 'settings': renderSettings(body, settings); return;
    case 'privacy': renderPrivacy(body); return;
    case 'sources': return renderSources(body);
    case 'requisitions': return renderRequisitions(body);
    case 'answers': return renderAnswers(body);
    case 'documents': return renderDocuments(body);
    case 'applications': return renderApplications(body);
    case 'interviews': return renderInterviews(body);
    case 'calendar': return renderCalendar(body, settings);
    case 'preflight': return renderPreflight(body);
    default: {
      // Every view has a renderer. If this ever compiles, one was added to the rail
      // and never given anything to draw -- which shows up as a blank page and no error.
      const unreachable: never = view;
      throw new Error(`No renderer for the ${String(unreachable)} view.`);
    }
  }
}

/** Filled rather than rebuilt: `.status` is a grid area of the shell, so wrapping it in
 *  anything to redraw it puts the wrapper in the area and the bar somewhere else. */
function fillStatusBar(bar: HTMLElement, status: VaultStatus): void {
  clear(bar);
  // Every phrase goes through el(), which is where translation happens. A bare string
  // handed to append() reaches the DOM without it, and stayed English on every screen.
  bar.append(
    el('span', { class: 'dot' }),
    el('span', {}, 'Vault unlocked'),
    el('span', {}, '·'),
    el('b', {}, 'vault.db'),
    el('span', {}, `${readableSize(status.sizeBytes)} · ${status.cipher}`),
    el('span', { class: 'spacer' }),
    el('span', {}, 'Outbound today', `: ${status.outboundToday}`),
    status.lastBackupAt
      ? el('span', {}, 'Backed up ', status.lastBackupAt)
      : el('span', {}, 'No backup yet'),
  );
}

export function applyAppearance(settings: Settings): void {
  // Beside the theme because it is applied the same way: read once, set once, and every
  // view drawn after it agrees. A second copy of this answer is a screen still showing
  // an employer after the switch went on.
  setScreenShare(settings.screenShare);
  const root = document.documentElement;
  root.dataset['accent'] = settings.accent;
  root.dataset['density'] = settings.density;
  root.dataset['size'] = settings.textSize;
  if (settings.theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = settings.theme;
  // A stage borrows another stage's colour rather than taking a free one, so a renamed
  // pipeline still looks like the rest of the app.
  for (const stage of STAGES) {
    const borrowed = settings.stageColours[stage];
    root.style.setProperty(`--stage-${stage}`,
      borrowed === undefined ? `var(--stage-token-${stage})` : `var(--stage-token-${borrowed})`);
  }
}

export { STAGES };
