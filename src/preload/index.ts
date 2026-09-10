/** The bridge. Every call the interface can make, and nothing else. */

import { contextBridge, ipcRenderer } from 'electron';
import type { Sheet } from '../main/data.js';
import type { Found } from '../main/search.js';
import type {
  AnswerBankEntry, AtEmployer, BoardRegistration, DatedThing, DocumentRecord, DocumentVersion, Interview,
  Erased, HarvestSummary, Opportunity, OutboundRecord, Profile, Requisition, Settings, SourceState,
  StartOverResult, TimelineEvent, UpdateCheck, VaultStatus,
  AssistantProvider, AssistantResult, AssistantRun, AssistantTask,
} from '../shared/types.js';
import type { Leaving } from '../main/assistant/inspector.js';
import type { ProviderPreset } from '../main/assistant/provider.js';
import type { Sealing } from '../main/assistant/keys.js';

/** A feed as the editor hands it over: an address and what the fields are called.
 *  The same shape a source pack file holds, judged by the same reader. */
export interface FeedDefinition {
  id: string;
  label: string;
  kind: 'ats' | 'aggregator';
  docs: string;
  endpoint: string;
  list?: string;
  searchless?: boolean;
  note?: string;
  fields: Record<string, string | Record<string, string>>;
}

export interface FamilyList {
  families: { id: string; label: string; titles: string[] }[];
  yours: string[];
  replaceShipped: boolean;
  problem: string | null;
}

const api = {
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    create: (passphrase: string): Promise<boolean> => ipcRenderer.invoke('vault:create', passphrase),
    unlock: (passphrase: string): Promise<boolean> => ipcRenderer.invoke('vault:unlock', passphrase),
    lock: (): Promise<boolean> => ipcRenderer.invoke('vault:lock'),
    touch: (): Promise<boolean> => ipcRenderer.invoke('vault:touch'),
    startOver: (): Promise<StartOverResult> => ipcRenderer.invoke('vault:startOver'),
    erase: (typed: string): Promise<Erased | null> => ipcRenderer.invoke('vault:erase', typed),
    checkForUpdate: (): Promise<UpdateCheck> => ipcRenderer.invoke('updates:check'),
    where: (): Promise<{ path: string; moved: boolean }> => ipcRenderer.invoke('vault:where'),
    moveTo: (): Promise<string | null> => ipcRenderer.invoke('vault:moveTo'),
    /** Told whenever the vault locks, whoever asked for it. */
    onLocked: (told: () => void): void => { ipcRenderer.on('vault:locked', () => { told(); }); },
  },
  setup: {
    isComplete: (): Promise<boolean> => ipcRenderer.invoke('setup:isComplete'),
    defaults: (): Promise<unknown> => ipcRenderer.invoke('setup:defaults'),
  },
  families: {
    get: (): Promise<FamilyList> => ipcRenderer.invoke('families:get'),
    save: (families: FamilyList['families'], replaceShipped: boolean): Promise<FamilyList['families']> =>
      ipcRenderer.invoke('families:save', families, replaceShipped),
    reset: (): Promise<boolean> => ipcRenderer.invoke('families:reset'),
  },
  profile: {
    get: (): Promise<Profile> => ipcRenderer.invoke('profile:get'),
    save: (profile: Profile): Promise<Profile> => ipcRenderer.invoke('profile:save', profile),
  },
  language: {
    list: (): Promise<{ code: string; name: string; shipped: boolean }[]> =>
      ipcRenderer.invoke('language:list'),
    phrases: (): Promise<{
      code: string; phrases: Record<string, string>; known: number; notYet: number;
    }> => ipcRenderer.invoke('language:phrases'),
    folder: (): Promise<string> => ipcRenderer.invoke('language:folder'),
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<boolean> =>
      ipcRenderer.invoke('settings:set', key, value),
  },
  opportunities: {
    list: (): Promise<Opportunity[]> => ipcRenderer.invoke('opportunities:list'),
    save: (o: Opportunity): Promise<boolean> => ipcRenderer.invoke('opportunities:save', o),
    create: (partial: Partial<Opportunity>): Promise<Opportunity> =>
      ipcRenderer.invoke('opportunities:new', partial),
    archive: (id: string, reason: string): Promise<boolean> =>
      ipcRenderer.invoke('opportunities:archive', id, reason),
    restore: (id: string): Promise<boolean> => ipcRenderer.invoke('opportunities:restore', id),
    liveAt: (company: string, exclude: string): Promise<AtEmployer> =>
      ipcRenderer.invoke('opportunities:liveAt', company, exclude),
    archived: (): Promise<{ opportunity: Opportunity; reason: string | null }[]> =>
      ipcRenderer.invoke('opportunities:archived'),
  },
  answers: {
    list: (): Promise<AnswerBankEntry[]> => ipcRenderer.invoke('answers:list'),
    intents: (): Promise<{ id: string; prompt: string; kind: AnswerBankEntry['kind']; terms: string[] }[]> =>
      ipcRenderer.invoke('answers:intents'),
    save: (entry: AnswerBankEntry): Promise<boolean> => ipcRenderer.invoke('answers:save', entry),
    create: (question: string, intent: string | null, kind: AnswerBankEntry['kind']): Promise<AnswerBankEntry> =>
      ipcRenderer.invoke('answers:new', question, intent, kind),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('answers:delete', id),
    used: (id: string): Promise<boolean> => ipcRenderer.invoke('answers:used', id),
    readForm: (html: string): Promise<{
      field: { label: string; kind: string; value: string | null; options: string[] };
      suggestion: { entry: AnswerBankEntry; score: number; how: string; because: string } | null;
    }[]> => ipcRenderer.invoke('answers:readForm', html),
  },
  sources: {
    list: (): Promise<SourceState[]> => ipcRenderer.invoke('sources:list'),
    catalogue: (): Promise<{
      id: string; label: string; kind: string; provenance: string;
      docs: string; note: string; host: string;
      origin: 'builtin' | 'shipped' | 'yours' | 'imported';
    }[]> => ipcRenderer.invoke('sources:catalogue'),
    definition: (id: string): Promise<FeedDefinition | null> =>
      ipcRenderer.invoke('sources:definition', id),
    saveFeed: (definition: FeedDefinition): Promise<{ id: string }> =>
      ipcRenderer.invoke('sources:saveFeed', definition),
    removeFeed: (id: string): Promise<boolean> => ipcRenderer.invoke('sources:removeFeed', id),
    packs: (): Promise<{ file: string; sources: string[] }[]> => ipcRenderer.invoke('sources:packs'),
    removePack: (file: string): Promise<boolean> => ipcRenderer.invoke('sources:removePack', file),
    setEnabled: (id: string, enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('sources:setEnabled', id, enabled),
    problems: (): Promise<string[]> => ipcRenderer.invoke('sources:problems'),
    importPack: (): Promise<{ file: string; sources: string[] } | null> =>
      ipcRenderer.invoke('sources:importPack'),
  },
  boards: {
    list: (): Promise<BoardRegistration[]> => ipcRenderer.invoke('boards:list'),
    add: (url: string, company: string): Promise<BoardRegistration> =>
      ipcRenderer.invoke('boards:add', url, company),
    remove: (sourceId: string, token: string): Promise<boolean> =>
      ipcRenderer.invoke('boards:remove', sourceId, token),
    suggested: (): Promise<BoardRegistration[]> => ipcRenderer.invoke('boards:suggested'),
    addSuggested: (wanted: { sourceId: string; token: string; company: string }[]): Promise<number> =>
      ipcRenderer.invoke('boards:addSuggested', wanted),
  },
  harvest: {
    state: (): Promise<{
      running: boolean;
      startedAt: string | null;
      progress: { boards: { done: number; total: number }; feeds: { done: number; total: number } } | null;
      nextRunAt: string | null;
      lastResult: { requisitions: number; ranAt: string } | null;
      lastSummary: HarvestSummary | null;
    }> => ipcRenderer.invoke('harvest:state'),
    plan: (): Promise<{
      targets: { sourceId: string; token: string; company: string }[];
      blocked: { sourceId: string; because: string }[];
      requests: number;
    }> => ipcRenderer.invoke('harvest:plan'),
    run: (): Promise<{
      outcomes: { target: { sourceId: string; token: string; company: string };
                  found: number; kept: number; error: string | null }[];
      requisitions: number; ranAt: string;
    }> => ipcRenderer.invoke('harvest:run'),
  },
  open: {
    external: (url: string): Promise<boolean> => ipcRenderer.invoke('open:external', url),
  },
  employers: {
    set: (names: string[]): Promise<{ names: string[]; dropped: number }> =>
      ipcRenderer.invoke('employers:set', names),
    exclude: (name: string): Promise<{ names: string[]; dropped: number }> =>
      ipcRenderer.invoke('employers:exclude', name),
  },
  requisitions: {
    list: (): Promise<Requisition[]> => ipcRenderer.invoke('requisitions:list'),
    posting: (id: string): Promise<string | null> => ipcRenderer.invoke('requisitions:posting', id),
    clearWaiting: (): Promise<{ cleared: number } | null> => ipcRenderer.invoke('requisitions:clearWaiting'),
    setAside: (): Promise<Requisition[]> => ipcRenderer.invoke('requisitions:setAside'),
    counts: (): Promise<{ waiting: number; kept: number; dropped: number; links: number }> =>
      ipcRenderer.invoke('requisitions:counts'),
    forgetLinks: (): Promise<{ forgotten: number } | null> => ipcRenderer.invoke('requisitions:forgetLinks'),
    restore: (id: string): Promise<boolean> => ipcRenderer.invoke('requisitions:restore', id),
    forget: (): Promise<{ deleted: number } | null> => ipcRenderer.invoke('requisitions:forget'),
    keep: (id: string): Promise<Opportunity | null> => ipcRenderer.invoke('requisitions:keep', id),
    drop: (id: string): Promise<boolean> => ipcRenderer.invoke('requisitions:drop', id),
  },
  data: {
    tables: (): Promise<{ name: string; rows: number }[]> => ipcRenderer.invoke('data:tables'),
    page: (table: string, limit: number, offset: number): Promise<Sheet> =>
      ipcRenderer.invoke('data:page', table, limit, offset),
    update: (table: string, where: Record<string, unknown>, column: string, value: string): Promise<boolean> =>
      ipcRenderer.invoke('data:update', table, where, column, value),
    remove: (table: string, where: Record<string, unknown>): Promise<{ alsoGone: { table: string; rows: number }[] }> =>
      ipcRenderer.invoke('data:delete', table, where),
    export: (): Promise<{ file: string; tables: number; rows: number } | null> =>
      ipcRenderer.invoke('data:export'),
    import: (): Promise<{ file: string; written: number; skipped: string[] } | null> =>
      ipcRenderer.invoke('data:import'),
    csv: (table: string): Promise<{ file: string; rows: number } | null> =>
      ipcRenderer.invoke('data:csv', table),
    roles: (): Promise<
      { file: string; added: number; alreadyHere: number; incomplete: number; ignored: string[] } | null
    > => ipcRenderer.invoke('data:roles'),
  },
  outbound: {
    recent: (): Promise<OutboundRecord[]> => ipcRenderer.invoke('outbound:recent'),
  },
  assistant: {
    presets: (): Promise<ProviderPreset[]> => ipcRenderer.invoke('assistant:presets'),
    sealing: (): Promise<Sealing> => ipcRenderer.invoke('assistant:sealing'),
    get: (): Promise<{
      provider: AssistantProvider | null; grounded: boolean; pricing: string; ready: boolean;
    }> => ipcRenderer.invoke('assistant:get'),
    save: (provider: AssistantProvider, key: string | null): Promise<AssistantProvider | null> =>
      ipcRenderer.invoke('assistant:save', provider, key),
    forget: (): Promise<boolean> => ipcRenderer.invoke('assistant:forget'),
    models: (): Promise<{ id: string; label: string }[]> => ipcRenderer.invoke('assistant:models'),
    runs: (): Promise<AssistantRun[]> => ipcRenderer.invoke('assistant:runs'),
    /** Build a request and say what would leave. This sends nothing. */
    prepare: (task: AssistantTask, subject: string, extra?: string): Promise<{
      ticket: string; leaving: Leaving; quiet: boolean;
    }> => ipcRenderer.invoke('assistant:prepare', task, subject, extra),
    /** Send exactly what was shown. The interface never hands over a payload of its own. */
    send: (ticket: string): Promise<AssistantResult> => ipcRenderer.invoke('assistant:send', ticket),
    cancel: (ticket: string): Promise<boolean> => ipcRenderer.invoke('assistant:cancel', ticket),
  },
  letters: {
    templates: (): Promise<{ id: string; name: string; use: string; body: string; slots: string[] }[]> =>
      ipcRenderer.invoke('letters:templates'),
    fill: (templateId: string, values: Record<string, string>): Promise<{
      letter: string; unfilled: string[];
      refusals: { reason: string; found: string }[]; sendable: boolean;
    }> => ipcRenderer.invoke('letters:fill', templateId, values),
    check: (letter: string): Promise<{ refusals: { reason: string; found: string }[]; sendable: boolean }> =>
      ipcRenderer.invoke('letters:check', letter),
    render: (letter: string, company: string, overwrite: boolean): Promise<{
      record: DocumentRecord;
      check: { bytes: number; pages: number; drawn: number; characters: number };
    }> => ipcRenderer.invoke('letters:render', letter, company, overwrite),
  },
  documents: {
    list: (): Promise<DocumentRecord[]> => ipcRenderer.invoke('documents:list'),
    import: (kind: DocumentRecord['kind']): Promise<DocumentRecord | null> =>
      ipcRenderer.invoke('documents:import', kind),
    save: (record: DocumentRecord): Promise<boolean> => ipcRenderer.invoke('documents:save', record),
    versions: (id: string): Promise<DocumentVersion[]> => ipcRenderer.invoke('documents:versions', id),
    replace: (id: string): Promise<DocumentRecord | null> => ipcRenderer.invoke('documents:replace', id),
    setDefault: (id: string, kind: DocumentRecord['kind']): Promise<boolean> =>
      ipcRenderer.invoke('documents:setDefault', id, kind),
    forget: (id: string): Promise<boolean> => ipcRenderer.invoke('documents:forget', id),
    reveal: (id: string): Promise<boolean> => ipcRenderer.invoke('documents:reveal', id),
    revealVersion: (documentId: string, versionId: string): Promise<boolean> =>
      ipcRenderer.invoke('documents:revealVersion', documentId, versionId),
  },
  interviews: {
    list: (): Promise<Interview[]> => ipcRenderer.invoke('interviews:list'),
    next: (): Promise<{ interview: Interview; opportunity: Opportunity } | null> =>
      ipcRenderer.invoke('interviews:next'),
    save: (interview: Interview): Promise<boolean> => ipcRenderer.invoke('interviews:save', interview),
    create: (opportunityId: string, at: string): Promise<Interview> =>
      ipcRenderer.invoke('interviews:create', opportunityId, at),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('interviews:delete', id),
  },
  calendar: {
    things: (): Promise<DatedThing[]> => ipcRenderer.invoke('calendar:things'),
  },
  search: {
    everything: (query: string): Promise<Found[]> => ipcRenderer.invoke('search:everything', query),
  },
  applications: {
    list: (): Promise<{
      opportunity: Opportunity; lastEvent: TimelineEvent | null; resume: DocumentRecord | null;
      resumeReplaced: boolean;
    }[]> => ipcRenderer.invoke('applications:list'),
    events: (opportunityId: string): Promise<TimelineEvent[]> =>
      ipcRenderer.invoke('applications:events', opportunityId),
    markSent: (opportunityId: string, detail: string | null, resumeId?: string | null): Promise<boolean> =>
      ipcRenderer.invoke('applications:markSent', opportunityId, detail, resumeId),
    addEvent: (opportunityId: string, kind: TimelineEvent['kind'], detail: string | null): Promise<boolean> =>
      ipcRenderer.invoke('applications:addEvent', opportunityId, kind, detail),
  },
};

contextBridge.exposeInMainWorld('cairn', api);

export type CairnApi = typeof api;
