/** Reading the vault as tables, and moving it in and out as a file.
 *  Pure on purpose: it reaches no database and no `electron`, so every rule here is testable. */

/** A page of a table, or the answer to a query. Columns are carried separately so an
 *  empty answer still knows its shape, which is what stops a grid rendering as nothing
 *  when a table is simply empty. */
export interface Grid {
  columns: string[];
  rows: (string | number | null)[][];
}

/** One table, as a sheet somebody can read and correct. */
export interface SheetRow {
  /** Every column, as text, so opening a row shows what the sheet held back. */
  values: Record<string, string>;
  /** The columns on this row that hold a fact rather than a structure. */
  editable: string[];
  /** How this row is found again. */
  where: Record<string, unknown>;
}

/** How much of the width each column deserves. */
export function columnWeights(columns: string[], rows: unknown[][]): Record<string, number> {
  const NARROWEST = 8;
  const WIDEST = 30;
  const weights: Record<string, number> = {};
  columns.forEach((name, index) => {
    const values = rows.map((row) => String(row[index] ?? ''));
    const lengths = values.map((value) => value.length).sort((a, b) => a - b);
    // The middle row rather than the longest: one outlier is what truncation is for.
    const middle = lengths.length === 0 ? 0 : lengths[Math.floor(lengths.length / 2)] ?? 0;
    const floor = Math.max(NARROWEST, name.length + 1);
    // An address is copied, never read, so width buys it nothing. Left to length alone
    // it wins the widest column in the table and takes that room off the company and
    // the role, which are the two anybody is actually scanning.
    const addresses = values.filter((value) => value.startsWith('http')).length;
    if (values.length > 0 && addresses * 2 >= values.length) weights[name] = floor;
    else weights[name] = Math.min(WIDEST, Math.max(floor, middle));
  });
  return weights;
}

export interface Sheet {
  columns: string[];
  /** The ones worth opening on: every column is a wall nobody reads. */
  shown: string[];
  key: string[];
  /** Roughly how many characters each shown column holds, for sharing the width. */
  weights: Record<string, number>;
  total: number;
  offset: number;
  rows: SheetRow[];
}

export interface Snapshot {
  /** What wrote it, so a file from somewhere else is refused rather than half-read. */
  cairn: 1;
  takenAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export class NotAQuery extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'NotAQuery';
  }
}

/** A value that holds a structure rather than a fact. */
export function isStructured(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[[{]/.test(value.trim());
}

/** Too wide for a cell. A different question from whether it holds a structure, and
 *  conflating the two hid the `value` column of the settings table because one setting
 *  is an empty list -- leaving a sheet of keys with no values against them. */
export function isWide(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 80;
}

/** How many columns a sheet opens on. Enough to recognise a row, few enough that
 *  nothing is off the right-hand edge -- which is the whole complaint. */
export const SHEET_COLUMNS = 7;

/** A machine wrote this, and a person reads past it. A full timestamp rather than a
 *  date: the day something is due is somebody's decision, the moment it was captured
 *  is not. */
export function isStamp(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.trim());
}

/** Copied, never read. A column of these is a column of `htt…`. */
export function isLink(value: unknown): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/** What a column is worth on a sheet somebody is scanning. Most of the column decides
 *  it, so one stray value never reclassifies the rest. */
function mostly(rows: unknown[][], index: number, is: (value: unknown) => boolean): boolean {
  if (rows.length === 0) return false;
  // More than half, not half. Settings holds one empty list among its words, and half
  // of two rows would have hidden the column saying what every setting is set to.
  return rows.filter((row) => is(row[index])).length * 2 > rows.length;
}

/** How much a column earns its place. 0 is never shown -- it cannot be edited, or it
 *  cannot be read, so a column of it costs width and returns nothing. */
function worth(columns: string[], rows: unknown[][], key: string[], name: string): number {
  const index = columns.indexOf(name);
  const generated = (value: unknown): boolean => /^[0-9a-f]{8,}[0-9a-f-]*$/i.test(String(value ?? ''));

  // A key nobody can read is a column nobody can use: `opportunity.id` is a UUID,
  // `settings.key` is "accent". It judges the shape rather than the length.
  if (key.includes(name) && rows.length > 0 && rows.every((row) => generated(row[index]))) return 0;
  // Shown when a row is opened and never editable, so a column of `{"m…` says nothing.
  if (mostly(rows, index, isStructured)) return 0;
  if (mostly(rows, index, isLink)) return 0;
  // Most of the column, not one cell of it. Settings keeps the last harvest as a blob
  // and everything else as a word, and one long row hid the column that says what
  // every other setting is set to. A stray long value simply truncates.
  if (mostly(rows, index, isWide)) return 0;

  if (mostly(rows, index, isStamp)) return 1;
  // What tells one row from another. A column with one value in it is a fact about the
  // table rather than about any row in it.
  const distinct = new Set(rows.map((row) => String(row[index] ?? ''))).size;
  return rows.length > 1 && distinct === 1 ? 2 : 3;
}

/** Which columns a sheet shows: what is worth reading, in the table's own order. */
export function columnsToShow(columns: string[], rows: unknown[][], key: string[] = []): string[] {
  const scored = columns.map((name) => ({ name, worth: worth(columns, rows, key, name) }));
  const wanted = scored.filter((one) => one.worth > 0);

  // A table whose every column is held back would show as nothing at all, which reads
  // as an empty table rather than one whose columns are all links and structures.
  if (wanted.length === 0) return columns.slice(0, SHEET_COLUMNS);

  const named = (rank: number): string[] =>
    wanted.filter((one) => one.worth === rank).map((one) => one.name);

  // A timestamp shows only when nothing else would. A machine wrote it, nobody scans
  // it, and beside a company and a role it is width spent on nothing -- but a table of
  // hashes and dates is entirely dates, and a sheet of nothing at all is worse.
  const better = [...named(3), ...named(2)];
  const room = better.length > 0 ? better : named(1);
  const chosen = new Set(room.slice(0, SHEET_COLUMNS));
  return columns.filter((name) => chosen.has(name));
}

/** A cell as a person would read it. A JSON column is one long unquoted line
 *  otherwise, and a null shows as an empty cell that cannot be told from an empty
 *  string -- which for a pay figure is the difference between "none" and "zero". */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  return String(value);
}

/** RFC 4180: quote anything carrying a comma, a quote or a newline, and double the
 *  quotes inside. A posting description holds all three. */
export function toCsv(grid: Grid): string {
  const escape = (value: string | number | null): string => {
    const text = value === null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [grid.columns, ...grid.rows]
    .map((row) => row.map(escape).join(','))
    .join('\n');
}

/** Refused whole rather than half-read: a file that is not a Cairn export, read row by
 *  row until it fails, leaves a vault holding some of somebody else's data and no way
 *  to tell which. */
export function readSnapshot(body: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new NotAQuery('That is not a JSON file.');
  }
  const root = (parsed !== null && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  if (root['cairn'] !== 1) {
    throw new NotAQuery('That is not a Cairn export — it does not say it was written by one.');
  }
  const tables = root['tables'];
  if (tables === null || typeof tables !== 'object' || Array.isArray(tables)) {
    throw new NotAQuery('That export has no tables in it.');
  }
  for (const [name, rows] of Object.entries(tables as Record<string, unknown>)) {
    if (!Array.isArray(rows)) throw new NotAQuery(`The ${name} table in that file is not a list of rows.`);
  }
  return {
    cairn: 1,
    takenAt: typeof root['takenAt'] === 'string' ? root['takenAt'] : new Date().toISOString(),
    tables: tables as Record<string, Record<string, unknown>[]>,
  };
}

/** A spreadsheet of roles somebody kept before Cairn, as rows Cairn can read. */
export interface RoleRow {
  company: string;
  role: string;
  url: string | null;
  location: string | null;
  notes: string | null;
}

/** What a CSV of roles turned into, and what it could not be asked about. */
export interface RoleImport {
  rows: RoleRow[];
  /** Headers nothing was read out of, so the screen can say what was left behind. */
  ignored: string[];
  /** Rows with no company or no role, counted rather than guessed at. */
  incomplete: number;
}

/** RFC 4180 the other way: a quoted field may hold commas, newlines and doubled
 *  quotes, and a bare one ends at the next comma. */
export function readCsv(body: string): Grid {
  // A spreadsheet exported on Windows opens with a byte-order mark, which would
  // otherwise become part of the first column's name and match no heading.
  const text = body.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = (): void => { row.push(field); field = ''; started = false; };
  const endRow = (): void => { endField(); rows.push(row); row = []; };

  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at];
    if (quoted) {
      if (ch === '"' && text[at + 1] === '"') { field += '"'; at += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { endRow(); continue; }
    field += ch; started = true;
  }
  if (field !== '' || row.length > 0) endRow();

  const header = rows.shift();
  if (header === undefined || header.every((name) => name.trim() === '')) {
    throw new NotAQuery('That file has no header row, so there is no way to tell what its columns are.');
  }
  const columns = header.map((name) => name.trim());
  // Short rows are filled rather than refused: a spreadsheet drops trailing empty
  // cells, and refusing those would refuse most real exports.
  return {
    columns,
    rows: rows
      .filter((one) => one.some((value) => value.trim() !== ''))
      .map((one) => columns.map((_, at) => one[at] ?? '')),
  };
}

/** Which spelling of a heading means which field. A spreadsheet somebody kept for
 *  months has whatever headings they typed, and this is the shortlist that covers it. */
const ROLE_HEADINGS: Record<keyof RoleRow, string[]> = {
  company: ['company', 'employer', 'organisation', 'organization', 'firm'],
  role: ['role', 'title', 'position', 'job', 'job title'],
  url: ['url', 'link', 'posting', 'listing', 'address'],
  location: ['location', 'place', 'city', 'where'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

/** Read a spreadsheet of roles, refusing the whole file rather than half of it.
 *  A file with no company column is somebody's other spreadsheet, and importing part
 *  of it leaves a pipeline nobody can trust. */
export function rolesFromCsv(grid: Grid): RoleImport {
  const headings = grid.columns.map((name) => name.trim().toLowerCase());
  const indexOf = (field: keyof RoleRow): number =>
    headings.findIndex((name) => ROLE_HEADINGS[field].includes(name));

  const company = indexOf('company');
  const role = indexOf('role');
  if (company === -1 || role === -1) {
    const missing = [company === -1 ? 'company' : null, role === -1 ? 'role' : null].filter(Boolean);
    throw new NotAQuery(
      `That file has no ${missing.join(' and no ')} column, so there is nothing to track. ` +
      `Its columns are ${grid.columns.join(', ')}.`,
    );
  }

  const at: Record<keyof RoleRow, number> = {
    company, role, url: indexOf('url'), location: indexOf('location'), notes: indexOf('notes'),
  };
  const used = new Set(Object.values(at).filter((one) => one !== -1));
  const text = (row: (string | number | null)[], index: number): string =>
    index === -1 ? '' : String(row[index] ?? '').trim();

  const rows: RoleRow[] = [];
  let incomplete = 0;
  for (const row of grid.rows) {
    const one: RoleRow = {
      company: text(row, at.company),
      role: text(row, at.role),
      url: text(row, at.url) || null,
      location: text(row, at.location) || null,
      notes: text(row, at.notes) || null,
    };
    if (one.company === '' || one.role === '') { incomplete += 1; continue; }
    rows.push(one);
  }

  return {
    rows,
    ignored: grid.columns.filter((_, index) => !used.has(index)),
    incomplete,
  };
}
