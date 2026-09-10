/** Everything the renderer is allowed to ask for. */

import { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor, shell } from 'electron';
import { importDocument, replaceDocument } from '../documents/import.js';
import { familiesFile, fromVaultRelative, sourcePacksDir, vaultDir } from '../paths.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  cell as shown, columnsToShow, columnWeights, isStructured, isWide,
  readCsv, readSnapshot, rolesFromCsv, toCsv, type Sheet,
} from '../data.js';
import { Repo } from '../repo.js';
import type { Vault } from '../vault.js';
import type {
  AtEmployer, BoardRegistration, HarvestSummary, Opportunity, Profile, Requisition, Settings,
  DocumentVersion, Erased, SourceState, StartOverResult, UpdateCheck, VaultStatus,
  AssistantProvider, AssistantResult, AssistantRun, AssistantTask, OutboundRecord,
} from '../../shared/types.js';
import { defaultsFile, loadDefaults, loadFamilies, resetFamilies, saveFamilies } from '../setup/defaults.js';
import { languages, makeLanguagesDir, phrasesFor, sourcePhrases, type Language } from '../setup/languages.js';
import { closestTo } from '../setup/locale.js';
import { adapters, boardFromUrl, isBuiltin, sourceProblems, useSourcePacks } from '../sources/index.js';
import {
  importPack, loadLibrary, readYourFeeds, removePack, writeYourFeeds, YOUR_FEEDS,
} from '../sources/library.js';
import { readPack, PackRejected, type SourceDefinition } from '../sources/pack.js';
import type { Family } from '../plan.js';
import { harvest, type HarvestProgress, type HarvestResult } from '../harvest.js';
import { planHarvest, type Plan } from '../plan.js';
import { hashUrl, normaliseExclusions, pairKey } from '../screening/checks.js';
import { atEmployer } from '../employer.js';
import { isExcludedCompany } from '../screening/employers.js';
import { normaliseAuthorisation, normalisePlaces } from '../screening/places.js';
import { isSetAsideVault, saidErase } from '../archive.js';
import { newerRelease, tagFrom } from '../updates.js';
import { fetchThrough } from '../net/gate.js';
import { intentOf, suggestFor, type QuestionIntent, type Suggestion } from '../answers/match.js';
import { toText } from '../screening/text.js';
import { search, type Found, type Searchable } from '../search.js';
import { alreadyTold, dailySummary, isQuiet } from '../notify.js';
import { fieldsFromHtml } from '../answers/form.js';
import type {
  AnswerBankEntry, DatedThing, DocumentRecord, Interview, TimelineEvent,
} from '../../shared/types.js';
import { datedThings, nextInterview } from '../calendar.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTemplate, fill, type Template } from '../letters/template.js';
import { refusals, isSendable } from '../letters/guard.js';
import { renderLetter } from '../letters/pdf.js';
import { saveLetter } from '../letters/store.js';
import { seal, sealing, unseal, type Sealing } from '../assistant/keys.js';
import { canGround, listModels, runTask } from '../assistant/run.js';
import { whatLeaves, type Leaving } from '../assistant/inspector.js';
import { baseProblem, type AssistantRequest, type ProviderPreset } from '../assistant/provider.js';
import {
  draftFrom, draftLetterRequest, readingFrom, readPostingRequest, researchFrom,
  researchRequest, suggestAnswerRequest,
} from '../assistant/tasks.js';

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../defaults/templates/cover-letter');
const letterCss = () =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../letters/letter.css'), 'utf8');

function templates(): Template[] {
  return readdirSync(templatesDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parseTemplate(file.replace(/\.md$/, ''), readFileSync(join(templatesDir, file), 'utf8')));
}

/** Eligibility is answered once in Settings, and the screen there says the answer bank
 *  will offer it whenever a form asks. It never did: the bank only ever offered what
 *  was written in the bank, so two questions somebody had already answered came back
 *  as blanks on every form.
 */
function fromEligibility(
  label: string, intents: QuestionIntent[], profile: Profile,
): Suggestion | null {
  const intent = intentOf(label, intents);
  if (intent === null) return null;

  const answer =
    intent.id === 'work-authorisation' ? profile.workAuthorisation
    : intent.id === 'sponsorship'
      ? (profile.needsSponsorship === null ? null : profile.needsSponsorship ? 'Yes' : 'No')
      : null;
  if (answer === null || answer.trim().length === 0) return null;

  return {
    // Not a row in the bank, so its id says where it came from and its reuse count
    // stays at nothing -- a figure that only means anything for answers you wrote.
    entry: {
      id: `eligibility:${intent.id}`, question: intent.prompt, answer,
      intent: intent.id, kind: 'short', usedCount: 0, updatedAt: new Date().toISOString(),
    },
    score: 1,
    how: 'intent',
    because: 'From what you answered under Eligibility in Settings.',
  };
}

/** `a = ? AND b = ?`, from column names the database gave us. */
function whereSql(where: Record<string, unknown>): string {
  return Object.keys(where).map((column) => `"${column}" = ?`).join(' AND ');
}

export function registerHandlers(vault: Vault): void {
  const repo = (): Repo => new Repo(vault.store);

  /** A run belongs to the app, not to the screen that started it. */
  let running: Promise<HarvestResult> | null = null;
  let lastResult: HarvestResult | null = null;
  let startedAt: string | null = null;
  /** How far each lane has got, so a run in progress is something to watch rather than
   *  a button that says "Fetching…" for a minute and a half. */
  let progress: HarvestProgress | null = null;

  /** When the clock for a scheduled run started, so setting a cadence does not fetch
   *  on the spot. A person choosing "every 6 hours" out of curiosity should not get
   *  twenty requests a second later; the first check is a full cadence away. */
  let scheduleFrom = Date.now();

  powerMonitor.on('suspend', () => vault.lock());
  powerMonitor.on('lock-screen', () => vault.lock());

  ipcMain.handle('vault:status', (): VaultStatus => {
    const unlocked = vault.isUnlocked;
    return {
      unlocked,
      exists: !vault.isFirstRun,
      sizeBytes: vault.sizeBytes(),
      cipher: 'ChaCha20-Poly1305',
      kdf: (() => { try { return vault.kdf(); } catch { return null; } })(),
      outboundToday: unlocked ? repo().outboundToday() : 0,
      lastBackupAt: unlocked ? repo().settings().lastBackupAt : null,
      machineName: unlocked ? repo().machineName() : '',
      displayName: unlocked ? repo().profile().displayName : '',
      format: vault.store.formats(),
    };
  });

  ipcMain.handle('vault:create', (_e, passphrase: string) => {
    vault.create(passphrase);
    return true;
  });

  ipcMain.handle('vault:unlock', (_e, passphrase: string) => {
    vault.unlock(passphrase);
    const settings = repo().settings();
    vault.setIdleLock(settings.lockAfterMinutes);
    return true;
  });

  ipcMain.handle('vault:lock', () => { vault.lock(); return true; });

  /** Both of these ask before they act, and they ask from here rather than from the
   *  interface: the confirmation and the thing it guards belong in one place, so no
   *  path to the act can be written that skips it. Null means the person said no. */
  async function agreed(message: string, detail: string, going: string): Promise<boolean> {
    const window = BrowserWindow.getFocusedWindow();
    const answer = await dialog.showMessageBox(window ?? {} as BrowserWindow, {
      type: 'warning', title: going, message, detail,
      buttons: ['Cancel', going], defaultId: 0, cancelId: 0,
    });
    return answer.response === 1;
  }

  ipcMain.handle('vault:startOver', async (): Promise<StartOverResult> => {
    const ok = await agreed(
      'Start over with an empty Cairn?',
      'Everything in this vault — your profile, the roles you are tracking, what you have ' +
        'applied for, your answers and your documents — moves to a folder of its own beside ' +
        'it, and Cairn asks you to set up again.\n\nNothing is deleted. The folder is named ' +
        'on screen afterwards, and putting it back is renaming it.',
      'Start over',
    );
    if (!ok) return { outcome: 'cancelled' };
    const to = vault.startOver();
    return to === null ? { outcome: 'nothing-to-move' } : { outcome: 'moved', to };
  });
  /** Delete everything, once somebody has typed the words and confirmed. The phrase is
   *  checked here as well as on the screen: the interface decides what to offer and
   *  this decides what is allowed, and nothing this final rests on one of those. */
  ipcMain.handle('vault:erase', async (_e, typed: string): Promise<Erased | null> => {
    if (!saidErase(typed)) throw new Error('Nothing was erased. The words did not match.');

    const beside = dirname(vaultDir());
    const setAside = (existsSync(beside) ? readdirSync(beside) : []).filter(isSetAsideVault).length;
    const ok = await agreed(
      'Erase everything Cairn holds on this machine?',
      `Your vault${setAside > 0 ? `, ${setAside} vault${setAside === 1 ? '' : 's'} set aside earlier,` : ''} ` +
        'Cairn\u2019s own log and its crash dumps are deleted for good.\n\nWhat you have written out to a ' +
        'file, and any backup you keep elsewhere, is not touched. There is no undo.',
      'Erase everything',
    );
    if (!ok) return null;
    return vault.eraseEverything();
  });

  /** Look, when asked. One request, through the same gate as everything else, so it is
   *  counted and listed like every other. Nothing is downloaded and nothing installs
   *  itself: it says what is published and the release page opens in your browser. */
  ipcMain.handle('updates:check', async (): Promise<UpdateCheck> => {
    const r = repo();
    const settings = r.settings();
    const response = await fetchThrough(
      'https://api.github.com/repos/kingletas/cairn/releases/latest',
      'Checking for a newer Cairn',
      {
        identifyAs: settings.identifyAs,
        delayMs: settings.requestDelayMs,
        timeoutMs: 15_000,
        onRecord: (record) => r.recordOutbound(record),
      },
    );
    if (!response.ok) {
      throw new Error(`The release page answered ${response.status}, so Cairn does not know.`);
    }
    const published = tagFrom(response.body);
    if (published === null) throw new Error('That answer carried no release, so Cairn does not know.');
    return { running: app.getVersion(), published, newer: newerRelease(app.getVersion(), published) };
  });

  ipcMain.handle('vault:where', () => vault.location());

  /** Move the vault somewhere else — an encrypted disk, a folder that is backed up.
   *  It is copied and checked before anything is removed, so every way this can fail
   *  leaves the vault where it was. */
  ipcMain.handle('vault:moveTo', async (): Promise<string | null> => {
    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(window ?? {} as BrowserWindow, {
      title: 'Where should the vault live?',
      properties: ['openDirectory', 'createDirectory'],
    });
    const destination = picked.filePaths[0];
    if (picked.canceled || destination === undefined) return null;

    const ok = await agreed(
      'Move the vault?',
      `Everything Cairn holds is copied to ${destination}, checked, and only then removed ` +
        'from where it is now.\n\nCairn locks while it happens and you unlock again afterwards.',
      'Move it',
    );
    if (!ok) return null;
    return vault.moveTo(destination);
  });

  ipcMain.handle('vault:touch', () => { vault.resetIdle(); return true; });

  ipcMain.handle('setup:isComplete', () => repo().isSetUp());
  ipcMain.handle('setup:defaults', () => ({
    ...loadDefaults(),
    // The merged list, so the chips on the setup and settings screens are the families
    // a run will actually search rather than the sample this was shipped with.
    families: { families: loadFamilies(familiesFile()).families },
  }));

  /** The job families a run actually searches, and which of them are yours. The
   *  shipped list is a sample; editing one writes your version into your vault. */
  ipcMain.handle('families:get', () => loadFamilies(familiesFile()));

  ipcMain.handle('families:save', (_e, families: Family[], replaceShipped: boolean) =>
    saveFamilies(familiesFile(), families, replaceShipped));

  ipcMain.handle('families:reset', (): boolean => {
    resetFamilies(familiesFile());
    return true;
  });

  ipcMain.handle('profile:get', (): Profile => repo().profile());
  /** One place, one spelling, decided here rather than on each screen that writes a
   *  profile -- otherwise setup and Settings can store the same country two ways. */
  ipcMain.handle('profile:save', (_e, profile: Profile): Profile => {
    const stored: Profile = {
      ...profile,
      locations: normalisePlaces(profile.locations),
      workAuthorisation: normaliseAuthorisation(profile.workAuthorisation),
    };
    repo().saveProfile(stored);
    // What was stored, not what was sent: three spellings of one country go in and one
    // comes back, and a screen still showing the three is showing something untrue.
    return stored;
  });

  ipcMain.handle('language:list', (): Language[] => languages());

  /** The phrases for whichever language is set. Read at boot, before anything is drawn.
   *  Which language somebody chose is a fact about them, so it lives in the vault like
   *  everything else -- which means the lock screen is in English and the rest is not. */
  ipcMain.handle('language:phrases', (): {
    code: string; phrases: Record<string, string>; known: number; notYet: number;
  } => {
    const source = sourcePhrases();
    const known = source.phrases.length;
    if (!vault.isUnlocked) {
      const code = closestTo(app.getLocale(), languages().map((one) => one.code));
      return { code, phrases: phrasesFor(code), known, notYet: source.notYet };
    }
    const code = repo().settings().language;
    return { code, phrases: phrasesFor(code), known, notYet: source.notYet };
  });

  ipcMain.handle('language:folder', async (): Promise<string> => {
    const dir = makeLanguagesDir();
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.handle('settings:get', (): Settings => repo().settings());
  ipcMain.handle('settings:set', (_e, key: keyof Settings, value: Settings[keyof Settings]) => {
    repo().setSetting(key, value);
    if (key === 'lockAfterMinutes') vault.setIdleLock(value as number | null);
    // Changing the cadence restarts its clock, so the next check is a whole one away
    // rather than however long it happened to have been already.
    if (key === 'harvestCadenceHours') scheduleFrom = Date.now();
    return true;
  });

  ipcMain.handle('opportunities:list', (): Opportunity[] => repo().opportunities());
  ipcMain.handle('opportunities:save', (_e, opportunity: Opportunity) => {
    repo().saveOpportunity(opportunity);
    return true;
  });
  /** Setting a role aside, with the reason kept. A role screened out before you ever
   *  applied had no way out of the pipeline at all -- and a role dropped for a reason
   *  and a role never looked at are indistinguishable a month later. */
  ipcMain.handle('opportunities:archive', (_e, id: string, reason: string): boolean => {
    const r = repo();
    const opportunity = r.opportunities(true).find((o) => o.id === id);
    if (!opportunity) throw new Error('That role is not in your pipeline.');
    const now = new Date().toISOString();
    r.saveOpportunity({ ...opportunity, archivedAt: now, nextAction: null, nextActionDue: null });
    r.addEvent({
      id: randomUUID(), opportunityId: id, at: now, kind: 'withdrawn',
      detail: reason.trim() === '' ? null : reason.trim(),
    });
    return true;
  });

  /** Back into the pipeline, at the stage it left from. */
  ipcMain.handle('opportunities:restore', (_e, id: string): boolean => {
    const r = repo();
    const opportunity = r.opportunities(true).find((o) => o.id === id);
    if (!opportunity) throw new Error('That role is not in your pipeline.');
    r.saveOpportunity({ ...opportunity, archivedAt: null });
    return true;
  });

  /** What was set aside, and why. The reason is the whole value of the record: a role
   *  dropped for a reason and one never looked at are the same row without it. */
  /** What else is live at this employer. Question six is the only one of the six that
   *  asks about us rather than the posting, and every fact it needs is already here --
   *  it was answered from memory until a second application went out four days after
   *  the first with every other check reading green. */
  ipcMain.handle('opportunities:liveAt', (_e, company: string, exclude: string): AtEmployer => {
    const r = repo();
    return atEmployer(r.opportunities(true), r.lastEventByOpportunity(), company, exclude);
  });

  ipcMain.handle('opportunities:archived', (): { opportunity: Opportunity; reason: string | null }[] => {
    const r = repo();
    const last = r.lastEventByOpportunity();
    return r.opportunities(true)
      .filter((o) => o.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
      .map((opportunity) => ({ opportunity, reason: last.get(opportunity.id)?.detail ?? null }));
  });

  ipcMain.handle('opportunities:new', (_e, partial: Partial<Opportunity>): Opportunity => {
    // One link, one role -- and one employer-and-role, which is the half a new link
    // gets past. Without this a repeated address comes back as "UNIQUE constraint
    // failed", which is the database talking to itself in front of somebody.
    const wanted = partial.url ?? null;
    const here = repo().opportunities(true);
    const already = here.find((one) => (wanted !== null && one.url === wanted)
      || pairKey(one.company, one.role) === pairKey(partial.company ?? '', partial.role ?? ''));
    if (already !== undefined && (partial.company ?? '').trim() !== '') {
      throw new Error(`You are already tracking that one: ${already.company} — ${already.role}.`);
    }
    const now = new Date().toISOString();
    const opportunity: Opportunity = {
      id: randomUUID(), company: '', role: '', url: null, location: null, remote: 'unstated',
      pay: null, stage: 'considering', fit: null, family: null, nextAction: null,
      nextActionDue: null, postedAt: null, capturedAt: now, appliedAt: null, gate: null, blocker: null, concession: null, contact: null, followupChannel: null, posting: null, screening: null,
      resumeId: null, resumeFile: null, archivedAt: null, notes: null,
      ...partial,
    };
    repo().saveOpportunity(opportunity);
    return opportunity;
  });

  // --- the answer bank -----------------------------------------------------

  ipcMain.handle('answers:list', () => repo().answers());

  ipcMain.handle('answers:intents', (): QuestionIntent[] =>
    (loadDefaults().questions as { intents: QuestionIntent[] }).intents);

  ipcMain.handle('answers:save', (_e, entry: AnswerBankEntry) => {
    repo().saveAnswer({ ...entry, updatedAt: new Date().toISOString() });
    return true;
  });

  ipcMain.handle('answers:new', (_e, question: string, intent: string | null, kind: AnswerBankEntry['kind']) => {
    const entry: AnswerBankEntry = {
      id: randomUUID(), question, answer: '', intent, kind,
      usedCount: 0, updatedAt: new Date().toISOString(),
    };
    repo().saveAnswer(entry);
    return entry;
  });

  ipcMain.handle('answers:delete', (_e, id: string) => { repo().deleteAnswer(id); return true; });
  ipcMain.handle('answers:used', (_e, id: string) => { repo().countAnswerUsed(id); return true; });

  /** Read a pasted application form and say, for each field, whether anything in the
   *  bank answers it. Nothing is filled in and nothing is submitted -- this produces a
   *  list a person works down. */
  ipcMain.handle('answers:readForm', (_e, html: string) => {
    const r = repo();
    const entries = r.answers();
    const intents = (loadDefaults().questions as { intents: QuestionIntent[] }).intents;
    const profile = r.profile();
    return fieldsFromHtml(html).map((field) => ({
      field,
      suggestion: suggestFor(field.label, entries, intents) ?? fromEligibility(field.label, intents, profile),
    }));
  });
  ipcMain.handle('outbound:recent', () => repo().recentOutbound());

  // --- the vault as tables -------------------------------------------------

  ipcMain.handle('data:tables', () => vault.store.tables());

  /** The table's name is checked against the ones the database reports rather than
   *  trusted, because it goes into the statement itself. */
  function realTable(table: string): string {
    if (!vault.store.tables().some((one) => one.name === table)) {
      throw new Error(`There is no table called ${table}.`);
    }
    return table;
  }

  /** A page of one table, as a sheet: the columns worth opening on, the ones held back
   *  because they hold a structure, and how a row is addressed. */
  ipcMain.handle('data:page', (_e, table: string, limit: number, offset: number): Sheet => {
    const name = realTable(table);
    const size = Math.min(Math.max(1, limit), 200);
    const page = vault.store.read(
      `SELECT * FROM "${name}" LIMIT ? OFFSET ?`, [size, Math.max(0, offset)]);
    const key = vault.store.primaryKey(name);
    const show = columnsToShow(page.columns, page.rows, key);

    return {
      columns: page.columns,
      shown: show,
      key,
      weights: columnWeights(show, page.rows.map((row) =>
        show.map((column) => row[page.columns.indexOf(column)]))),
      total: vault.store.tables().find((one) => one.name === name)?.rows ?? 0,
      offset: Math.max(0, offset),
      rows: page.rows.map((row) => ({
        // Everything the row holds, so opening one shows what the sheet left out.
        values: Object.fromEntries(page.columns.map((column, at) => [column, shown(row[at])])),
        // Editing a fact is a spreadsheet. Editing a structure is a broken screen.
        editable: page.columns.filter((column, at) =>
          !key.includes(column) && !isStructured(row[at]) && !isWide(row[at])),
        where: Object.fromEntries(key.map((column) => [column, row[page.columns.indexOf(column)]])),
      })),
    };
  });

  /** Change one value. Re-checked here rather than trusted from the sheet: the
   *  interface decides what to offer, and this decides what is allowed. */
  ipcMain.handle('data:update', (_e, table: string, where: Record<string, unknown>, column: string, value: string) => {
    const name = realTable(table);
    const types = vault.store.columnTypes(name);
    if (!types.has(column)) throw new Error(`${name} has no column called ${column}.`);
    if (vault.store.primaryKey(name).includes(column)) {
      throw new Error('That column is how the row is found, so it cannot be changed here.');
    }
    const current = vault.store.read(
      `SELECT "${column}" FROM "${name}" WHERE ${whereSql(where)}`, Object.values(where));
    if (current.rows.length === 0) throw new Error('That row is no longer there.');
    const was = current.rows[0]?.[0];
    if (isStructured(was)) {
      throw new Error('That value holds a structure rather than a fact, so Cairn shows it and does not edit it.');
    }
    if (isWide(was)) {
      throw new Error('That value is a page of text rather than a cell, so Cairn shows it and does not edit it.');
    }

    const empty = value.trim().length === 0;
    let next: string | number | null = empty ? null : value;
    if (!empty && (types.get(column) ?? '').startsWith('INT')) {
      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) throw new Error(`${column} holds a number, and that is not one.`);
      next = asNumber;
    }
    vault.store.run(
      `UPDATE "${name}" SET "${column}" = ? WHERE ${whereSql(where)}`, [next, ...Object.values(where)]);
    return true;
  });

  /** Remove a row, and whatever only made sense alongside it. */
  ipcMain.handle('data:delete', (_e, table: string, where: Record<string, unknown>) => {
    const name = realTable(table);
    const key = vault.store.primaryKey(name);
    if (key.length === 0) throw new Error(`Rows in ${name} cannot be told apart, so none can be removed.`);
    const id = where[key[0] as string];
    const alsoGone: { table: string; rows: number }[] = [];

    vault.store.transaction(() => {
      if (key.length === 1) {
        for (const other of vault.store.tables()) {
          if (other.name === name) continue;
          const link = `${name}_id`;
          if (!vault.store.columnTypes(other.name).has(link)) continue;
          const rows = vault.store.read(
            `SELECT count(*) AS n FROM "${other.name}" WHERE "${link}" = ?`, [id]).rows[0]?.[0];
          const count = typeof rows === 'number' ? rows : 0;
          if (count === 0) continue;
          vault.store.run(`DELETE FROM "${other.name}" WHERE "${link}" = ?`, [id]);
          alsoGone.push({ table: other.name, rows: count });
        }
      }
      vault.store.run(`DELETE FROM "${name}" WHERE ${whereSql(where)}`, Object.values(where));
    });
    return { alsoGone };
  });

  /** Everything, as one file. */
  ipcMain.handle('data:export', async (): Promise<{ file: string; tables: number; rows: number } | null> => {
    const window = BrowserWindow.getFocusedWindow();
    const stamp = new Date().toISOString().slice(0, 10);
    const picked = await dialog.showSaveDialog(window ?? {} as BrowserWindow, {
      title: 'Write everything out',
      defaultPath: `cairn-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || picked.filePath === undefined) return null;

    const tables: Record<string, unknown[]> = {};
    let rows = 0;
    for (const { name } of vault.store.tables()) {
      const contents = vault.store.all<Record<string, unknown>>(`SELECT * FROM "${name}"`);
      tables[name] = contents;
      rows += contents.length;
    }
    const at = new Date().toISOString();
    writeFileSync(picked.filePath, `${JSON.stringify({ cairn: 1, takenAt: at, tables }, null, 2)}\n`, { mode: 0o600 });
    repo().setSetting('lastBackupAt', at);
    return { file: basename(picked.filePath), tables: Object.keys(tables).length, rows };
  });

  /** Rows back in, by id, and never a deletion. An import can add what is missing and
   *  put back what changed; taking things away is what Start over is for, where it is
   *  asked about in those terms. */
  ipcMain.handle('data:import', async (): Promise<{ file: string; written: number; skipped: string[] } | null> => {
    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(window ?? {} as BrowserWindow, {
      title: 'Read a Cairn export back in',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return null;

    const snapshot = readSnapshot(readFileSync(chosen, 'utf8'));
    const here = new Map(vault.store.tables().map((one) => [one.name, true]));
    const skipped: string[] = [];
    let written = 0;

    vault.store.transaction(() => {
      for (const [table, contents] of Object.entries(snapshot.tables)) {
        if (!here.has(table)) { skipped.push(`${table} (this version has no such table)`); continue; }
        const columns = new Set(
          vault.store.all<{ name: string }>(`PRAGMA table_info("${table}")`).map((c) => c.name));
        for (const row of contents) {
          // Only the columns this version knows. An export from a later one carries
          // fields this schema has never heard of, and a row half-written is worse
          // than a row not written.
          const keys = Object.keys(row).filter((key) => columns.has(key));
          if (keys.length === 0) continue;
          const marks = keys.map(() => '?').join(', ');
          const names = keys.map((key) => `"${key}"`).join(', ');
          vault.store.run(
            `INSERT OR REPLACE INTO "${table}" (${names}) VALUES (${marks})`,
            keys.map((key) => row[key] as unknown),
          );
          written += 1;
        }
      }
    });
    return { file: basename(chosen), written, skipped };
  });

  ipcMain.handle('data:csv', async (_e, table: string): Promise<{ file: string; rows: number } | null> => {
    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showSaveDialog(window ?? {} as BrowserWindow, {
      title: `Save ${table} as a spreadsheet`,
      defaultPath: `cairn-${table}-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (picked.canceled || picked.filePath === undefined) return null;

    // The whole table, not the page on screen. A file holding what somebody happened
    // to be looking at is the kind of export that is wrong six weeks later.
    const columns = vault.store
      .all<{ name: string }>(`PRAGMA table_info("${table}")`).map((one) => one.name);
    const rows = vault.store
      .all<Record<string, unknown>>(`SELECT * FROM "${table}"`)
      .map((row) => columns.map((name) => {
        const value = row[name];
        if (value === null || value === undefined) return null;
        return typeof value === 'number' ? value : String(value);
      }));

    writeFileSync(picked.filePath, `${toCsv({ columns, rows })}\n`, 'utf8');
    return { file: basename(picked.filePath), rows: rows.length };
  });

  ipcMain.handle('data:roles', async (): Promise<
    { file: string; added: number; alreadyHere: number; incomplete: number; ignored: string[] } | null
  > => {
    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(window ?? {} as BrowserWindow, {
      title: 'Read a spreadsheet of roles',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return null;

    const read = rolesFromCsv(readCsv(readFileSync(chosen, 'utf8')));
    const here = repo().opportunities(true);
    const links = new Set(here.map((one) => one.url).filter((one): one is string => one !== null));
    const pairs = new Set(here.map((one) => pairKey(one.company, one.role)));

    const now = new Date().toISOString();
    let added = 0;
    let alreadyHere = 0;
    vault.store.transaction(() => {
      for (const row of read.rows) {
        // A spreadsheet somebody has kept for months overlaps whatever is already
        // tracked, and a second row for one role is two records that disagree later.
        const pair = pairKey(row.company, row.role);
        if ((row.url !== null && links.has(row.url)) || pairs.has(pair)) { alreadyHere += 1; continue; }
        repo().saveOpportunity({
          id: randomUUID(), company: row.company, role: row.role, url: row.url,
          location: row.location, remote: 'unstated', pay: null, stage: 'considering',
          fit: null, family: null, nextAction: null, nextActionDue: null, postedAt: null,
          capturedAt: now, appliedAt: null, resumeId: null, resumeFile: null, gate: null, blocker: null, concession: null, contact: null, followupChannel: null, posting: null, screening: null,
          archivedAt: null, notes: row.notes,
        });
        if (row.url !== null) links.add(row.url);
        pairs.add(pair);
        added += 1;
      }
    });

    return {
      file: basename(chosen), added, alreadyHere,
      incomplete: read.incomplete, ignored: read.ignored,
    };
  });

  // --- letters -------------------------------------------------------------

  ipcMain.handle('letters:templates', (): Template[] => templates());

  ipcMain.handle('letters:fill', (_e, templateId: string, values: Record<string, string>) => {
    const template = templates().find((t) => t.id === templateId);
    if (!template) throw new Error(`There is no template called ${templateId}.`);
    const result = fill(template, values);
    return { ...result, refusals: refusals(result.letter), sendable: isSendable(result.letter) };
  });

  ipcMain.handle('letters:check', (_e, letter: string) =>
    ({ refusals: refusals(letter), sendable: isSendable(letter) }));

  /** Render and save, or refuse and save nothing. The guard runs again here rather
   *  than trusting that the interface ran it -- this is the last point at which a
   *  letter can be stopped, and after it there is a file somebody can attach. */
  ipcMain.handle('letters:render', async (_e, letter: string, company: string, overwrite: boolean) => {
    const found = refusals(letter);
    if (found.length > 0) {
      throw new Error(
        `This is not ready to send: ${found.map((r) => r.reason).join('; ')}. Nothing has been written.`,
      );
    }
    const { pdf, check } = await renderLetter(letter, letterCss());
    const record = saveLetter(repo(), pdf, repo().profile().displayName, company, overwrite);
    return { record, check };
  });

  /** Where a file actually is. A copied one is named relative to the vault; a linked
   *  one is an absolute path already, and putting that through the vault resolver is
   *  how a linked document became unopenable. */
  const absolutePathOf = (record: DocumentRecord): string =>
    record.held === 'linked' ? record.relativePath : fromVaultRelative(record.relativePath);

  ipcMain.handle('documents:list', (): DocumentRecord[] => repo().documents());

  ipcMain.handle('documents:import', async (_e, kind: DocumentRecord['kind']) => {
    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(window ?? { } as BrowserWindow, {
      title: kind === 'resume' ? 'Choose a résumé' : 'Choose a document',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'markdown', 'txt', 'docx', 'odt', 'rtf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    const source = picked.filePaths[0];
    if (picked.canceled || source === undefined) return null;

    const r = repo();
    const record = importDocument(source, kind, '', r.settings().documentsHeld);
    // The first résumé is the default, because a list of one with nothing marked is a
    // choice nobody made and a blank attachment later.
    const existing = r.documents().filter((d) => d.kind === kind);
    r.saveDocument({ ...record, isDefault: existing.length === 0 });
    return record;
  });

  ipcMain.handle('documents:versions', (_e, id: string): DocumentVersion[] =>
    repo().documentVersions(id));

  /** A version is always a file Cairn wrote into the vault, whatever the document it
   *  belongs to is held as now. */
  ipcMain.handle('documents:revealVersion', (_e, documentId: string, versionId: string) => {
    const version = repo().documentVersions(documentId).find((v) => v.id === versionId);
    if (!version) throw new Error('That version is not here any more.');
    shell.showItemInFolder(fromVaultRelative(version.relativePath));
    return true;
  });

  /** Put a newer file behind the same record, and keep the one it replaces. An
   *  application recorded which version went, so the file it went as has to stay. */
  ipcMain.handle('documents:replace', async (_e, id: string): Promise<DocumentRecord | null> => {
    const r = repo();
    const record = r.documents().find((d) => d.id === id);
    if (!record) throw new Error('That document is not here any more.');

    const window = BrowserWindow.getFocusedWindow();
    const picked = await dialog.showOpenDialog(window ?? {} as BrowserWindow, {
      title: `Choose the file to replace ${record.title}`,
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'markdown', 'txt', 'docx', 'odt', 'rtf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    const source = picked.filePaths[0];
    if (picked.canceled || source === undefined) return null;

    const { record: updated, version } = replaceDocument(
      record, source, absolutePathOf(record));
    r.saveDocumentVersion(version);
    r.saveDocument(updated);
    return updated;
  });

  ipcMain.handle('documents:save', (_e, record: DocumentRecord) => {
    repo().saveDocument({ ...record, updatedAt: new Date().toISOString() });
    return true;
  });

  ipcMain.handle('documents:setDefault', (_e, id: string, kind: DocumentRecord['kind']) => {
    repo().setDefaultDocument(id, kind);
    return true;
  });

  /** Forgetting a document removes the record, never the file. A résumé that went to
   *  an employer is the only copy of what they read, and deleting it to tidy a list
   *  is not a trade Cairn makes on somebody's behalf. */
  ipcMain.handle('documents:forget', (_e, id: string) => {
    repo().deleteDocument(id);
    return true;
  });

  ipcMain.handle('documents:reveal', async (_e, id: string) => {
    const record = repo().documents().find((d) => d.id === id);
    if (!record) throw new Error('That document is not here any more.');
    if (record.held === 'linked' && !existsSync(record.relativePath)) {
      throw new Error(
        `That file is not at ${record.relativePath} any more. A linked file is not in ` +
        'your vault, so moving or deleting it takes it away from Cairn too.');
    }
    shell.showItemInFolder(absolutePathOf(record));
    return true;
  });

  // --- applications --------------------------------------------------------

  /** Sending an application is an event, not a field edit. The date goes on the row,
   *  the fact goes on the timeline, and the next action becomes chasing it -- an
   *  application that goes quiet is the commonest way one ends, and nobody remembers
   *  which week it was. */
  ipcMain.handle('applications:markSent', (_e, opportunityId: string, detail: string | null, resumeId?: string | null) => {
    const r = repo();
    const opportunity = r.opportunities().find((o) => o.id === opportunityId);
    if (!opportunity) throw new Error('That role is not in your pipeline.');

    // Which résumé went out is recorded now or never. Six weeks later "which one did
    // they get" is unanswerable, and it is the first thing an interviewer asks about.
    const resume = resumeId ?? r.defaultDocument('resume')?.id ?? null;
    if (resume !== null) r.countDocumentUsed(resume);
    // The file, not just the document. Replacing a résumé afterwards keeps the old
    // file under its own name, so the name recorded here still points at what went.
    const sentAs = resume === null ? null : (r.documents().find((d) => d.id === resume)?.relativePath ?? null);

    const now = new Date();
    const chaseAfter = r.settings().chaseAfterDays;
    const due = chaseAfter === null
      ? null
      : new Date(now.getTime() + chaseAfter * 86_400_000).toISOString();

    r.saveOpportunity({
      ...opportunity,
      stage: 'applied',
      appliedAt: opportunity.appliedAt ?? now.toISOString(),
      resumeId: opportunity.resumeId ?? resume,
      resumeFile: opportunity.resumeFile ?? sentAs,
      nextAction: chaseAfter === null ? 'Nothing due' : 'Chase if you have not heard',
      nextActionDue: due,
    });
    r.addEvent({
      id: randomUUID(), opportunityId, at: now.toISOString(), kind: 'applied', detail,
    });
    return true;
  });

  ipcMain.handle('applications:addEvent', (_e, opportunityId: string, kind: TimelineEvent['kind'], detail: string | null) => {
    const r = repo();
    const opportunity = r.opportunities().find((o) => o.id === opportunityId);
    if (!opportunity) throw new Error('That role is not in your pipeline.');

    const now = new Date();
    r.addEvent({ id: randomUUID(), opportunityId, at: now.toISOString(), kind, detail });

    // A reply, an interview or an ending moves the role on its own. Leaving somebody
    // to remember to also drag it is how a pipeline stops describing anything.
    const moved: Partial<Opportunity> =
      kind === 'interview' ? { stage: 'interviewing', nextAction: 'Prepare', nextActionDue: null }
      : kind === 'offer' ? { stage: 'decision', nextAction: 'Respond to the offer', nextActionDue: null }
      : kind === 'rejected' || kind === 'withdrawn'
        ? { archivedAt: now.toISOString(), nextAction: null, nextActionDue: null }
      : kind === 'reply' ? { nextAction: 'Reply', nextActionDue: null }
      : {};
    if (Object.keys(moved).length > 0) r.saveOpportunity({ ...opportunity, ...moved });
    return true;
  });

  ipcMain.handle('applications:list', () => {
    const r = repo();
    const last = r.lastEventByOpportunity();
    const byId = new Map(r.documents().map((d) => [d.id, d]));
    return r.opportunities(true)
      .filter((o) => o.appliedAt !== null)
      .sort((a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? ''))
      .map((o) => ({
        opportunity: o,
        lastEvent: last.get(o.id) ?? null,
        resume: o.resumeId === null ? null : byId.get(o.resumeId) ?? null,
        // Whether the file that went is still the one behind that name. Replacing a
        // résumé is not a correction to an application already sent.
        resumeReplaced: o.resumeFile !== null && o.resumeId !== null
          && byId.get(o.resumeId)?.relativePath !== o.resumeFile,
      }));
  });

  /** Everything, searched where it lives. No index, so there is nothing to rebuild and
   *  nothing to go stale: a vault holds thousands of rows rather than millions, and a
   *  scan of that is instant. */
  ipcMain.handle('search:everything', (_e, query: string): Found[] => {
    const r = repo();
    const rows: Searchable[] = [];

    for (const o of r.opportunities(true)) {
      rows.push({
        kind: 'role', id: o.id, title: o.role,
        detail: `${o.company} · ${o.stage}`,
        text: [o.company, o.role, o.location ?? '', o.nextAction ?? '', o.notes ?? ''],
      });
    }
    for (const q of r.requisitions()) {
      rows.push({
        kind: 'lead', id: q.id, title: q.role, detail: `${q.company} · ${q.sourceId}`,
        text: [q.company, q.role, toText(q.raw)],
      });
    }
    for (const a of r.answers()) {
      rows.push({
        kind: 'answer', id: a.id, title: a.question, detail: 'Answer bank',
        text: [a.question, a.answer],
      });
    }
    for (const d of r.documents()) {
      rows.push({
        kind: 'document', id: d.id, title: d.title, detail: d.kind === 'resume' ? 'Résumé' : 'Letter',
        text: [d.title, d.note],
      });
    }
    for (const i of r.interviews()) {
      rows.push({
        kind: 'interview', id: i.id, title: i.round || 'Interview', detail: 'Interviews',
        text: [i.round, i.people, i.questions, i.notes],
      });
    }

    return search(query, rows);
  });

  ipcMain.handle('applications:events', (_e, opportunityId: string) => repo().events(opportunityId));

  // --- interviews and the calendar -----------------------------------------

  ipcMain.handle('interviews:list', (): Interview[] => repo().interviews());

  ipcMain.handle('interviews:next', (): { interview: Interview; opportunity: Opportunity } | null => {
    const r = repo();
    const next = nextInterview(r.interviews());
    if (next === null) return null;
    const opportunity = r.opportunities(true).find((o) => o.id === next.opportunityId);
    return opportunity ? { interview: next, opportunity } : null;
  });

  /** Scheduling one moves the role to interviewing and records it on the timeline.
   *  Two places to update by hand is one place that will be forgotten. */
  ipcMain.handle('interviews:save', (_e, interview: Interview) => {
    const r = repo();
    const existing = r.interviews().some((i) => i.id === interview.id);
    r.saveInterview(interview);
    if (!existing) {
      const opportunity = r.opportunities(true).find((o) => o.id === interview.opportunityId);
      if (opportunity) {
        r.saveOpportunity({
          ...opportunity, stage: 'interviewing',
          nextAction: 'Prepare', nextActionDue: interview.at,
        });
        r.addEvent({
          id: randomUUID(), opportunityId: interview.opportunityId,
          at: new Date().toISOString(), kind: 'interview',
          detail: interview.round || null,
        });
      }
    }
    return true;
  });

  ipcMain.handle('interviews:create', (_e, opportunityId: string, at: string): Interview => ({
    id: randomUUID(), opportunityId, at, minutes: 45, round: '', people: '',
    joinUrl: null, notes: '', questions: '', prepared: [], outcome: 'scheduled',
  }));

  ipcMain.handle('interviews:delete', (_e, id: string) => { repo().deleteInterview(id); return true; });

  ipcMain.handle('calendar:things', (): DatedThing[] => datedThings(repo()));

  // --- sources and boards --------------------------------------------------

  /** The host a feed fetches from, for the one line on screen that says where a
   *  request goes. Building the address is what throws when a token is refused, so
   *  the call is inside the guard: a feed Cairn cannot address should be named on the
   *  screen, not take the whole list down while it is being drawn. */
  const hostOf = (adapter: { endpoint(token: string): string }): string => {
    try {
      return new URL(adapter.endpoint('example')).host;
    } catch {
      return 'an address Cairn cannot read';
    }
  };

  /** Read the shipped pack and every pack in the vault, and hand the result to the
   *  registry. Called at startup and again after an import, so a feed you just added
   *  is usable without restarting. */
  let library = loadLibrary(defaultsFile('sources.json'), sourcePacksDir());
  const reloadSources = (): void => {
    library = loadLibrary(defaultsFile('sources.json'), sourcePacksDir());
    useSourcePacks(library.entries, library.problems);
  };
  reloadSources();

  /** Where a feed came from, which is what decides whether the app offers to edit it
   *  and whether removing it gives something back. */
  const originOf = (id: string): 'builtin' | 'shipped' | 'yours' | 'imported' => {
    if (isBuiltin(id)) return 'builtin';
    const entry = [...library.entries].reverse().find((one) => one.definition.id === id);
    if (entry === undefined) return 'builtin';
    if (entry.shipped) return 'shipped';
    return entry.origin === YOUR_FEEDS ? 'yours' : 'imported';
  };

  ipcMain.handle('sources:list', (): SourceState[] => {
    const known = new Map(repo().sourceStates().map((state) => [state.id, state]));
    // Every adapter appears, whether or not the vault has a row for it yet. A source
    // that is simply absent from a list looks like a source that does not exist.
    return adapters().map((adapter) => known.get(adapter.id) ?? {
      id: adapter.id, enabled: false, lastRun: null, lastError: null, boards: 0,
    });
  });

  /** The host is in here because it is the thing worth reading before turning a feed
   *  on -- especially one that arrived in a pack from somewhere else. */
  ipcMain.handle('sources:catalogue', () =>
    adapters().map((a) => ({
      id: a.id, label: a.label, kind: a.kind, provenance: a.provenance,
      docs: a.docs, note: a.note, host: hostOf(a), origin: originOf(a.id),
    })));

  /** The definition behind a feed, so the editor opens on what is actually running.
   *  A built-in board has none: it is code, and the form cannot describe it. */
  ipcMain.handle('sources:definition', (_e, id: string): SourceDefinition | null => {
    const entry = [...library.entries].reverse().find((one) => one.definition.id === id);
    return entry?.definition ?? null;
  });

  /** Save a feed written in the app. It goes through the same reader that judges an
   *  imported file, so one standard holds for both, and it is written beside the
   *  shipped pack rather than over it -- removing yours brings the original back. */
  ipcMain.handle('sources:saveFeed', (_e, definition: unknown): { id: string } => {
    const checked = readPack('this feed', JSON.stringify({ sources: [definition] }));
    const one = checked[0];
    if (one === undefined) throw new Error('There was nothing to save.');
    if (isBuiltin(one.id)) {
      throw new Error(`${one.id} is a board Cairn reads in code, so it cannot be replaced by a feed of this kind.`);
    }
    const mine = readYourFeeds(sourcePacksDir()).filter((feed) => feed.id !== one.id);
    writeYourFeeds(sourcePacksDir(), [...mine, one]);
    reloadSources();
    return { id: one.id };
  });

  /** Remove a feed of yours. What comes back afterwards is whatever was underneath it,
   *  which is the shipped one when you had been editing that. */
  ipcMain.handle('sources:removeFeed', (_e, id: string): boolean => {
    const mine = readYourFeeds(sourcePacksDir());
    if (!mine.some((feed) => feed.id === id)) return false;
    writeYourFeeds(sourcePacksDir(), mine.filter((feed) => feed.id !== id));
    reloadSources();
    return true;
  });

  /** The pack files in your vault, and removing one. Your own file is not in this list:
   *  its feeds are removed one at a time in the editor. */
  ipcMain.handle('sources:packs', (): { file: string; sources: string[] }[] =>
    library.files.filter((one) => one.file !== YOUR_FEEDS));

  ipcMain.handle('sources:removePack', (_e, file: string): boolean => {
    const gone = removePack(sourcePacksDir(), file);
    if (gone) reloadSources();
    return gone;
  });

  /** Packs that could not be read, in sentences. A feed that silently failed to load
   *  looks exactly like a feed with nothing new, and nothing new is what a healthy run
   *  looks like. */
  ipcMain.handle('sources:problems', (): string[] => {
    const families = loadFamilies(familiesFile());
    return families.problem === null ? [...sourceProblems()] : [...sourceProblems(), families.problem];
  });

  /** Import a source pack. The file is read and refused before a copy is kept, and
   *  nothing it describes is switched on -- importing a pack never causes a request. */
  ipcMain.handle('sources:importPack', async (): Promise<{ file: string; sources: string[] } | null> => {
    const picked = await dialog.showOpenDialog({
      title: 'Import a source pack',
      properties: ['openFile'],
      filters: [{ name: 'Source pack', extensions: ['json'] }],
    });
    const chosen = picked.filePaths[0];
    if (picked.canceled || chosen === undefined) return null;
    try {
      const imported = importPack(sourcePacksDir(), chosen);
      reloadSources();
      return imported;
    } catch (cause) {
      throw cause instanceof PackRejected
        ? new Error(`That is not a source pack Cairn can read. ${cause.message}`)
        : cause;
    }
  });

  ipcMain.handle('sources:setEnabled', (_e, id: string, enabled: boolean) => {
    repo().setSourceEnabled(id, enabled);
    return true;
  });

  ipcMain.handle('boards:list', (): BoardRegistration[] => repo().boards());

  /** Adding an employer is pasting any link from their careers page. Cairn reads the
   *  board out of it rather than asking somebody to know what an ATS is. */
  ipcMain.handle('boards:add', (_e, url: string, company: string) => {
    const found = boardFromUrl(url);
    if (!found) {
      throw new Error(
        'That link does not look like a job board Cairn knows. Open a company\'s careers page, ' +
          'copy the address of any job on it, and paste that.',
      );
    }
    const board: BoardRegistration = {
      sourceId: found.sourceId,
      token: found.token,
      company: company.trim().length > 0 ? company.trim() : found.token,
      addedAt: new Date().toISOString(),
    };
    repo().addBoard(board);
    return board;
  });

  /** Boards Cairn knows are real, minus the ones already here. Offered rather than
   *  added: a first run has somewhere to fetch from, and nothing is watched until
   *  somebody presses a button. */
  ipcMain.handle('boards:suggested', (): BoardRegistration[] => {
    const here = new Set(repo().boards().map((one) => `${one.sourceId}\u0000${one.token}`));
    const shipped = (loadDefaults().boards as { suggested?: BoardRegistration[] }).suggested ?? [];
    const known = new Set(adapters().filter((one) => one.kind === 'ats').map((one) => one.id));
    return shipped
      .filter((one) => known.has(one.sourceId) && !here.has(`${one.sourceId}\u0000${one.token}`))
      .map((one) => ({ ...one, addedAt: '' }));
  });

  ipcMain.handle('boards:addSuggested', (_e, wanted: { sourceId: string; token: string; company: string }[]) => {
    const now = new Date().toISOString();
    let added = 0;
    for (const one of wanted) {
      repo().addBoard({ sourceId: one.sourceId, token: one.token, company: one.company, addedAt: now });
      added += 1;
    }
    return added;
  });

  ipcMain.handle('boards:remove', (_e, sourceId: string, token: string) => {
    repo().removeBoard(sourceId, token);
    return true;
  });

  // --- the harvest ---------------------------------------------------------

  /** What a run would do, so the interface can say it before anybody presses the
   *  button. A source that cannot run says why, rather than being quietly skipped. */
  const currentPlan = (): Plan => {
    const r = repo();
    const kinds = new Map(adapters().map((a) => [a.id, { kind: a.kind, searchless: a.searchless === true }]));
    const families = loadFamilies(familiesFile()).families;
    return planHarvest(r.sourceStates(), kinds, r.boards(), r.profile(), families);
  };

  /** Every title from the families this person picked -- all of them, not the capped
   *  handful the searches run on. Screening on fewer than were asked for would drop
   *  roles somebody said they wanted. */
  const searchTitles = (): string[] => {
    const chosen = repo().profile().families;
    const families = loadFamilies(familiesFile()).families;
    return families.filter((f) => chosen.includes(f.id)).flatMap((f) => f.titles);
  };

  ipcMain.handle('harvest:plan', (): Plan => currentPlan());

  /** When the next unattended check falls due, or null when there is none. */
  function nextRunAt(): string | null {
    if (!vault.isUnlocked) return null;
    const settings = repo().settings();
    if (settings.harvestCadenceHours === null) return null;
    const every = settings.harvestCadenceHours * 3_600_000;
    const lastRan = settings.lastHarvest === null ? NaN : Date.parse(settings.lastHarvest.ranAt);
    const from = Number.isFinite(lastRan) ? Math.max(lastRan, scheduleFrom) : scheduleFrom;
    return new Date(from + every).toISOString();
  }

  /** Checked on a timer rather than scheduled to the second: a vault that locks, an
   *  idle laptop and a changed setting all move the answer, and re-asking a cheap
   *  question every minute survives all three without bookkeeping that can go stale. */
  const DUE_CHECK_MS = 60_000;
  setInterval(() => {
    if (!vault.isUnlocked || running !== null) return;
    const due = nextRunAt();
    if (due === null || Date.parse(due) > Date.now()) return;
    const r = repo();
    const settings = r.settings();
    const { targets } = currentPlan();
    if (targets.length === 0) return;
    startedAt = new Date().toISOString();
    progress = null;
    scheduleFrom = Date.now();
    running = runHarvest(r, settings, targets);
    void running
      .then((result) => { lastResult = result; r.setSetting('lastHarvest', summarise(result)); })
      .catch(() => { /* A source that failed is already recorded against that source. */ })
      .finally(() => { running = null; });
  }, DUE_CHECK_MS).unref();

  /** One notice a day about what is due, on the same timer for the same reason.
   *  It reads the vault and nothing else -- a locked vault has nothing to say, and
   *  quiet hours are the difference between a reminder and an interruption. */
  setInterval(() => {
    if (!vault.isUnlocked) return;
    const r = repo();
    const settings = r.settings();
    if (!settings.notify) return;
    const now = new Date();
    if (isQuiet(now, { from: settings.quietFrom, to: settings.quietTo })) return;
    if (alreadyTold(r.lastNotifiedOn(), now)) return;

    const summary = dailySummary(datedThings(r), now);
    // Marked told either way: a day with nothing due has been answered, and asking
    // again every minute until midnight is how a quiet day becomes a busy log.
    r.setLastNotifiedOn(now.toISOString().slice(0, 10));
    if (summary === null || !Notification.isSupported()) return;
    new Notification({ title: summary.title, body: summary.body }).show();
  }, DUE_CHECK_MS).unref();

  ipcMain.handle('harvest:state', () => ({
    running: running !== null,
    startedAt,
    progress,
    nextRunAt: nextRunAt(),
    lastResult,
    // Kept in the vault, so "what did that last run actually do" still has an answer
    // after the window has been closed and opened again.
    lastSummary: repo().settings().lastHarvest,
  }));

  /** What a run did, in figures. The interface does the wording. */
  function summarise(result: HarvestResult): HarvestSummary {
    const setAside: Record<string, number> = {};
    for (const outcome of result.outcomes) {
      for (const [check, count] of Object.entries(outcome.dropped)) {
        setAside[check] = (setAside[check] ?? 0) + count;
      }
    }
    return {
      ranAt: result.ranAt,
      searches: result.outcomes.length,
      read: result.outcomes.reduce((n, o) => n + o.found, 0),
      kept: result.requisitions,
      setAside,
      failed: result.outcomes.filter((o) => o.error !== null).length,
    };
  }

  ipcMain.handle('harvest:run', async (): Promise<HarvestResult> => {
    // Already going: hand back the same run rather than starting a second one. Two
    // runs at once would fetch everything twice, and every board would see two
    // requests from the same person a second apart.
    if (running !== null) return running;

    const r = repo();
    const settings = r.settings();
    const { targets } = currentPlan();

    if (targets.length === 0) {
      return { outcomes: [], requisitions: 0, ranAt: new Date().toISOString() };
    }

    startedAt = new Date().toISOString();
    progress = null;
    running = runHarvest(r, settings, targets);
    try {
      lastResult = await running;
      r.setSetting('lastHarvest', summarise(lastResult));
      return lastResult;
    } finally {
      running = null;
    }
  });

  async function runHarvest(
    r: Repo, settings: Settings, targets: ReturnType<typeof currentPlan>['targets'],
  ): Promise<HarvestResult> {
    const result = await harvest(
      r,
      targets,
      {
        profile: r.profile(),
        settings,
        titles: searchTitles(),
        knownUrls: r.knownUrls(),
        knownPairs: r.knownPairs(),
        droppedHashes: r.droppedHashes(),
        now: new Date(),
      },
      {
        identifyAs: settings.identifyAs,
        delayMs: settings.requestDelayMs,
        timeoutMs: 20_000,
        onRecord: (record) => r.recordOutbound(record),
      },
      {
        // The two kinds are different hosts and the gate spaces each one on its own,
        // so reading them together is two queues rather than a burst at anybody.
        sideBySide: !settings.sequentialFetch,
        onProgress: (latest) => { progress = latest; },
      },
    );

    for (const outcome of result.outcomes) {
      r.recordSourceRun(outcome.target.sourceId, outcome.error);
    }
    return result;
  }

  // --- requisitions --------------------------------------------------------

  // --- employers you never want to see -------------------------------------

  /** Waiting leads whose employer is one you have just excluded. */
  function sweepExcluded(r: Repo, names: readonly string[]): number {
    let dropped = 0;
    for (const requisition of r.requisitions()) {
      // The same rule the screen uses. Two answers to "is this employer excluded" is
      // one of them being wrong on a day nobody is looking.
      if (!names.some((name) => isExcludedCompany(requisition.company, name))) continue;
      r.setRequisitionState(requisition.id, 'dropped');
      dropped += 1;
    }
    return dropped;
  }

  /** The whole list, as the settings screen holds it. What comes back is what was
   *  kept, so a list that was cleaned up cannot go on being shown as it was typed. */
  ipcMain.handle('employers:set', (_e, names: string[]) => {
    const r = repo();
    const kept = normaliseExclusions(names);
    r.setSetting('excludedEmployers', kept);
    return { names: kept, dropped: sweepExcluded(r, kept) };
  });

  /** One more, from the lead that prompted it. */
  ipcMain.handle('employers:exclude', (_e, name: string) => {
    const r = repo();
    const kept = normaliseExclusions([...r.settings().excludedEmployers, name]);
    r.setSetting('excludedEmployers', kept);
    return { names: kept, dropped: sweepExcluded(r, kept) };
  });

  ipcMain.handle('requisitions:list', (): Requisition[] => repo().requisitions());

  /** What has been set aside, and how much of it there is. Marking a lead dropped only
   *  hid it: the rows stayed in the vault for ever, invisible, which is the kind of
   *  tidying that leaves a number nobody can reconcile with anything. */
  ipcMain.handle('requisitions:setAside', (): Requisition[] => repo().requisitions('dropped'));

  ipcMain.handle('requisitions:counts', () => ({
    ...repo().requisitionCounts(),
    // Links, not rows. These outlive the leads they came from on purpose, and after
    // the rows are deleted they are the only thing still saying no.
    links: repo().droppedCount(),
  }));

  /** Forget the links, so the postings can arrive again. The other half of deleting
   *  the rows: on its own that keeps saying no to things nobody can see any more. */
  ipcMain.handle('requisitions:forgetLinks', async (): Promise<{ forgotten: number } | null> => {
    const r = repo();
    const held = r.droppedCount();
    if (held === 0) return { forgotten: 0 };
    const ok = await agreed(
      `Forget ${held} ${held === 1 ? 'link' : 'links'} you said no to?`,
      'Cairn remembers a hash of every posting you set aside, so the same ones do not come ' +
        'back on the next run. Forgetting them means they can arrive again and be judged ' +
        'afresh.\n\nNothing else changes: your pipeline, your applications and your settings ' +
        'are untouched.',
      'Forget them',
    );
    if (!ok) return null;
    return { forgotten: r.forgetAllDropped() };
  });

  /** Back into the queue, and the link forgotten so the next run does not drop it
   *  again the moment it sees it. */
  ipcMain.handle('requisitions:restore', async (_e, id: string): Promise<boolean> => {
    const r = repo();
    const requisition = r.requisitions('dropped').find((one) => one.id === id);
    if (!requisition) return false;
    r.setRequisitionState(id, 'waiting');
    if (requisition.url !== null) r.forgetDropped(await hashUrl(requisition.url));
    return true;
  });

  /** Actually gone. The hashes are kept on purpose -- they are what stops the same
   *  postings arriving again on the next run, and they hold no link, only a digest. */
  ipcMain.handle('requisitions:forget', async (): Promise<{ deleted: number } | null> => {
    const r = repo();
    const aside = r.requisitionCounts().dropped;
    if (aside === 0) return { deleted: 0 };
    const ok = await agreed(
      `Delete ${aside} set-aside ${aside === 1 ? 'lead' : 'leads'} for good?`,
      'These are the ones you have already said no to. Deleting them removes the rows from ' +
        'your vault — this one cannot be undone.' +
        (r.settings().keepDroppedHashes
          ? '\n\nCairn keeps the hash of each link, so the same postings still do not come ' +
            'back on the next run. A hash holds no address, only a digest of one.'
          : '\n\nRemember roles you dropped is off, so a later run may find these again.'),
      'Delete them',
    );
    if (!ok) return null;
    return { deleted: r.deleteRequisitions('dropped') };
  });

  /** The posting itself, as text. */
  ipcMain.handle('requisitions:posting', (_e, id: string): string | null => {
    const found = repo().requisitions().find((item) => item.id === id);
    if (!found) return null;
    const text = toText(found.raw);
    return text.length > 0 ? text : null;
  });

  ipcMain.handle('open:external', async (_e, url: string) => {
    // https only, and opened in the user's own browser where they can see where it
    // goes before it loads. Cairn never navigates itself anywhere.
    if (!/^https:\/\//i.test(url)) throw new Error('Cairn only opens https links.');
    await shell.openExternal(url);
    return true;
  });

  /** Everything waiting, set aside at once. For a queue that filled up while the rules
   *  were still being worked out, where judging them one at a time is not triage, it
   *  is punishment for having experimented. */
  ipcMain.handle('requisitions:clearWaiting', async (): Promise<{ cleared: number } | null> => {
    const r = repo();
    const waiting = r.requisitions();
    if (waiting.length === 0) return { cleared: 0 };

    const remembers = r.settings().keepDroppedHashes;
    const ok = await agreed(
      `Set aside all ${waiting.length} leads waiting to be judged?`,
      'Your pipeline, your applications, your answers and everything you have set up are ' +
        'untouched — this is only the queue of leads nobody has judged yet.' +
        (remembers
          ? '\n\nAs with Not for me, Cairn remembers a hash of each link so the same postings ' +
            'do not come back on the next run. The links themselves are not kept.'
          : '\n\nA later run may find the same postings again, because Remember roles you ' +
            'dropped is off.'),
      'Set them aside',
    );
    if (!ok) return null;

    for (const requisition of waiting) {
      r.setRequisitionState(requisition.id, 'dropped');
      if (requisition.url !== null && remembers) {
        r.rememberDropped(await hashUrl(requisition.url));
      }
    }
    return { cleared: waiting.length };
  });

  ipcMain.handle('requisitions:keep', (_e, id: string): Opportunity | null => {
    const r = repo();
    const requisition = r.requisitions().find((item) => item.id === id);
    if (!requisition) return null;
    // Already in the pipeline under that link -- after an import, or a lead kept
    // twice. Hand back what is there rather than failing on the unique index.
    const already = requisition.url === null
      ? undefined
      : r.opportunities(true).find((one) => one.url === requisition.url);
    if (already !== undefined) {
      r.setRequisitionState(id, 'kept');
      return already;
    }
    const now = new Date().toISOString();
    const opportunity: Opportunity = {
      id: randomUUID(), company: requisition.company, role: requisition.role,
      url: requisition.url, location: null,
      // The whole of the queue's work comes across. The posting is the evidence and the
      // reading of it is the job: a role arriving with a blank band was a role the pay
      // filter could not see, on the screen that found it for you.
      remote: requisition.remote, pay: requisition.pay,
      stage: 'considering', fit: null, family: null, nextAction: 'Read the role description',
      nextActionDue: null, postedAt: null, capturedAt: now, appliedAt: null, gate: null, blocker: null, concession: null, contact: null, followupChannel: null,
      posting: toText(requisition.raw).trim() || null,
      screening: requisition.screening,
      resumeId: null, resumeFile: null, archivedAt: null, notes: null,
    };
    r.saveOpportunity(opportunity);
    r.setRequisitionState(id, 'kept');
    return opportunity;
  });

  ipcMain.handle('requisitions:drop', async (_e, id: string) => {
    const r = repo();
    const requisition = r.requisitions().find((item) => item.id === id);
    if (!requisition) return false;
    r.setRequisitionState(id, 'dropped');
    if (requisition.url !== null && r.settings().keepDroppedHashes) {
      r.rememberDropped(await hashUrl(requisition.url));
    }
    return true;
  });

  // --- the assistant -------------------------------------------------------

  /** A request that has been shown and not yet sent. Held here rather than handed to
   *  the interface, so what goes is exactly what was inspected. */
  const pending = new Map<string, {
    task: AssistantTask; request: AssistantRequest; about: string | null;
    subject: string; reason: string;
  }>();

  const presets = (): ProviderPreset[] =>
    (JSON.parse(readFileSync(defaultsFile('assistants.json'), 'utf8')) as { providers: ProviderPreset[] })
      .providers;

  const pricingFor = (id: string): string => presets().find((one) => one.id === id)?.pricing ?? '';

  /** The gate, set up for a provider: identified as you asked, given room for a model
   *  to think, and recording every request in the same list a job board's appears in. */
  const assistantGate = (r: Repo) => ({
    identifyAs: r.settings().identifyAs,
    delayMs: 0,
    timeoutMs: 180_000,
    onRecord: (record: OutboundRecord) => r.recordOutbound(record),
  });

  const providerOrRefuse = (r: Repo): { provider: AssistantProvider; key: string } => {
    const provider = r.assistantProvider();
    if (provider === null) throw new Error('No assistant is set up. Settings has a place to add one.');
    if (provider.model.trim() === '') throw new Error('Pick a model in Settings first.');
    const key = unseal(r.assistantKeySealed()) ?? '';
    return { provider, key };
  };

  ipcMain.handle('assistant:presets', (): ProviderPreset[] => presets());

  ipcMain.handle('assistant:sealing', (): Sealing => sealing());

  ipcMain.handle('assistant:get', (): {
    provider: AssistantProvider | null; grounded: boolean; pricing: string; ready: boolean;
  } => {
    const provider = repo().assistantProvider();
    return {
      provider,
      grounded: provider !== null && canGround(provider),
      pricing: provider === null ? '' : pricingFor(provider.id),
      // A provider row exists as soon as somebody touches the chooser, which is not the
      // same as being able to ask it anything. A model on this machine needs no key.
      ready: provider !== null && provider.model.trim() !== ''
        && (provider.keyHeld || baseProblem(provider.base) === null && /localhost|127\.0\.0\.1/.test(provider.base)),
    };
  });

  ipcMain.handle('assistant:save', (_e, provider: AssistantProvider, key: string | null) => {
    const problem = baseProblem(provider.base);
    if (problem !== null) throw new Error(problem);
    // Sealed before it is written, so what lands in the vault is already locked by the
    // machine's own keychain. An empty string is somebody clearing the key.
    const sealed = key === null ? null : key.trim() === '' ? '' : seal(key);
    repo().saveAssistantProvider({ ...provider, addedAt: provider.addedAt || new Date().toISOString() }, sealed);
    return repo().assistantProvider();
  });

  ipcMain.handle('assistant:forget', () => { repo().forgetAssistantProvider(); return true; });

  ipcMain.handle('assistant:models', async (): Promise<{ id: string; label: string }[]> => {
    const r = repo();
    const provider = r.assistantProvider();
    if (provider === null) throw new Error('No assistant is set up yet.');
    return listModels(provider, unseal(r.assistantKeySealed()) ?? '', assistantGate(r));
  });

  ipcMain.handle('assistant:runs', (): AssistantRun[] => repo().assistantRuns());

  /** Build the request and say what would leave. Nothing is sent by this. */
  ipcMain.handle('assistant:prepare', (_e, task: AssistantTask, subject: string, extra?: string): {
    ticket: string; leaving: Leaving; quiet: boolean;
  } => {
    const r = repo();
    const { provider, key } = providerOrRefuse(r);
    const profile = r.profile();
    let request: AssistantRequest;
    let about: string;
    let reason: string;

    if (task === 'read-posting') {
      const requisition = r.requisitions().find((one) => one.id === subject)
        ?? r.requisitions('kept').find((one) => one.id === subject);
      if (requisition === undefined) throw new Error('That lead is not here any more.');
      if (requisition.raw.trim() === '') {
        throw new Error('This source gave no description, so there is nothing to read.');
      }
      request = readPostingRequest(requisition.raw, provider.model, provider.effort);
      about = `${requisition.company} — ${requisition.role}`;
      reason = `Asking your assistant to read a posting at ${requisition.company}`;
    } else if (task === 'draft-letter') {
      const opportunity = r.opportunities(true).find((one) => one.id === subject);
      if (opportunity === undefined) throw new Error('That role is not here any more.');
      const skeleton = templates().find((one) => one.id === extra);
      if (skeleton === undefined) throw new Error('Choose a skeleton to start from.');
      request = draftLetterRequest({
        skeleton: skeleton.body,
        posting: r.requisitions('kept').find((one) => one.url === opportunity.url)?.raw ?? '',
        about: { company: opportunity.company, role: opportunity.role },
        profile, model: provider.model, effort: provider.effort,
      });
      about = `${opportunity.company} — ${opportunity.role}`;
      reason = `Asking your assistant to draft a letter for ${opportunity.company}`;
    } else if (task === 'suggest-answer') {
      // A box on one employer's form rather than a question in the bank. It carries
      // whether that employer asked for the applicant's own words, which decides
      // whether what comes back is prose or material.
      const adHoc = subject.startsWith('ask:') ? subject.slice(4) : null;
      const entry = adHoc === null ? r.answers().find((one) => one.id === subject) : null;
      if (adHoc === null && entry === undefined) {
        throw new Error('That question is not in the bank any more.');
      }
      const question = adHoc ?? entry?.question ?? '';
      const ownWords = extra === 'own-words';
      request = suggestAnswerRequest({
        question,
        profile,
        existing: r.answers().filter((one) => one.answer.trim() !== '' && one.id !== entry?.id),
        ownWords,
        model: provider.model, effort: provider.effort,
      });
      about = question;
      reason = ownWords
        ? 'Asking your assistant for material, because that employer asked for your own words'
        : 'Asking your assistant to suggest an answer';
    } else {
      const opportunity = r.opportunities(true).find((one) => one.id === subject);
      if (opportunity === undefined) throw new Error('That role is not here any more.');
      if (!canGround(provider)) {
        throw new Error('This provider cannot search and cite, so Cairn will not ask it to research anybody.');
      }
      request = researchRequest(opportunity.company, provider.model, provider.effort);
      about = opportunity.company;
      reason = `Asking your assistant to research ${opportunity.company}`;
    }

    const ticket = randomUUID();
    pending.set(ticket, { task, request, about, subject, reason });
    return {
      ticket,
      leaving: whatLeaves(task, request, provider, key, pricingFor(provider.id)),
      quiet: provider.quiet.includes(task),
    };
  });

  ipcMain.handle('assistant:cancel', (_e, ticket: string) => pending.delete(ticket));

  /** Send exactly what was shown, and record it wherever it belongs. */
  ipcMain.handle('assistant:send', async (_e, ticket: string): Promise<AssistantResult> => {
    const held = pending.get(ticket);
    if (held === undefined) throw new Error('That request has already gone or been cancelled.');
    pending.delete(ticket);

    const r = repo();
    const { provider, key } = providerOrRefuse(r);
    const { outcome, run } = await runTask({
      provider, key, request: held.request, task: held.task,
      reason: held.reason, about: held.about, gate: assistantGate(r),
    });
    r.recordAssistantRun(run);

    const result: AssistantResult = {
      task: held.task, run, verdicts: [], pay: null, dropped: [],
      text: '', check: [], citations: [], refused: [],
    };

    if (held.task === 'read-posting') {
      const requisition = r.requisitions().find((one) => one.id === held.subject)
        ?? r.requisitions('kept').find((one) => one.id === held.subject);
      if (requisition !== undefined) {
        const reading = readingFrom(outcome, requisition.raw);
        // Kept on the row, so a reading survives the window closing and is never paid
        // for twice. Anything the assistant already said is replaced rather than added.
        const mine = requisition.screening.verdicts.filter((one) => !one.check.endsWith('your assistant'));
        r.saveRequisition({
          ...requisition,
          pay: requisition.pay ?? reading.pay,
          screening: { ...requisition.screening, verdicts: [...mine, ...reading.verdicts] },
        });
        result.verdicts = reading.verdicts;
        result.pay = reading.pay;
        result.dropped = reading.dropped;
      }
    } else if (held.task === 'draft-letter') {
      const draft = draftFrom(outcome);
      result.text = draft.letter;
      result.check = draft.check;
    } else if (held.task === 'suggest-answer') {
      result.text = outcome.text.trim();
    } else {
      const note = researchFrom(outcome);
      if ('refused' in note) result.refused = note.refused;
      else { result.text = note.note; result.citations = note.citations; }
    }
    return result;
  });
}
