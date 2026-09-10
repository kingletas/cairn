/** What every job source has to provide. */

import type { Money, Provenance } from '../../shared/types.js';

export interface RawLead {
  company: string;
  role: string;
  url: string | null;
  /** The description as the source gave it, markup and all. */
  html: string;
  location: string | null;
  postedAt: string | null;
  /** Only when the source states one as a field. A figure read out of prose is the
   *  screening layer's job, and the two must not be confused. */
  statedPay: Money | null;
}

export interface SourceAdapter {
  id: string;
  label: string;
  kind: 'ats' | 'aggregator';
  provenance: Provenance;
  /** Where the feed documents itself, so a person can check what Cairn is reading. */
  docs: string;
  /** What this feed is good for and where it is weak, in a sentence or two. Shown on
   *  the Sources screen beside the switch, because that is where somebody decides. */
  note: string;
  /** Where to fetch from. `token` is an employer board id for an ATS, a search term
   *  for an aggregator. */
  endpoint(token: string): string;
  /** Set when the source has no search parameter and hands back one undifferentiated
   *  list. Such a source is fetched once a run rather than once per search term --
   *  the same list six times is six requests for one answer, and this app counts
   *  every request it makes. */
  searchless?: true;
  /** Turn a response body into leads. Throws on a shape it does not recognise --
   *  returning nothing would look exactly like an employer with no openings. */
  parse(body: string, token: string): RawLead[];
  /** Some sources give a list too thin to screen and need a second fetch per row. */
  detailEndpoint?: (lead: RawLead) => string | null;
}

/** A board token goes into a URL path, so it is validated rather than escaped.
 *  Escaping turns `../` into `%2F..%2F`, which is not a separator here but is one to
 *  a server that decodes before it routes. Refusing the shape outright has no such
 *  argument to lose. */
const BOARD_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

export function boardToken(source: string, token: string): string {
  if (!BOARD_TOKEN.test(token) || token.includes('..')) {
    throw new SourceShapeChanged(source, `"${token}" is not a board name`);
  }
  return token;
}

export class SourceShapeChanged extends Error {
  constructor(source: string, detail: string) {
    super(`${source} returned something this version does not recognise: ${detail}`);
    this.name = 'SourceShapeChanged';
  }
}

/** JSON parsing that says which source broke rather than throwing a bare SyntaxError
 *  from somewhere in a stack of six. */
export function parseJson(source: string, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    const opening = body.slice(0, 60).replace(/\s+/g, ' ');
    throw new SourceShapeChanged(source, `the response is not JSON (starts "${opening}")`);
  }
}

export function asArray(source: string, value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new SourceShapeChanged(source, `${where} is not a list`);
  return value;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** An ISO date, or null. A source's own date is its claim, and an unparseable one is
 *  worth nothing -- so it becomes null rather than today, which would make every
 *  stale posting look fresh. */
export function isoDate(value: unknown): string | null {
  // Several feeds send a unix stamp instead of a date. Seconds and milliseconds are
  // told apart by size: a seconds value large enough to be confused with milliseconds
  // is a date in the year 5138.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  const raw = str(value);
  if (raw === null) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
