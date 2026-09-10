/** Vault and privacy. The outbound list is the enforcement mechanism for every claim
 *  Cairn makes about itself, so it is shown in full and never summarised away. */

import { clear, el, on, saying, words } from '../components/dom.js';
import { restart } from '../restart.js';
import type { Sheet, SheetRow } from '../../main/data.js';
import { sections } from '../components/sections.js';
import { refresh } from './app.js';
import * as mask from '../mask.js';
import type { AssistantRun, AssistantTask } from '../../shared/types.js';
import { stageName } from '../../shared/types.js';

/** The host of an address, for saying where an assistant's requests go. */
function hostOf(base: string): string {
  try { return new URL(base).host; } catch { return base; }
}

type Part = 'vault' | 'outbound' | 'assistant' | 'data' | 'over';

let part: Part = 'vault';

/** Which table the grid is showing, and what was typed in the query box, kept across
 *  the redraws that reading a page causes. */
let showing: string | null = null;
let at = 0;

/** Fifty at a time. Enough to scan, few enough that a page is one screen. */
const PAGE = 50;

export function renderPrivacy(body: HTMLElement): void {
  sections({
    body,
    label: 'Vault and privacy sections',
    showing: part,
    remember: (id) => { part = id; },
    defs: [
      { id: 'vault', label: 'My vault', draw: (host) => whereItLives(host) },
      { id: 'outbound', label: 'What has left this machine', draw: (host) => outbound(host) },
      { id: 'assistant', label: 'What I asked the assistant', draw: (host) => assistantRuns(host) },
      { id: 'data', label: 'My data', draw: (host) => yourData(host) },
      { id: 'over', label: 'Starting over', draw: (host) => { host.append(startingOver()); } },
    ],
  });
}

/** Every request to the assistant, in figures. Its counterpart is the outbound list
 *  beside it, where the same requests appear as requests. */
async function assistantRuns(host: HTMLElement): Promise<void> {
  const [runs, current] = await Promise.all([
    window.cairn.assistant.runs(),
    window.cairn.assistant.get(),
  ]);

  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Every question Cairn has asked for you'));

  if (current.provider === null && runs.length === 0) {
    panel.append(el('p', {}, 'No assistant is set up, so nothing has been asked. Settings has a place to add one.'));
    host.append(panel);
    return;
  }
  if (runs.length === 0) {
    panel.append(el('p', {}, 'An assistant is set up and has not been asked anything yet. Nothing here runs on its own.'));
    host.append(panel);
    return;
  }

  const tokens = runs.reduce((sum, run) => sum + run.tokensIn + run.tokensOut, 0);
  panel.append(el('p', {},
    `${runs.length} ${runs.length === 1 ? 'question' : 'questions'}, ${tokens} tokens between them. `
    + 'Every one of these is in the outbound list too, because it went through the same gate.'));

  for (const run of runs) {
    panel.append(
      el('div', { class: 'frow' },
        el('div', {},
          el('label', {}, `${TASK_SAID[run.task]}${run.about === null ? '' : ` — ${mask.company(run.about)}`}`),
          el('small', {}, `${run.host} · ${run.model} · ${new Date(run.at).toLocaleString()}`),
          el('small', {}, `${run.tokensIn} in, ${run.tokensOut} out · ${OUTCOME_SAID[run.outcome]}`))),
    );
  }
  host.append(panel);
}

const TASK_SAID: Record<AssistantTask, string> = {
  'read-posting': 'Read a posting',
  'draft-letter': 'Drafted a letter',
  'suggest-answer': 'Suggested an answer',
  research: 'Looked an employer up',
};

const OUTCOME_SAID: Record<AssistantRun['outcome'], string> = {
  done: 'answered',
  length: 'cut off at its length limit',
  refused: 'refused to answer',
  error: 'failed',
};

async function whereItLives(host: HTMLElement): Promise<void> {
  const [status, brought] = await Promise.all([
    window.cairn.vault.status(),
    window.cairn.assistant.get(),
  ]);
  const assistant = brought.provider === null ? null : hostOf(brought.provider.base);
  // Cairn speaks https everywhere else, so the one exception is said rather than left
  // for somebody to notice in the address bar of a settings field.
  const onThisMachine = brought.provider !== null && brought.provider.base.startsWith('http://');
  host.append(
    el('section', { class: 'panel' },
      el('h3', {}, 'Where my vault is'),
      el('p', {},
        'One encrypted file on this machine, inside Cairn’s own folder. There is no account, ' +
        'no server and nothing to sign in to. Paths shown anywhere in Cairn are relative to that folder.'),
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, 'Encryption'),
          el('small', {}, `${status.cipher}, one key per page. The file is never plaintext on disk, including while Cairn is open.`))),
      status.kdf
        ? el('div', { class: 'frow' },
            el('div', {}, el('label', {}, 'Key derivation'),
              el('small', {}, `${status.kdf.algorithm}, ${status.kdf.passes} passes, ${Math.round(status.kdf.memoryKib / 1024)} MB. Derived from your passphrase when you unlock, and wiped when you lock.`)))
        : null,
      whereRow(),
      // Stated, so somebody can check it against the upgrading guide rather than find
      // out on the lock screen after an upgrade.
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, 'Vault format'),
          el('small', {},
            status.format.onDisk === null
              ? `This build writes and reads format ${status.format.readable}.`
              : `Yours was written in format ${status.format.onDisk}, and this build reads ` +
                `format ${status.format.readable}. ` +
                (status.format.onDisk < status.format.readable
                  ? 'That is behind — docs/upgrading.md has the steps.'
                  : 'Those match, so an upgrade asks nothing of you.'))))),
    el('section', { class: 'panel' },
      el('h3', {}, 'What Cairn never does'),
      el('p', {},
        'It does not send your search criteria anywhere — rules run here, after a posting has been fetched. ' +
        'It does not fetch fonts, check analytics or phone home. The count in the bar along the bottom is how you hold it to that.'),
      // This panel is the app's own claim about itself, so an assistant has to be in it.
      // Left out, the sentence above would be false for anybody who set one up.
      el('p', {},
        assistant === null
          ? 'No assistant is set up, so nothing here has ever been sent to a model.'
          : `The one thing that does send what you are working on is the assistant you brought, at `
            + `${assistant}. It goes only when you press a button, only after the whole payload has `
            + 'been shown to you, and every one is listed under What I asked the assistant.'
            + (onThisMachine
              ? ' That is a model on this machine, reached over plain http — the one address Cairn '
                + 'will speak to without encryption, because there is no network between here and there.'
              : ''))),
  );
}

/** Where the vault is, and how to put it somewhere else. Filled in after the panel is
 *  drawn, because the path is a question for the main process and the rest is not. */
function whereRow(): HTMLElement {
  const path = el('small', {}, 'Reading…');
  const move = el('button', { class: 'btn ghost', type: 'button' }, 'Move the vault');
  const said = el('p', { class: 'planline', hidden: true });

  void window.cairn.vault.where().then((where) => {
    clear(path);
    path.append(words(where.moved
      ? `${where.path} — you moved it here.`
      : `${where.path} — where Cairn put it.`));
  });

  on(move, 'click', () => {
    move.setAttribute('disabled', 'true');
    void window.cairn.vault
      .moveTo()
      .then((moved) => {
        move.removeAttribute('disabled');
        if (moved === null) return;
        said.textContent = `Moved to ${moved}. Cairn locked while it happened — unlock again.`;
        said.hidden = false;
        window.setTimeout(restart, 2200);
      })
      .catch((error: unknown) => {
        move.removeAttribute('disabled');
        said.textContent = saying(error);
        said.hidden = false;
      });
  });

  return el('div', { class: 'frow' },
    el('div', {}, el('label', {}, 'Where it lives'), path,
      el('small', {},
        'Moved somewhere else it is copied and checked before anything is removed, so a ' +
        'move that fails leaves the vault where it was.'),
      said),
    move);
}

/** Every request, newest first. The number shown is stated rather than implied: the
 *  header said how many were made today above a list that stopped at fifty. */
async function outbound(host: HTMLElement): Promise<void> {
  const [status, records] = await Promise.all([
    window.cairn.vault.status(),
    window.cairn.outbound.recent(),
  ]);
  const shown = records.slice(0, 200);

  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Every request Cairn has made'),
    el('p', {},
      records.length === 0
        ? 'Cairn has not made a single request from this machine. Nothing is fetched unless you ask or a source you turned on is due.'
        : `${status.outboundToday} today. Showing the newest ${shown.length} of ${records.length} Cairn has kept.`),
  );

  for (const record of shown) {
    panel.append(
      el('div', { class: 'frow' },
        el('div', {},
          el('label', {}, record.reason),
          el('small', {}, `${record.host} · ${new Date(record.at).toLocaleString()} · ${record.ok ? 'ok' : 'failed'}`))),
    );
  }
  host.append(panel);
}

/** Two ways back to an empty desk, and neither of them deletes anything. */
function startingOver(): HTMLElement {
  const said = el('p', { class: 'planline', hidden: true, role: 'status' });

  const clearQueue = el('button', { class: 'btn', type: 'button' }, 'Set them aside');
  on(clearQueue, 'click', () => {
    clearQueue.setAttribute('disabled', 'true');
    void window.cairn.requisitions.clearWaiting().then((result) => {
      clearQueue.removeAttribute('disabled');
      if (result === null) return;
      said.textContent = result.cleared === 0
        ? 'There was nothing waiting.'
        : `${result.cleared} ${result.cleared === 1 ? 'lead' : 'leads'} set aside. Your pipeline, your applications and everything you have set up are untouched.`;
      said.hidden = false;
      refresh();
    });
  });

  const startOver = el('button', { class: 'btn', type: 'button' }, 'Start over');
  on(startOver, 'click', () => {
    startOver.setAttribute('disabled', 'true');
    void window.cairn.vault.startOver().then((result) => {
      startOver.removeAttribute('disabled');
      if (result.outcome === 'cancelled') return;
      said.textContent = result.outcome === 'moved'
        ? `Everything was moved to ${result.to}, beside your vault. Cairn is starting again — putting it back is renaming that folder.`
        : 'There was no vault to move. Cairn is starting again.';
      said.hidden = false;
      // The vault is genuinely gone, which is the one case that earns a redraw.
      window.setTimeout(restart, 2200);
    });
  });

  return el('section', { class: 'panel' },
    el('h3', {}, 'Starting over'),
    // Placed after the two that keep everything, so the order on the page is the order
    // of how much it costs to be wrong.

    el('p', {},
      'Neither of these deletes anything. The first sets leads aside the way Not for me does; ' +
      'the second moves your whole vault to a folder of its own beside it, so putting it back ' +
      'is renaming that folder.'),
    el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, 'Set aside every waiting lead'),
        el('small', {},
          'For a queue that filled up while the rules were still being worked out. Your pipeline, ' +
          'applications, answers and settings are untouched.')),
      clearQueue),
    el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, 'Start over with an empty Cairn'),
        el('small', {},
          'Your profile, your roles, your applications, your answers and your documents all move ' +
          'together, and Cairn asks you to set up again.')),
      startOver),
    said,
    erasePanel());
}

/** The vault as tables, and a way to take it out and put it back. */
async function yourData(host: HTMLElement): Promise<void> {
  const tables = await window.cairn.data.tables();
  // Named rather than spelled out, because the first stage is one somebody can rename.
  const firstStage = stageName('considering', await window.cairn.settings.get());
  const said = el('p', { class: 'planline', hidden: true, role: 'status' });

  // --- out and back in --------------------------------------------------------
  const write = el('button', { class: 'btn', type: 'button' }, 'Write everything out');
  on(write, 'click', () => {
    write.setAttribute('disabled', 'true');
    void window.cairn.data.export().then((done) => {
      write.removeAttribute('disabled');
      if (done === null) return;
      said.textContent = `${done.rows.toLocaleString()} rows from ${done.tables} tables written to ${done.file}.`;
      said.hidden = false;
      refresh();
    });
  });

  const read = el('button', { class: 'btn ghost', type: 'button' }, 'Read an export back in');
  on(read, 'click', () => {
    read.setAttribute('disabled', 'true');
    void window.cairn.data
      .import()
      .then((done) => {
        read.removeAttribute('disabled');
        if (done === null) return;
        said.textContent = `${done.written.toLocaleString()} rows read from ${done.file}.` +
          (done.skipped.length > 0 ? ` Skipped: ${done.skipped.join(', ')}.` : '');
        said.hidden = false;
        refresh();
      })
      .catch((error: unknown) => {
        read.removeAttribute('disabled');
        said.textContent = saying(error);
        said.hidden = false;
      });
  });

  const roles = el('button', { class: 'btn ghost', type: 'button' }, 'Read a spreadsheet of roles');
  on(roles, 'click', () => {
    roles.setAttribute('disabled', 'true');
    void window.cairn.data
      .roles()
      .then((done) => {
        roles.removeAttribute('disabled');
        if (done === null) return;
        const parts = [`${done.added.toLocaleString()} added from ${done.file}`];
        if (done.alreadyHere > 0) parts.push(`${done.alreadyHere.toLocaleString()} already tracked`);
        if (done.incomplete > 0) parts.push(`${done.incomplete.toLocaleString()} with no company or role`);
        if (done.ignored.length > 0) parts.push(`nothing read from ${done.ignored.join(', ')}`);
        said.textContent = `${parts.join(', ')}.`;
        said.hidden = false;
        refresh();
      })
      .catch((error: unknown) => {
        roles.removeAttribute('disabled');
        said.textContent = saying(error);
        said.hidden = false;
      });
  });

  host.append(
    el('section', { class: 'panel' },
      el('h3', {}, 'Export and import'),
      el('p', {},
        'Everything Cairn holds, as one JSON file. It is written wherever you choose, in plain text ' +
        'and outside the vault — your passphrase does not protect it, so put it somewhere you would ' +
        'be willing to put the same information written down.'),
      el('div', { class: 'frow' },
        el('div', {},
          el('label', {}, 'Write everything out'),
          el('small', {}, 'Every table, every row. Also what the bar along the bottom calls a backup.')),
        write),
      el('div', { class: 'frow' },
        el('div', {},
          el('label', {}, 'Read an export back in'),
          el('small', {},
            'Adds what is missing and puts back what changed, matched on id. It never removes ' +
            'anything — Starting over is where that is asked about in those terms.')),
        read),
      el('div', { class: 'frow' },
        el('div', {},
          el('label', {}, 'Read a spreadsheet of roles'),
          el('small', {},
            'A CSV you kept before Cairn. It needs a company column and a role column; ' +
            'a link, a location and notes are read when they are there. Everything arrives ' +
            `in ${firstStage}, and a role already tracked is left alone.`)),
        roles),
      said),
  );

  // --- the tables themselves ---------------------------------------------------
  const sheetHost = el('div', {});
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });

  const open = (table: string, offset: number): void => {
    showing = table;
    at = offset;
    problem.hidden = true;
    void window.cairn.data
      .page(table, PAGE, offset)
      .then((page) => { clear(sheetHost); sheetHost.append(sheet(table, page, open)); })
      .catch((error: unknown) => {
        clear(sheetHost);
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  };

  const chips = el('div', { class: 'chips light' });
  for (const one of tables) {
    const chip = el('button', { type: 'button', 'aria-pressed': String(one.name === showing) },
      `${one.name} · ${one.rows.toLocaleString()}`);
    on(chip, 'click', () => {
      for (const other of Array.from(chips.querySelectorAll('button'))) {
        other.setAttribute('aria-pressed', String(other === chip));
      }
      open(one.name, 0);
    });
    chips.append(chip);
  }

  host.append(
    el('section', { class: 'panel' },
      el('h3', {}, 'The tables'),
      el('p', {},
        'What is actually in there, as a sheet you can correct. Change a value by clicking it; ' +
        'a row can be removed, and anything that only made sense alongside it goes too. ' +
        'The columns worth scanning are the ones on screen — a link, a timestamp, a page of text ' +
        'and anything holding a structure are on the row instead, named under the sheet. Open a ' +
        'row to see all of it. A structure is shown and never edited: the app reads those back, ' +
        'so a half-typed one is not a wrong value, it is a screen that stops working.'),
      chips,
      problem,
      sheetHost),
  );

  if (showing !== null && tables.some((one) => one.name === showing)) open(showing, at);
}

/** One table, as a sheet. */
function sheet(table: string, page: Sheet, reopen: (table: string, offset: number) => void): HTMLElement {
  if (page.total === 0) {
    return el('p', { class: 'planline' }, `Nothing in ${table} yet. Its columns are ${page.columns.join(', ')}.`);
  }

  const body = el('tbody', {});
  for (const row of page.rows) {
    const line = el('tr', {});
    for (const column of page.shown) {
      line.append(valueCell(table, row, column, () => reopen(table, page.offset)));
    }
    line.append(el('td', { class: 'rowacts' },
      moreButton(page, row), removeButton(table, row, () => reopen(table, page.offset))));
    body.append(line);
  }

  // Each column asks for about what it holds; equal shares clip the company and the
  // role. On the header cells because `table-layout: fixed` takes its widths from the
  // first row and ignores a `colgroup`.
  const ACTIONS = 7;
  const weights = [...page.shown.map((name) => page.weights[name] ?? 10), ACTIONS];
  const total = weights.reduce((sum, one) => sum + one, 0);
  const share = (at: number): string => `width: ${(((weights[at] ?? 10) / total) * 100).toFixed(2)}%`;

  const head = el('tr', {},
    ...page.shown.map((name, at) => el('th', { style: share(at) }, name)),
    el('th', { class: 'rowacts', style: share(page.shown.length) }, ''));

  const first = page.offset + 1;
  const last = Math.min(page.offset + page.rows.length, page.total);
  const back = el('button', { class: 'btn ghost', type: 'button' }, 'Previous');
  const forward = el('button', { class: 'btn ghost', type: 'button' }, 'Next');
  if (page.offset === 0) back.setAttribute('disabled', 'true');
  if (last >= page.total) forward.setAttribute('disabled', 'true');
  on(back, 'click', () => reopen(table, Math.max(0, page.offset - PAGE)));
  on(forward, 'click', () => reopen(table, page.offset + PAGE));

  // Every column and every row, not the seven on screen and not this page: a file
  // holding what somebody happened to be looking at is wrong six weeks later.
  const save = el('button', { class: 'btn ghost', type: 'button' }, 'Save as CSV');
  const saved = el('span', { class: 'planline', hidden: true });
  on(save, 'click', () => {
    save.setAttribute('disabled', 'true');
    void window.cairn.data
      .csv(table)
      .then((done) => {
        save.removeAttribute('disabled');
        if (done === null) return;
        saved.textContent = `${done.rows.toLocaleString()} rows written to ${done.file}.`;
        saved.hidden = false;
      })
      .catch((error: unknown) => {
        save.removeAttribute('disabled');
        saved.textContent = saying(error);
        saved.hidden = false;
      });
  });

  const held = page.columns.filter((name) => !page.shown.includes(name));
  return el('div', {},
    el('div', { class: 'gridwrap' }, el('table', { class: 'grid' }, el('thead', {}, head), body)),
    el('div', { class: 'sheetfoot' },
      el('span', { class: 'planline' },
        `${first.toLocaleString()}–${last.toLocaleString()} of ${page.total.toLocaleString()}` +
        (held.length > 0 ? ` · ${heldNames(held)} on the row` : '')),
      saved, save, back, forward));
}

/** The only thing here that deletes. It asks for the words rather than a click,
 *  because a dialog with two buttons is one misclick and this has no undo. */
function erasePanel(): HTMLElement {
  const typed = el('input', { type: 'text', id: 'erasephrase', placeholder: 'erase everything', autocomplete: 'off' });
  const button = el('button', { class: 'btn danger', type: 'button', disabled: 'true' }, 'Erase everything');
  const said = el('p', { class: 'planline', hidden: true });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });

  const matches = (): boolean =>
    typed.value.trim().replace(/\s+/g, ' ').toLowerCase() === 'erase everything';
  on(typed, 'input', () => {
    if (matches()) button.removeAttribute('disabled');
    else button.setAttribute('disabled', 'true');
  });

  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    problem.hidden = true;
    void window.cairn.vault
      .erase(typed.value)
      .then((done) => {
        if (done === null) { typed.value = ''; return; }
        const parts = [`${done.vaults} vault${done.vaults === 1 ? '' : 's'}`];
        if (done.dumps) parts.push('the crash dumps');
        if (done.logs) parts.push('the log');
        said.textContent = `${parts.join(', ')} deleted. Cairn is starting again.`;
        said.hidden = false;
        window.setTimeout(restart, 1800);
      })
      .catch((error: unknown) => {
        typed.value = '';
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  return el('section', { class: 'panel danger' },
    el('h3', {}, 'Erase everything'),
    el('p', {},
      'This is the one that deletes. Your vault, every vault set aside by Starting over, ' +
      'Cairn\u2019s own log and its crash dumps — a dump holds memory from the moment something ' +
      'died, and an open vault is in that memory.'),
    el('p', {},
      'What you have written out to a file is not touched, and neither is any backup you keep ' +
      'elsewhere. What is left on the disk afterwards is encrypted and the salt its key came ' +
      'from is gone with the rest.'),
    el('div', { class: 'frow' },
      el('div', {},
        el('label', { for: 'erasephrase' }, 'Type erase everything'),
        el('small', {}, 'There is no undo.')),
      typed),
    problem, said,
    el('p', { class: 'laneact' }, button));
}

/** What the sheet holds back, named rather than counted -- but a table with nine
 *  columns and three worth scanning would otherwise put six names in the footer. */
function heldNames(held: string[]): string {
  if (held.length <= 4) return `${held.join(', ')} ${held.length === 1 ? 'is' : 'are'}`;
  return `${held.slice(0, 3).join(', ')} and ${held.length - 3} more are`;
}

/** A cell you can correct, or one that says why not. */
function valueCell(
  table: string, row: SheetRow, column: string, done: () => void,
): HTMLElement {
  const text = row.values[column] ?? '';
  if (!row.editable.includes(column)) {
    return el('td', { class: 'fixed', title: 'This is how the row is found, or it holds a structure.' }, text);
  }

  const box = el('input', { type: 'text', 'aria-label': `${column} for this row` });
  box.value = text === '—' ? '' : text;
  on(box, 'change', () => {
    box.setAttribute('disabled', 'true');
    void window.cairn.data
      .update(table, row.where, column, box.value)
      .then(done)
      .catch((error: unknown) => {
        box.removeAttribute('disabled');
        box.value = text === '—' ? '' : text;
        box.title = saying(error);
      });
  });
  return el('td', {}, box);
}

/** Everything the sheet left out, on the row it belongs to. */
function moreButton(page: Sheet, row: SheetRow): HTMLElement {
  const held = page.columns.filter((name) => !page.shown.includes(name));
  const button = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Everything on this row' }, '▸');
  if (held.length === 0) button.setAttribute('disabled', 'true');
  on(button, 'click', () => {
    const line = button.closest('tr');
    if (line === null) return;
    const next = line.nextElementSibling;
    if (next !== null && next.classList.contains('rowmore')) { next.remove(); return; }
    const panel = el('td', { colspan: String(page.shown.length + 1) });
    for (const name of held) {
      panel.append(el('div', { class: 'frow' },
        el('div', {}, el('label', {}, name), el('small', { class: 'quote' }, row.values[name] ?? ''))));
    }
    line.after(el('tr', { class: 'rowmore' }, panel));
  });
  return button;
}

function removeButton(table: string, row: SheetRow, done: () => void): HTMLElement {
  const button = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove this row' }, '\u00d7');
  let asked = false;
  on(button, 'click', () => {
    if (!asked) {
      asked = true;
      button.textContent = 'Remove?';
      button.classList.add('confirming');
      window.setTimeout(() => {
        asked = false; button.textContent = '\u00d7'; button.classList.remove('confirming');
      }, 4000);
      return;
    }
    button.setAttribute('disabled', 'true');
    void window.cairn.data.remove(table, row.where).then(done);
  });
  return button;
}

