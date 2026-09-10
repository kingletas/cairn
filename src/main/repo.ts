/** Reading and writing the vault's rows. */

import type {
  AnswerBankEntry, BoardRegistration, DocumentRecord, DocumentVersion, Gate, Money, OutboundRecord,
  Interview, Opportunity, Profile, Requisition, Screening, Settings, SourceState,
  Stage, TimelineEvent, AssistantProvider, AssistantRun,
} from '../shared/types.js';
import type { Store } from './db/store.js';
import { pairKey } from './screening/checks.js';

const SETTING_DEFAULTS: Settings = {
  maxPostingAgeDays: 30,
  requireFirstPartyPay: false,
  excludedEmployers: [],
  harvestCadenceHours: null,
  requestDelayMs: 1500,
  sequentialFetch: false,
  identifyAs: 'cairn',
  keepDroppedHashes: true,
  theme: 'system',
  accent: 'pine',
  density: 'comfortable',
  pipelinePageSize: 10,
  pipelineLayout: 'list',
  listLayout: 'list',
  textSize: 'default',
  weekStartsOn: 'monday',
  lockAfterMinutes: 15,
  chaseAfterDays: 10,
  screenShare: false,
  documentsHeld: 'copied',
  notify: false,
  quietFrom: 22 * 60,
  quietTo: 8 * 60,
  language: 'en',
  stageLabels: {},
  stageColours: {},
  lastHarvest: null,
  lastBackupAt: null,
};

interface ProfileRow {
  display_name: string; locations: string; remote_only: number; currency: string;
  pay_floor: number | null; pay_target: number | null; skills: string; families: string;
  work_auth: string | null; needs_sponsor: number | null;
}

interface InterviewRow {
  id: string; opportunity_id: string; at: string; minutes: number; round: string;
  people: string; join_url: string | null; notes: string; questions: string;
  prepared: string; outcome: string;
}

interface EventRow {
  id: string; opportunity_id: string | null; at: string; kind: string; detail: string | null;
}

interface OpportunityRow {
  id: string; company: string; role: string; url: string | null; location: string | null;
  remote: string; pay: string | null; stage: string; fit: string | null; family: string | null;
  gate: string | null; blocker: string | null; concession: string | null; posting: string | null;
  screening: string | null; contact: string | null; followup_channel: string | null;
  next_action: string | null; next_action_due: string | null; posted_at: string | null;
  captured_at: string; applied_at: string | null; resume_id: string | null;
  resume_file: string | null;
  archived_at: string | null; notes: string | null;
}

interface AssistantProviderRow {
  id: string; kind: string; base: string; model: string; key_sealed: string;
  effort: string; quiet: string; added_at: string;
}

interface AssistantRunRow {
  id: string; at: string; task: string; provider_id: string; model: string; host: string;
  bytes_out: number; bytes_in: number; tokens_in: number; tokens_out: number;
  cost_estimate: number | null; outcome: string; about: string | null;
}

export class Repo {
  constructor(private readonly store: Store) {}

  // --- settings -----------------------------------------------------------

  settings(): Settings {
    const rows = this.store.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try { stored[row.key] = JSON.parse(row.value); } catch { /* a damaged row falls back to the default below */ }
    }
    const merged = { ...SETTING_DEFAULTS, ...(stored as Partial<Settings>) };
    // A vault written before the last run became figures has a sentence here, and a
    // sentence cannot be read as a summary. Null rather than a shape nothing expects.
    if (typeof merged.lastHarvest !== 'object') merged.lastHarvest = null;
    return merged;
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.store.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  /** The day the last notice was given. Machine state rather than a preference:
   *  nobody sets it, nothing offers it, and it has no business in a settings screen --
   *  which is where `machineName` already lives for the same reason. */
  lastNotifiedOn(): string | null {
    const row = this.store.get<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'lastNotifiedOn'");
    return row === undefined ? null : (JSON.parse(row.value) as string);
  }

  setLastNotifiedOn(day: string): void {
    this.store.run(
      "INSERT INTO settings (key, value) VALUES ('lastNotifiedOn', ?) " +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [JSON.stringify(day)]);
  }

  machineName(): string {
    const row = this.store.get<{ value: string }>("SELECT value FROM settings WHERE key = 'machineName'");
    if (!row) return 'this machine';
    try { return String(JSON.parse(row.value)); } catch { return 'this machine'; }
  }

  // --- profile ------------------------------------------------------------

  profile(): Profile {
    const row = this.store.get<ProfileRow>('SELECT * FROM profile WHERE id = 1');
    if (!row) throw new Error('The vault has no profile row, which means it was not created by Cairn.');
    const list = (raw: string): string[] => {
      try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
      catch { return []; }
    };
    return {
      displayName: row.display_name,
      locations: list(row.locations),
      remoteOnly: row.remote_only === 1,
      currency: row.currency,
      payFloor: row.pay_floor,
      payTarget: row.pay_target,
      skills: list(row.skills),
      families: list(row.families),
      workAuthorisation: row.work_auth,
      needsSponsorship: row.needs_sponsor === null ? null : row.needs_sponsor === 1,
    };
  }

  saveProfile(p: Profile): void {
    this.store.run(
      `UPDATE profile SET display_name = ?, locations = ?, remote_only = ?, currency = ?,
       pay_floor = ?, pay_target = ?, skills = ?, families = ?, work_auth = ?, needs_sponsor = ?
       WHERE id = 1`,
      [
        p.displayName, JSON.stringify(p.locations), p.remoteOnly ? 1 : 0, p.currency,
        p.payFloor, p.payTarget, JSON.stringify(p.skills), JSON.stringify(p.families),
        p.workAuthorisation, p.needsSponsorship === null ? null : p.needsSponsorship ? 1 : 0,
      ],
    );
  }

  /** Setup is finished when the profile has been filled in, not when a flag says so.
   *  A flag can disagree with the rows; a derived answer cannot. */
  isSetUp(): boolean {
    const p = this.profile();
    return p.displayName.trim().length > 0 && p.families.length > 0;
  }

  // --- opportunities ------------------------------------------------------

  opportunities(includeArchived = false): Opportunity[] {
    const rows = this.store.all<OpportunityRow>(
      `SELECT * FROM opportunity ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY captured_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id, company: r.company, role: r.role, url: r.url, location: r.location,
      remote: r.remote as Opportunity['remote'],
      pay: r.pay === null ? null : (JSON.parse(r.pay) as Opportunity['pay']),
      stage: r.stage as Stage,
      fit: r.fit as Opportunity['fit'],
      family: r.family, nextAction: r.next_action, nextActionDue: r.next_action_due,
      postedAt: r.posted_at, capturedAt: r.captured_at, appliedAt: r.applied_at,
      resumeId: r.resume_id, resumeFile: r.resume_file,
      archivedAt: r.archived_at, notes: r.notes,
      gate: r.gate === null ? null : (JSON.parse(r.gate) as Gate),
      posting: r.posting,
      screening: r.screening === null ? null : (JSON.parse(r.screening) as Screening),
      blocker: r.blocker,
      concession: r.concession as Opportunity['concession'],
      contact: r.contact,
      followupChannel: r.followup_channel as Opportunity['followupChannel'],
    }));
  }

  /** Every link Cairn has already seen, from both tables. */
  knownUrls(): Set<string> {
    const rows = this.store.all<{ url: string }>(
      `SELECT url FROM opportunity WHERE url IS NOT NULL
       UNION SELECT url FROM requisition WHERE url IS NOT NULL`,
    );
    return new Set(rows.map((r) => r.url));
  }

  /** Every employer-and-role already here, from both tables. A filled requisition is
   *  re-listed under a new link, so the link alone lets one role in twice. */
  knownPairs(): Set<string> {
    const rows = this.store.all<{ company: string; role: string }>(
      `SELECT company, role FROM opportunity
       UNION SELECT company, role FROM requisition WHERE state <> 'dropped'`,
    );
    return new Set(rows.map((r) => pairKey(r.company, r.role)));
  }

  droppedHashes(): Set<string> {
    const rows = this.store.all<{ url_hash: string }>('SELECT url_hash FROM dropped');
    return new Set(rows.map((r) => r.url_hash));
  }

  saveOpportunity(o: Opportunity): void {
    this.store.run(
      `INSERT INTO opportunity
        (id, company, role, url, location, remote, pay, stage, fit, family,
         next_action, next_action_due, posted_at, captured_at, applied_at, resume_id, resume_file,
         archived_at, notes, gate, blocker, concession, contact, followup_channel, posting,
         screening)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         company=excluded.company, role=excluded.role, url=excluded.url, location=excluded.location,
         remote=excluded.remote, pay=excluded.pay, stage=excluded.stage, fit=excluded.fit,
         family=excluded.family, next_action=excluded.next_action,
         next_action_due=excluded.next_action_due, posted_at=excluded.posted_at,
         applied_at=excluded.applied_at, resume_id=excluded.resume_id,
         resume_file=excluded.resume_file,
         archived_at=excluded.archived_at, notes=excluded.notes, gate=excluded.gate,
         blocker=excluded.blocker, concession=excluded.concession, contact=excluded.contact,
         followup_channel=excluded.followup_channel, posting=excluded.posting,
         screening=excluded.screening`,
      [
        o.id, o.company, o.role, o.url, o.location, o.remote,
        o.pay === null ? null : JSON.stringify(o.pay),
        o.stage, o.fit, o.family, o.nextAction, o.nextActionDue,
        o.postedAt, o.capturedAt, o.appliedAt, o.resumeId, o.resumeFile,
        o.archivedAt, o.notes,
        o.gate === null ? null : JSON.stringify(o.gate),
        o.blocker, o.concession, o.contact, o.followupChannel, o.posting,
        o.screening === null ? null : JSON.stringify(o.screening),
      ],
    );
  }

  // --- requisitions --------------------------------------------------------

  requisitions(state: Requisition['state'] = 'waiting'): Requisition[] {
    return this.store
      .all<{
        id: string; company: string; role: string; url: string | null; raw: string;
        source_id: string; captured_at: string; pay: string | null; screening: string;
        remote: string; state: string;
      }>('SELECT * FROM requisition WHERE state = ? ORDER BY captured_at DESC', [state])
      .map((r) => ({
        id: r.id, company: r.company, role: r.role, url: r.url, raw: r.raw,
        sourceId: r.source_id, capturedAt: r.captured_at,
        pay: r.pay === null ? null : (JSON.parse(r.pay) as Money),
        remote: r.remote as Requisition['remote'],
        screening: JSON.parse(r.screening) as Screening,
        state: r.state as Requisition['state'],
      }));
  }

  saveRequisition(requisition: Requisition): void {
    this.store.run(
      `INSERT INTO requisition
        (id, company, role, url, raw, source_id, captured_at, pay, screening, remote, state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, screening = excluded.screening`,
      [
        requisition.id, requisition.company, requisition.role, requisition.url, requisition.raw,
        requisition.sourceId, requisition.capturedAt,
        requisition.pay === null ? null : JSON.stringify(requisition.pay),
        // A row written before the column existed carries no reading, and unstated is
        // what "we did not read this" means everywhere else in the app.
        JSON.stringify(requisition.screening), requisition.remote ?? 'unstated', requisition.state,
      ],
    );
  }

  /** How many are in each state, so a screen can say what it is not showing.
   *  A queue of 53 above a vault holding 700 set-aside rows is a number that cannot
   *  be reconciled with anything. */
  requisitionCounts(): Record<Requisition['state'], number> {
    const counts: Record<Requisition['state'], number> = { waiting: 0, kept: 0, dropped: 0 };
    for (const row of this.store.all<{ state: string; n: number }>(
      'SELECT state, count(*) AS n FROM requisition GROUP BY state')) {
      if (row.state in counts) counts[row.state as Requisition['state']] = row.n;
    }
    return counts;
  }

  /** Gone rather than hidden. Setting one aside marks it; this removes the rows. */
  deleteRequisitions(state: Requisition['state']): number {
    const before = this.store.get<{ n: number }>(
      'SELECT count(*) AS n FROM requisition WHERE state = ?', [state]);
    this.store.run('DELETE FROM requisition WHERE state = ?', [state]);
    return before?.n ?? 0;
  }

  /** Stop remembering a link, so the posting can arrive again. Bringing a lead back
   *  without this would put it in the queue and have the next run drop it. */
  /** How many links Cairn is remembering. Invisible state that goes on deciding
   *  things after the rows it came from have been deleted is state somebody has to be
   *  able to see. */
  droppedCount(): number {
    return this.store.get<{ n: number }>('SELECT count(*) AS n FROM dropped')?.n ?? 0;
  }

  forgetAllDropped(): number {
    const before = this.droppedCount();
    this.store.run('DELETE FROM dropped');
    return before;
  }

  forgetDropped(urlHash: string): void {
    this.store.run('DELETE FROM dropped WHERE url_hash = ?', [urlHash]);
  }

  setRequisitionState(id: string, state: Requisition['state']): void {
    this.store.run('UPDATE requisition SET state = ? WHERE id = ?', [state, id]);
  }

  /** A dropped lead leaves a hash of its link and nothing else -- enough to stop the
   *  same posting arriving again, and useless to anybody who reads the table. */
  rememberDropped(urlHash: string): void {
    this.store.run(
      'INSERT INTO dropped (url_hash, dropped_at) VALUES (?, ?) ON CONFLICT(url_hash) DO NOTHING',
      [urlHash, new Date().toISOString()],
    );
  }

  // --- sources and boards --------------------------------------------------

  sourceStates(): SourceState[] {
    const rows = this.store.all<{ id: string; enabled: number; last_run: string | null; last_error: string | null }>(
      'SELECT * FROM source',
    );
    const counts = new Map(
      this.store
        .all<{ source_id: string; n: number }>('SELECT source_id, count(*) AS n FROM board GROUP BY source_id')
        .map((r) => [r.source_id, r.n]),
    );
    return rows.map((r) => ({
      id: r.id, enabled: r.enabled === 1, lastRun: r.last_run, lastError: r.last_error,
      boards: counts.get(r.id) ?? 0,
    }));
  }

  setSourceEnabled(id: string, enabled: boolean): void {
    this.store.run(
      'INSERT INTO source (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled',
      [id, enabled ? 1 : 0],
    );
  }

  recordSourceRun(id: string, error: string | null): void {
    this.store.run(
      `INSERT INTO source (id, enabled, last_run, last_error) VALUES (?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_run = excluded.last_run, last_error = excluded.last_error`,
      [id, new Date().toISOString(), error],
    );
  }

  boards(): BoardRegistration[] {
    return this.store
      .all<{ source_id: string; token: string; company: string; added_at: string }>(
        'SELECT * FROM board ORDER BY company COLLATE NOCASE',
      )
      .map((r) => ({ sourceId: r.source_id, token: r.token, company: r.company, addedAt: r.added_at }));
  }

  addBoard(board: BoardRegistration): void {
    this.store.run(
      `INSERT INTO board (source_id, token, company, added_at) VALUES (?,?,?,?)
       ON CONFLICT(source_id, token) DO UPDATE SET company = excluded.company`,
      [board.sourceId, board.token, board.company, board.addedAt],
    );
  }

  removeBoard(sourceId: string, token: string): void {
    this.store.run('DELETE FROM board WHERE source_id = ? AND token = ?', [sourceId, token]);
  }

  // --- answer bank --------------------------------------------------------

  answers(): AnswerBankEntry[] {
    return this.store
      .all<{
        id: string; question: string; answer: string; intent: string | null;
        kind: string; used_count: number; updated_at: string;
      }>('SELECT * FROM answer ORDER BY used_count DESC, question ASC')
      .map((r) => ({
        id: r.id, question: r.question, answer: r.answer, intent: r.intent,
        kind: r.kind as AnswerBankEntry['kind'],
        usedCount: r.used_count, updatedAt: r.updated_at,
      }));
  }

  saveAnswer(entry: AnswerBankEntry): void {
    this.store.run(
      `INSERT INTO answer (id, question, answer, intent, kind, used_count, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET question=excluded.question, answer=excluded.answer,
         intent=excluded.intent, kind=excluded.kind,
         used_count=excluded.used_count, updated_at=excluded.updated_at`,
      [entry.id, entry.question, entry.answer, entry.intent, entry.kind,
       entry.usedCount, entry.updatedAt],
    );
  }

  /** Counted when an answer is actually used on a form, not when it is written.
   *  It is the one figure in Cairn that says whether the bank is earning its keep. */
  countAnswerUsed(id: string): void {
    this.store.run('UPDATE answer SET used_count = used_count + 1 WHERE id = ?', [id]);
  }

  deleteAnswer(id: string): void {
    this.store.run('DELETE FROM answer WHERE id = ?', [id]);
  }

  // --- the timeline --------------------------------------------------------

  events(opportunityId?: string): TimelineEvent[] {
    const rows = opportunityId === undefined
      ? this.store.all<EventRow>('SELECT * FROM event ORDER BY at DESC LIMIT 500')
      : this.store.all<EventRow>('SELECT * FROM event WHERE opportunity_id = ? ORDER BY at DESC',
          [opportunityId]);
    return rows.map((r) => ({
      id: r.id, opportunityId: r.opportunity_id, at: r.at,
      kind: r.kind as TimelineEvent['kind'], detail: r.detail,
    }));
  }

  addEvent(event: TimelineEvent): void {
    this.store.run('INSERT INTO event (id, opportunity_id, at, kind, detail) VALUES (?,?,?,?,?)',
      [event.id, event.opportunityId, event.at, event.kind, event.detail]);
  }

  /** The most recent event on each role, which is what "last contact" means in a
   *  ledger -- silence since then is the thing worth seeing. */
  lastEventByOpportunity(): Map<string, TimelineEvent> {
    const rows = this.store.all<EventRow>(
      `SELECT e.* FROM event e
       JOIN (SELECT opportunity_id, MAX(at) AS newest FROM event
             WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id) latest
         ON e.opportunity_id = latest.opportunity_id AND e.at = latest.newest`,
    );
    return new Map(rows.map((r) => [r.opportunity_id ?? '', {
      id: r.id, opportunityId: r.opportunity_id, at: r.at,
      kind: r.kind as TimelineEvent['kind'], detail: r.detail,
    }]));
  }

  // --- interviews ----------------------------------------------------------

  interviews(opportunityId?: string): Interview[] {
    const rows = opportunityId === undefined
      ? this.store.all<InterviewRow>('SELECT * FROM interview ORDER BY at ASC')
      : this.store.all<InterviewRow>('SELECT * FROM interview WHERE opportunity_id = ? ORDER BY at ASC',
          [opportunityId]);
    return rows.map((r) => ({
      id: r.id, opportunityId: r.opportunity_id, at: r.at, minutes: r.minutes,
      round: r.round, people: r.people, joinUrl: r.join_url, notes: r.notes,
      questions: r.questions,
      prepared: ((): string[] => {
        try { const v: unknown = JSON.parse(r.prepared); return Array.isArray(v) ? v.map(String) : []; }
        catch { return []; }
      })(),
      outcome: r.outcome as Interview['outcome'],
    }));
  }

  saveInterview(interview: Interview): void {
    this.store.run(
      `INSERT INTO interview
        (id, opportunity_id, at, minutes, round, people, join_url, notes, questions, prepared, outcome)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET at=excluded.at, minutes=excluded.minutes,
         round=excluded.round, people=excluded.people, join_url=excluded.join_url,
         notes=excluded.notes, questions=excluded.questions, prepared=excluded.prepared,
         outcome=excluded.outcome`,
      [interview.id, interview.opportunityId, interview.at, interview.minutes,
       interview.round, interview.people, interview.joinUrl, interview.notes,
       interview.questions, JSON.stringify(interview.prepared), interview.outcome],
    );
  }

  deleteInterview(id: string): void {
    this.store.run('DELETE FROM interview WHERE id = ?', [id]);
  }

  // --- documents -----------------------------------------------------------

  documents(): DocumentRecord[] {
    return this.store
      .all<{
        id: string; kind: string; title: string; relative_path: string; format: string;
        is_default: number; note: string; used_count: number; updated_at: string; held: string;
      }>('SELECT * FROM document ORDER BY is_default DESC, updated_at DESC')
      .map((r) => ({
        id: r.id, kind: r.kind as DocumentRecord['kind'], title: r.title,
        relativePath: r.relative_path, held: (r.held === 'linked' ? 'linked' : 'copied'),
        format: r.format as DocumentRecord['format'],
        isDefault: r.is_default === 1, note: r.note,
        usedCount: r.used_count, updatedAt: r.updated_at,
      }));
  }

  saveDocument(record: DocumentRecord): void {
    this.store.run(
      `INSERT INTO document (id, kind, title, relative_path, format, is_default, note, used_count, updated_at, held)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, relative_path=excluded.relative_path,
         format=excluded.format, is_default=excluded.is_default, note=excluded.note,
         used_count=excluded.used_count, updated_at=excluded.updated_at, held=excluded.held`,
      [record.id, record.kind, record.title, record.relativePath, record.format,
       record.isDefault ? 1 : 0, record.note, record.usedCount, record.updatedAt, record.held],
    );
  }

  /** Exactly one default per kind. Set in a transaction so there is never a moment
   *  with two, or with none. */
  setDefaultDocument(id: string, kind: DocumentRecord['kind']): void {
    this.transaction(() => {
      this.store.run('UPDATE document SET is_default = 0 WHERE kind = ?', [kind]);
      this.store.run('UPDATE document SET is_default = 1 WHERE id = ?', [id]);
    });
  }

  defaultDocument(kind: DocumentRecord['kind']): DocumentRecord | null {
    return this.documents().find((d) => d.kind === kind && d.isDefault) ?? null;
  }

  documentVersions(documentId: string): DocumentVersion[] {
    return this.store
      .all<{ id: string; document_id: string; relative_path: string; format: string; bytes: number; replaced_at: string }>(
        'SELECT * FROM document_version WHERE document_id = ? ORDER BY replaced_at DESC', [documentId])
      .map((r) => ({
        id: r.id, documentId: r.document_id, relativePath: r.relative_path,
        format: r.format as DocumentVersion['format'], bytes: r.bytes, replacedAt: r.replaced_at,
      }));
  }

  saveDocumentVersion(version: DocumentVersion): void {
    this.store.run(
      `INSERT INTO document_version (id, document_id, relative_path, format, bytes, replaced_at)
       VALUES (?,?,?,?,?,?)`,
      [version.id, version.documentId, version.relativePath, version.format, version.bytes, version.replacedAt],
    );
  }

  countDocumentUsed(id: string): void {
    this.store.run('UPDATE document SET used_count = used_count + 1 WHERE id = ?', [id]);
  }

  deleteDocument(id: string): void {
    this.store.run('DELETE FROM document WHERE id = ?', [id]);
  }

  private transaction<T>(fn: () => T): T {
    return this.store.transaction(fn);
  }

  // --- outbound -----------------------------------------------------------

  recordOutbound(record: OutboundRecord): void {
    this.store.run('INSERT INTO outbound (id, at, host, reason, ok, bytes) VALUES (?,?,?,?,?,?)', [
      record.id, record.at, record.host, record.reason, record.ok ? 1 : 0, record.bytes,
    ]);
  }

  outboundToday(): number {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const row = this.store.get<{ n: number }>('SELECT count(*) AS n FROM outbound WHERE at >= ?', [
      midnight.toISOString(),
    ]);
    return row?.n ?? 0;
  }

  recentOutbound(limit = 200): OutboundRecord[] {
    return this.store
      .all<{ id: string; at: string; host: string; reason: string; ok: number; bytes: number }>(
        'SELECT * FROM outbound ORDER BY at DESC LIMIT ?', [limit],
      )
      .map((r) => ({ id: r.id, at: r.at, host: r.host, reason: r.reason, ok: r.ok === 1, bytes: r.bytes }));
  }

  // --- the assistant ------------------------------------------------------

  /** The provider you brought, or nothing. One at a time: two would mean every button
   *  asking which, on a screen whose whole point is knowing what leaves. */
  assistantProvider(): AssistantProvider | null {
    const row = this.store.get<AssistantProviderRow>('SELECT * FROM assistant_provider LIMIT 1');
    if (row === undefined) return null;
    return {
      id: row.id,
      kind: row.kind as AssistantProvider['kind'],
      base: row.base,
      model: row.model,
      keyHeld: row.key_sealed !== '',
      effort: row.effort as AssistantProvider['effort'],
      quiet: JSON.parse(row.quiet) as AssistantProvider['quiet'],
      addedAt: row.added_at,
    };
  }

  /** The sealed key, as the OS keychain returned it. Never leaves the main process. */
  assistantKeySealed(): string {
    return this.store.get<{ key_sealed: string }>('SELECT key_sealed FROM assistant_provider LIMIT 1')
      ?.key_sealed ?? '';
  }

  /** One provider at a time, so the row is replaced rather than added to. Keyed on the
   *  provider's name, an upsert left two rows and no way to say which one was live. */
  saveAssistantProvider(provider: AssistantProvider, keySealed: string | null): void {
    const before = this.assistantProvider();
    const existing = this.assistantKeySealed();
    // A key belongs to one provider and is worthless at another, so changing provider
    // drops it rather than carrying it quietly to somewhere it cannot work.
    const carried = before !== null && before.id === provider.id ? existing : '';
    this.store.transaction(() => {
      this.store.run('DELETE FROM assistant_provider');
      this.store.run(
        `INSERT INTO assistant_provider (id, kind, base, model, key_sealed, effort, quiet, added_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          provider.id, provider.kind, provider.base, provider.model,
          // Null means the field was left alone rather than emptied, so saving a model
          // choice does not silently throw the key away.
          keySealed ?? carried,
          provider.effort, JSON.stringify(provider.quiet), provider.addedAt,
        ],
      );
    });
  }

  forgetAssistantProvider(): void {
    this.store.run('DELETE FROM assistant_provider');
  }

  recordAssistantRun(run: AssistantRun): void {
    this.store.run(
      `INSERT INTO assistant_run
         (id, at, task, provider_id, model, host, bytes_out, bytes_in, tokens_in, tokens_out,
          cost_estimate, outcome, about)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        run.id, run.at, run.task, run.providerId, run.model, run.host, run.bytesOut, run.bytesIn,
        run.tokensIn, run.tokensOut, run.costEstimate, run.outcome, run.about,
      ],
    );
  }

  assistantRuns(limit = 200): AssistantRun[] {
    return this.store
      .all<AssistantRunRow>('SELECT * FROM assistant_run ORDER BY at DESC LIMIT ?', [limit])
      .map((r) => ({
        id: r.id, at: r.at, task: r.task as AssistantRun['task'], providerId: r.provider_id,
        model: r.model, host: r.host, bytesOut: r.bytes_out, bytesIn: r.bytes_in,
        tokensIn: r.tokens_in, tokensOut: r.tokens_out, costEstimate: r.cost_estimate,
        outcome: r.outcome as AssistantRun['outcome'], about: r.about,
      }));
  }
}
