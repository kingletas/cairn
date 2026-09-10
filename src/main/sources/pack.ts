/** Job feeds described in a file rather than written in code. */

import type { Money, Provenance } from '../../shared/types.js';
import { asArray, isoDate, parseJson, str, type RawLead, type SourceAdapter } from './types.js';

export interface FieldMap {
  company: string;
  role: string;
  url?: string;
  description?: string;
  location?: string;
  postedAt?: string;
  /** A boolean field saying the role is remote, used only when there is no location. */
  remoteFlag?: string;
  payMin?: string;
  payMax?: string;
  /** Where the feed says the figure came from. Without this a range is not read at
   *  all: a listing site's own estimate and an employer's published band arrive in
   *  the same two fields, and one of them is worth nothing. Either a boolean flag or
   *  a word; a word the feed uses for its own guess reads as no. */
  payDisclosure?: string;
  /** Fields appended to the description, each under a label, so the pay parser and a
   *  person reading the posting later both see them. Some feeds keep the salary in a
   *  free-text field of its own -- "competitive", "80k OTE" -- and a figure with no
   *  word in front of it is a number nobody can place. */
  extraText?: { label: string; path: string }[];
}

export interface SourceDefinition {
  id: string;
  label: string;
  kind: 'ats' | 'aggregator';
  provenance: Provenance;
  docs: string;
  /** `{query}` is replaced by the search term, url-encoded. A searchless feed has no
   *  placeholder because it takes no term. */
  endpoint: string;
  /** Where the list of jobs sits in the response. Omitted when the response is itself
   *  a list. */
  list?: string;
  fields: FieldMap;
  searchless?: boolean;
  note?: string;
}

export interface SourcePack {
  note?: string;
  sources: SourceDefinition[];
}

/** Why a pack was refused, in a sentence naming the file and the source. A pack that
 *  half-loads is worse than one that does not load: the missing feed looks like a feed
 *  with nothing new, which is what a healthy run looks like. */
export class PackRejected extends Error {
  constructor(where: string, detail: string) {
    super(`${where}: ${detail}`);
    this.name = 'PackRejected';
  }
}

const record = (value: unknown): Record<string, unknown> =>
  (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>;

/** `company.name`, `location.name`, or a plain key. A dotted path is what lets a field
 *  map reach a nested field without a line of code per feed. */
function at(source: Record<string, unknown>, path: string): unknown {
  let value: unknown = source;
  for (const step of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[step];
  }
  return value;
}

function text(source: Record<string, unknown>, path: string | undefined): string | null {
  return path === undefined ? null : str(at(source, path));
}

/** Words a feed uses for a figure it worked out itself. Anything not on this list and
 *  not empty is taken as the employer's, because a feed that bothers to carry a
 *  disclosure field has its own vocabulary for the good case. */
const NOT_DISCLOSED = new Set(['', 'inferred', 'estimate', 'estimated', 'guess', 'no', 'false', 'none']);

/** Whether the feed says the employer published this figure, with unknown counting as
 *  no. A boolean flag and a word are both common, so both are read.
 */
function disclosed(job: Record<string, unknown>, path: string | undefined): boolean {
  if (path === undefined) return false;
  const raw = at(job, path);
  if (typeof raw === 'boolean') return raw;
  return !NOT_DISCLOSED.has((str(raw) ?? '').toLowerCase());
}

function money(job: Record<string, unknown>, fields: FieldMap, provenance: Provenance): Money | null {
  if (fields.payMin === undefined && fields.payMax === undefined) return null;

  // An estimate the listing site worked out itself is not a band, it is a guess
  // wearing one -- and it has been out by tens of thousands at the ceiling, which is
  // the end that decides whether a role is worth reading at all.
  if (!disclosed(job, fields.payDisclosure)) return null;

  const number = (path: string | undefined): number | null => {
    const raw = path === undefined ? undefined : at(job, path);
    return typeof raw === 'number' && raw > 0 ? Math.round(raw) : null;
  };
  const min = number(fields.payMin);
  const max = number(fields.payMax);
  if (min === null && max === null) return null;

  return {
    min, max, currency: 'USD', period: 'year', provenance,
    evidence: provenance === 'first-party'
      ? 'Stated by the employer on their own job board.'
      : 'Republished by a listing site, which says the employer posted it.',
  };
}

const HTTPS_URL = /^https:\/\/[^\s{}]+/;

/** Read once, refused loudly, and never half-accepted. */
export function readPack(where: string, body: string): SourceDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new PackRejected(where, 'this is not a JSON file');
  }
  const root = record(parsed);
  if (!Array.isArray(root['sources'])) {
    throw new PackRejected(where, 'there is no `sources` list in it');
  }
  return root['sources'].map((entry, index) => definition(where, entry, index));
}

function definition(where: string, entry: unknown, index: number): SourceDefinition {
  const raw = record(entry);
  const id = str(raw['id']);
  const named = id ?? `source ${index + 1}`;
  if (id === null || !/^[a-z][a-z0-9-]{1,39}$/.test(id)) {
    throw new PackRejected(where, `${named} needs an id of lowercase letters, digits and dashes`);
  }

  const kind = str(raw['kind']);
  if (kind !== 'ats' && kind !== 'aggregator') {
    throw new PackRejected(where, `${named} must say whether it is an "ats" or an "aggregator"`);
  }
  // Not a field a pack gets to choose. An employer's own board is first-party and a
  // republished index is not, and letting a file claim otherwise would let an imported
  // pack promote its own guesses past every screen that trusts the distinction.
  const provenance: Provenance = kind === 'ats' ? 'first-party' : 'aggregated';

  const endpoint = str(raw['endpoint']);
  if (endpoint === null || !HTTPS_URL.test(endpoint)) {
    throw new PackRejected(where, `${named} needs an https endpoint`);
  }
  const searchless = raw['searchless'] === true;
  if (!searchless && !endpoint.includes('{query}')) {
    throw new PackRejected(where,
      `${named} has no {query} in its endpoint, so it would fetch the same page for every search — mark it "searchless": true if that is what it does`);
  }

  const fieldMap = record(raw['fields']);
  const company = str(fieldMap['company']);
  const role = str(fieldMap['role']);
  if (company === null || role === null) {
    throw new PackRejected(where, `${named} must say which fields hold the company and the role`);
  }

  const fields: FieldMap = { company, role };
  for (const key of ['url', 'description', 'location', 'postedAt', 'remoteFlag', 'payMin', 'payMax', 'payDisclosure'] as const) {
    const value = str(fieldMap[key]);
    if (value !== null) fields[key] = value;
  }
  const extra = record(fieldMap['extraText']);
  const labelled = Object.entries(extra)
    .flatMap(([label, path]) => {
      const from = str(path);
      return from === null ? [] : [{ label, path: from }];
    });
  if (labelled.length > 0) fields.extraText = labelled;

  const definition: SourceDefinition = {
    id, label: str(raw['label']) ?? id, kind, provenance,
    docs: str(raw['docs']) ?? '', endpoint, fields,
  };
  const list = str(raw['list']);
  if (list !== null) definition.list = list;
  if (searchless) definition.searchless = true;
  const note = str(raw['note']);
  if (note !== null) definition.note = note;
  return definition;
}

/** Turn a definition into the same thing a hand-written adapter is, so nothing
 *  downstream can tell which of the two it is holding. */
export function adapterFor(definition: SourceDefinition): SourceAdapter {
  const { id, fields } = definition;
  const adapter: SourceAdapter = {
    id,
    label: definition.label,
    kind: definition.kind,
    provenance: definition.provenance,
    docs: definition.docs,
    note: definition.note ?? '',
    endpoint: (query) => definition.endpoint.replace('{query}', encodeURIComponent(query)),
    parse(body: string): RawLead[] {
      const parsed = parseJson(id, body);
      const rows = definition.list === undefined
        ? asArray(id, parsed, 'the response')
        : asArray(id, at(record(parsed), definition.list), definition.list);

      return rows.map(record).map((job): RawLead => {
        const extra = (fields.extraText ?? [])
          .map(({ label, path }) => {
            const value = text(job, path);
            return value === null ? null : `${label}: ${value}`;
          })
          .filter((one): one is string => one !== null)
          .join('\n');
        const remote = fields.remoteFlag !== undefined && at(job, fields.remoteFlag) === true;
        const description = text(job, fields.description) ?? '';
        return {
          company: text(job, fields.company) ?? 'Unnamed company',
          role: text(job, fields.role) ?? 'Untitled role',
          url: text(job, fields.url),
          html: extra === '' ? description : `${description}\n${extra}`,
          location: text(job, fields.location) ?? (remote ? 'Remote' : null),
          postedAt: isoDate(fields.postedAt === undefined ? null : at(job, fields.postedAt)),
          statedPay: money(job, fields, definition.provenance),
        };
      });
    },
  };
  if (definition.searchless === true) adapter.searchless = true;
  return adapter;
}
