/** The shapes the main and renderer processes agree on. */

export type Stage = 'considering' | 'preparing' | 'applied' | 'interviewing' | 'decision';

export const STAGES: readonly Stage[] = [
  'considering', 'preparing', 'applied', 'interviewing', 'decision',
] as const;

/** Where a figure came from, which decides how much it is allowed to rank.
 *  An employer's own board is a fact. A republished copy is a claim, and claims
 *  have been wrong by tens of thousands at the ceiling. */
export type Provenance = 'first-party' | 'aggregated' | 'stated-by-you';

export interface Money {
  min: number | null;
  max: number | null;
  currency: string;
  period: 'year' | 'month' | 'hour';
  provenance: Provenance;
  /** The sentence the figure was read out of, so a person can disagree with the parse. */
  evidence: string | null;
}

/** The six questions asked before an application goes out, in the order they are asked.
 *  Every one of them is about the posting except the last, which is about us. */
export const GATE_QUESTIONS = [
  { id: 'letter', ask: 'Cover letter — required, and through what?' },
  { id: 'name', ask: 'What must be named in writing?' },
  { id: 'lead', ask: 'What leads?' },
  { id: 'route', ask: 'Route and liveness verified?' },
  { id: 'form', ask: 'What does the form demand — and have you opened it?' },
  { id: 'employer', ask: 'Do we already have something live at this employer?' },
] as const;

export type GateQuestionId = typeof GATE_QUESTIONS[number]['id'];

export interface GateAnswer {
  id: GateQuestionId;
  /** What was decided, in words. */
  answer: string | null;
  /** Whether it is answered, or merely described. A gate that says "there is a culture
   *  question" instead of answering it reads as done because it is accurate. */
  settled: boolean;
}

/** One box on the apply form, as the form has it. Question five is the only one of the
 *  six that cannot be answered in a sentence: a form has fields, and each of them either
 *  has something waiting in it or does not. */
export interface GateField {
  /** What the form calls it, in the form's own words. */
  label: string;
  required: boolean;
  /** What goes in it. Empty on a required field is what keeps a gate `partial`. */
  answer: string | null;
  /** The employer asked for the applicant's own words. What is written here is raw
   *  material for them rather than prose to paste, and no assistant drafts it. */
  ownWords: boolean;
}

/** Two of these are declarations rather than readings of the answers.
 *  `blocked` means the gate cannot be run at all -- no route, no named employer, no
 *  live requisition -- which is a different failure from nobody having started.
 *  `retrofitted` means it went out before there was a gate to run. */
export type GateState = 'not-run' | 'blocked' | 'partial' | 'run' | 'retrofitted';

export type GateDeclaration = 'blocked' | 'retrofitted';

export interface Gate {
  answers: GateAnswer[];
  /** What the form demands, one entry per box, in the form's own order. */
  fields?: GateField[];
  /** Set by a person, and it outranks whatever the answers add up to. */
  declared?: GateDeclaration | null;
}

/** Required boxes with nothing waiting in them. Observing a field is not answering it:
 *  a gate recording "there is a culture question" and drafting no answer reads as done,
 *  because the description is accurate. */
export function undrafted(gate: Gate | null): GateField[] {
  return (gate?.fields ?? []).filter((f) => f.required && (f.answer ?? '').trim() === '');
}

/** A gate is run when every question is settled and every required box has an answer,
 *  partial once any of it has been touched. A declaration outranks all of that. */
export function gateState(gate: Gate | null): GateState {
  if (gate === null) return 'not-run';
  if (gate.declared === 'blocked' || gate.declared === 'retrofitted') return gate.declared;
  const answers = gate.answers ?? [];
  const fields = gate.fields ?? [];
  const touched = answers.filter((a) => a.settled || (a.answer ?? '').trim() !== '');
  if (touched.length === 0 && fields.length === 0) return 'not-run';
  const allSettled = answers.length === GATE_QUESTIONS.length && answers.every((a) => a.settled);
  return allSettled && undrafted(gate).length === 0 ? 'run' : 'partial';
}

/** How a follow-up physically travels. Ranked by how likely each is to exist, which is
 *  not the same as how well it works -- a referral is rarest and strongest. */
export const CHANNELS = [
  'contact-email', 'contact-linkedin', 'ats-reply', 'referral', 'careers-inbox', 'none-found',
] as const;
export type Channel = typeof CHANNELS[number];

/** Owed means a gap had to be named and the form gave it nowhere to go. It is not the
 *  same as never having decided, which is the field being absent. */
export type Concession = 'owed' | 'delivered';

export interface Opportunity {
  id: string;
  company: string;
  role: string;
  url: string | null;
  location: string | null;
  remote: 'remote' | 'hybrid' | 'onsite' | 'unstated';
  pay: Money | null;
  stage: Stage;
  /** Set by a person, never by a screen. Null means nobody has decided yet. */
  fit: 'strong' | 'possible' | 'weak' | null;
  family: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  postedAt: string | null;
  capturedAt: string;
  /** When it went out. An application is an opportunity that has been sent, rather
   *  than a second record of the same role -- two rows for one thing eventually
   *  disagree about which stage it is at. */
  appliedAt: string | null;
  /** The file that actually went, as it was named in the vault. Replacing a résumé
   *  afterwards must not change the answer to what was sent. */
  resumeFile: string | null;
  /** Which résumé went with it. Recorded at the moment of sending, because six weeks
   *  later "which one did they get" is unanswerable and it is the first thing an
   *  interviewer asks about. */
  resumeId: string | null;
  archivedAt: string | null;
  notes: string | null;
  /** The six questions, as far as they have been answered. */
  gate: Gate | null;
  /** One named thing outstanding on an otherwise-clear gate. Cleared by prefixing
   *  CLEARED rather than by deleting it: how it was resolved is the reusable part. */
  blocker: string | null;
  /** A gap that had to be named, on a form with nowhere to name it. */
  concession: Concession | null;
  /** The posting itself, as text. Kept when a lead is taken, because the link goes
   *  dead when the requisition fills and what it said goes with it. */
  posting: string | null;
  /** What the screens read on the way in, kept with the role. The reading is the work;
   *  the posting is only the evidence it was read out of. */
  screening: Screening | null;
  /** Who a follow-up goes to. A title without a name is not a contact. */
  contact: string | null;
  /** How it travels. `none-found` is a decision; absent means nobody has looked. */
  followupChannel: Channel | null;
}

/** The answer to question six, which is the only gate question about us. Live and
 *  declined are different facts: one says wait behind it, the other says they have
 *  already said no and a reapply this week reads as not having heard. */
export interface AtEmployer {
  live: Opportunity[];
  declined: { role: string; at: string }[];
}

export type EventKind =
  | 'applied' | 'reply' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'note';

export interface TimelineEvent {
  id: string;
  opportunityId: string | null;
  at: string;
  kind: EventKind;
  detail: string | null;
}

/** One screen's answer. A screen reports; it never decides. */
export interface Verdict {
  check: string;
  outcome: 'pass' | 'fail' | 'unknown' | 'ask';
  /** Why, in a sentence a person can act on. Never a code. */
  because: string;
  /** The text the answer was read out of, quoted rather than summarised. */
  evidence?: string;
}

export interface Screening {
  verdicts: Verdict[];
  /** True only when every hard screen passed. Soft screens never block. */
  clears: boolean;
  /** The questions deliberately left for a person: fit, family, location, specialty. */
  open: string[];
}

export interface Profile {
  displayName: string;
  locations: string[];
  remoteOnly: boolean;
  currency: string;
  /** Below this a role is dead on arithmetic. Null until the user sets it. */
  payFloor: number | null;
  /** Between the floor and this, a role survives but is flagged. */
  payTarget: number | null;
  skills: string[];
  families: string[];
  workAuthorisation: string | null;
  needsSponsorship: boolean | null;
}

export interface Settings {
  maxPostingAgeDays: number;
  requireFirstPartyPay: boolean;
  excludedEmployers: string[];
  harvestCadenceHours: number | null;
  requestDelayMs: number;
  sequentialFetch: boolean;
  identifyAs: 'cairn' | 'generic' | 'nothing';
  keepDroppedHashes: boolean;
  theme: 'system' | 'light' | 'dark';
  accent: 'pine' | 'slate' | 'mulberry' | 'olive';
  density: 'comfortable' | 'compact';
  /** How many roles a stage shows at once. Ten is a screenful; a hundred is as far as
   *  this goes, because past that the page is the problem rather than the page size. */
  pipelinePageSize: 10 | 20 | 50 | 100;
  /** A list reads down one column, a grid reads across, and a board shows every stage
   *  at once with the columns you can move a role between. */
  pipelineLayout: 'list' | 'grid' | 'board';
  /** The same choice for every other list. Kept apart from the pipeline's, or choosing
   *  the board there quietly put the other three back to a list. */
  listLayout: 'list' | 'grid';
  textSize: 'small' | 'default' | 'large';
  weekStartsOn: 'monday' | 'sunday';
  lockAfterMinutes: number | null;
  /** Days of silence after which Cairn suggests chasing. It creates a next action
   *  and sends nothing -- an application that goes quiet is the commonest way one
   *  ends, and nobody remembers which week it was. */
  chaseAfterDays: number | null;
  /** What the last harvest did, kept so the question survives the window closing. */
  /** Hide employers and every figure, for a shared screen. Kept in the vault rather
   *  than in the window, so it survives a lock and is still on when you come back. */
  screenShare: boolean;
  /** What happens to a file you add: copied into the vault, or left where it is and
   *  pointed at. Copying is the default because it is the only one that keeps. */
  documentsHeld: 'copied' | 'linked';
  /** One notice a day about what is due, or none. Off until somebody asks for it,
   *  like everything else that acts on its own. */
  notify: boolean;
  /** Minutes from midnight. Equal values mean no quiet hours. */
  quietFrom: number;
  quietTo: number;
  /** Your own word for a stage. Absent means Cairn's. The five stages themselves are
   *  fixed: three of them carry behaviour rather than a name -- reaching Applied records
   *  a date and starts the clock on the silence. */
  /** Which language the interface is in. A code Cairn ships, or one you dropped in
   *  your own vault. Anything a catalogue does not carry shows in English. */
  language: string;
  stageLabels: Partial<Record<Stage, string>>;
  /** Which of the five stage colours a stage borrows. Kept to the palette rather than a
   *  free colour, so a renamed pipeline still looks like the rest of the app. */
  stageColours: Partial<Record<Stage, Stage>>;
  lastHarvest: HarvestSummary | null;
  /** When everything was last written out as a file. The status bar said "No backup
   *  yet" for the life of the app because nothing could ever set this. */
  lastBackupAt: string | null;
}

/** One run, in figures. Every posting read is either kept or set aside for exactly
 *  one reason, so `read` equals `kept` plus the total of `setAside` -- which is what
 *  makes the numbers on the screen checkable rather than merely plausible. */
export interface HarvestSummary {
  ranAt: string;
  searches: number;
  read: number;
  kept: number;
  setAside: Record<string, number>;
  failed: number;
}

export interface SourceDef {
  id: string;
  label: string;
  kind: 'ats' | 'aggregator';
  /** An employer's own board is first-party; a republished index is not. */
  provenance: Provenance;
  docs: string;
  enabled: boolean;
  note: string;
}

/** Every outbound request, recorded. The status bar counts these and the
 *  privacy panel lists them; nothing may fetch around this. */
export interface OutboundRecord {
  id: string;
  at: string;
  host: string;
  reason: string;
  ok: boolean;
  bytes: number;
}

/** A lead that has not been judged. Kept apart from `Opportunity` on purpose: mixing
 *  unscreened rows into the pipeline makes the pipeline untrustworthy within a week. */
export interface Requisition {
  id: string;
  company: string;
  role: string;
  url: string | null;
  /** The posting as it arrived, so a screen can be re-run after a rule is fixed
   *  without fetching it again. */
  raw: string;
  sourceId: string;
  capturedAt: string;
  /** What the screening layer read, kept on the row so the band is on the card rather
   *  than buried in a verdict. It is the most decisive fact about a posting. */
  pay: Money | null;
  /** What the posting says about being in an office, read once on the way in. */
  remote: Opportunity['remote'];
  screening: Screening;
  state: 'waiting' | 'kept' | 'dropped';
}

export function titleMatched(requisition: Requisition): boolean {
  return requisition.screening.verdicts.some((v) => v.check === 'title' && v.outcome === 'pass');
}

export interface BoardRegistration {
  sourceId: string;
  token: string;
  company: string;
  addedAt: string;
}

export interface SourceState {
  id: string;
  enabled: boolean;
  lastRun: string | null;
  lastError: string | null;
  boards: number;
}

/** A scheduled conversation. Kept apart from the timeline: an event says something
 *  happened, and this says something is going to, which is a different question and
 *  the only one that can still be prepared for. */
export interface Interview {
  id: string;
  opportunityId: string;
  at: string;
  minutes: number;
  round: string;
  /** Who you are meeting, and whatever you know about them. */
  people: string;
  /** Where it happens. A link opens in the user's own browser, never in Cairn. */
  joinUrl: string | null;
  notes: string;
  /** Questions to ask them. Written before the day, because nobody thinks of a good
   *  one on the spot. */
  questions: string;
  /** Ticked off as they are done. Struck through rather than removed, so the list
   *  still reads as what you decided to do. */
  prepared: string[];
  outcome: 'scheduled' | 'done' | 'cancelled';
}

/** Anything with a date, from whichever table it came from. The calendar reads these
 *  rather than each source separately, so a new kind of dated thing appears there
 *  without the calendar learning about it. */
export interface DatedThing {
  at: string;
  kind: 'interview' | 'deadline' | 'action' | 'sent';
  title: string;
  detail: string | null;
  opportunityId: string | null;
  /** Which stage colour it takes, when it belongs to a role. */
  stage: Stage | null;
}

export interface AnswerBankEntry {
  id: string;
  question: string;
  answer: string;
  /** Which of the recognised questions this answers, when it is one of them. A
   *  question you wrote yourself has none, and is matched on wording instead. */
  intent: string | null;
  kind: 'choice' | 'short' | 'long';
  /** How many forms this has been reused on. The only thing here that compounds. */
  usedCount: number;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  kind: 'resume' | 'cover-letter' | 'note';
  title: string;
  /** Always relative to the vault. An absolute path is never stored and never shown. */
  relativePath: string;
  /** Whether the file is in the vault or somewhere else on the disk. A linked file is
   *  not encrypted, is not in an export, and is gone the moment somebody moves it. */
  held: 'copied' | 'linked';
  /** What the file is, so the interface can say whether Cairn can read it. */
  format: 'pdf' | 'markdown' | 'docx' | 'other';
  /** The one attached when you start an application, unless you pick another. */
  isDefault: boolean;
  /** A note to yourself about when to use this one. Two résumés with no note is two
   *  files nobody can tell apart in six weeks. */
  note: string;
  usedCount: number;
  updatedAt: string;
}

export interface VaultStatus {
  unlocked: boolean;
  /** Absent until a vault exists, which is the whole first-run condition. */
  exists: boolean;
  sizeBytes: number;
  cipher: string;
  kdf: { algorithm: string; memoryKib: number; passes: number; lanes: number } | null;
  outboundToday: number;
  lastBackupAt: string | null;
  machineName: string;
  /** What you told Cairn to call you. It stands under the app's name, and the machine
   *  name is what shows when you have not said. */
  displayName: string;
  /** Which encrypted format wrote the vault, and the newest this build reads. When the
   *  first is behind the second the vault cannot be opened, and saying so before
   *  somebody types is better than letting them fail and blame their passphrase. */
  format: { onDisk: number | null; readable: number };
}

/** What Starting over did. Three outcomes rather than a name or null, because
 *  "you cancelled" and "there was nothing there" need different things said. */
export type StartOverResult =
  | { outcome: 'moved'; to: string }
  | { outcome: 'cancelled' }
  | { outcome: 'nothing-to-move' };

/** What erasing everything actually removed, so the app can say it rather than claim it. */
export interface Erased {
  vaults: number;
  dumps: boolean;
  logs: boolean;
}

/** What a look for a newer Cairn found. `newer` is the tag when there is one, and null
 *  when there is not — including when the published tag is not one Cairn can compare. */
export interface UpdateCheck {
  running: string;
  published: string;
  newer: string | null;
}

/** A file a document used to be, kept when it was replaced. */
export interface DocumentVersion {
  id: string;
  documentId: string;
  relativePath: string;
  format: DocumentRecord['format'];
  bytes: number;
  replacedAt: string;
}

/** What kind of protocol a provider speaks. Two cover the market: Anthropic's own,
 *  and the chat-completions shape that OpenAI, Gemini, Mistral and Ollama all offer. */
export type AssistantKind = 'anthropic' | 'openai-compatible';

/** The four jobs the assistant does. Each is asked for by a person, one at a time. */
export type AssistantTask = 'read-posting' | 'draft-letter' | 'suggest-answer' | 'research';

export const ASSISTANT_TASKS: readonly AssistantTask[] = [
  'read-posting', 'draft-letter', 'suggest-answer', 'research',
] as const;

/** Whichever provider you brought. The key is never in here in clear -- `keyHeld` says
 *  only whether there is one, so this shape can cross to the interface unredacted. */
export interface AssistantProvider {
  id: string;
  kind: AssistantKind;
  /** Where requests go. The host of this is what the privacy panel names. */
  base: string;
  model: string;
  keyHeld: boolean;
  effort: 'low' | 'medium' | 'high';
  /** The tasks allowed to send without showing you first. Empty is the default, and
   *  everything else on this screen arrives off for the same reason. */
  quiet: AssistantTask[];
  addedAt: string;
}

/** One request to a provider, in figures, kept beside the outbound list it also
 *  appears in. What was asked is recorded; what you sent is not stored twice. */
export interface AssistantRun {
  id: string;
  at: string;
  task: AssistantTask;
  providerId: string;
  model: string;
  host: string;
  bytesOut: number;
  bytesIn: number;
  tokensIn: number;
  tokensOut: number;
  /** In the provider's own currency, from a price table that carries its date.
   *  Null when nothing here has a published price. */
  costEstimate: number | null;
  outcome: 'done' | 'length' | 'refused' | 'error';
  /** The role or lead it was about, in words, so the log reads without a join. */
  about: string | null;
}

/** A source the provider returned, quoted. Nothing without one survives the guard. */
export interface AssistantCitation {
  url: string;
  title: string;
  quoted: string;
}

/** What one run produced. Every field is present, empty where the task does not use
 *  it, so the interface reads what it needs without a discriminator on every branch. */
export interface AssistantResult {
  task: AssistantTask;
  run: AssistantRun;
  /** Reading a posting: what survived the quote guard, and what did not. */
  verdicts: Verdict[];
  pay: Money | null;
  dropped: string[];
  /** A draft, a suggestion or a research note, and the sentences worth checking. */
  text: string;
  check: string[];
  citations: AssistantCitation[];
  /** Sentences that named no source, which refuse the whole note rather than half of it. */
  refused: string[];
}

/** Cairn's own word for each stage, and what a person's own word replaces. */
export const STAGE_NAMES: Record<Stage, string> = {
  considering: 'Considering', preparing: 'Preparing', applied: 'Applied',
  interviewing: 'Interviewing', decision: 'Decision',
};

/** What a stage is called here, which is yours to change. */
export function stageName(stage: Stage, settings: { stageLabels: Partial<Record<Stage, string>> }): string {
  const yours = settings.stageLabels[stage]?.trim();
  return yours === undefined || yours === '' ? STAGE_NAMES[stage] : yours;
}
