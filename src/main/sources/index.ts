/** The source registry, and working out which board a careers page belongs to. */

import { ATS_ADAPTERS } from './ats.js';
import { adapterFor as compile } from './pack.js';
import type { Sourced } from './library.js';
import type { SourceAdapter } from './types.js';

let imported: readonly SourceAdapter[] = [];
let refused: readonly string[] = [];

/** Replace everything that came from a pack. Called once at startup and again whenever
 *  a feed is imported, edited or removed, so a change is usable without a restart.
 */
export function useSourcePacks(entries: readonly Sourced[], problems: readonly string[]): void {
  const builtin = new Set(ATS_ADAPTERS.map((adapter) => adapter.id));
  const chosen = new Map<string, Sourced>();
  const rejected = [...problems];

  for (const entry of entries) {
    const { id } = entry.definition;
    // A pack may not take over an id Cairn reads in code. Letting a file re-point
    // `greenhouse` would send every employer board somebody added to a host of the
    // file's choosing, and nothing on the screen would change.
    if (builtin.has(id)) {
      rejected.push(`${id} in ${entry.origin} is already the name of a feed Cairn reads, so it was skipped.`);
      continue;
    }
    // Replacing a shipped feed is the point of being able to edit one. Two of your own
    // files claiming one id is ambiguity, and you cannot see it without being told.
    const standing = chosen.get(id);
    if (standing !== undefined && !standing.shipped) {
      rejected.push(`${id} is described in both ${standing.origin} and ${entry.origin}. The one in ${entry.origin} is being used.`);
    }
    chosen.set(id, entry);
  }

  imported = [...chosen.values()].map((entry) => compile(entry.definition));
  refused = rejected;
}

/** Whether a feed came from a file rather than from `ats.ts`, which decides whether the
 *  app offers to edit it. */
export function isBuiltin(id: string): boolean {
  return ATS_ADAPTERS.some((adapter) => adapter.id === id);
}

/** Every feed Cairn can read right now. */
export function adapters(): readonly SourceAdapter[] {
  return [...ATS_ADAPTERS, ...imported];
}

/** What was in a pack and could not be used, in sentences. Said out loud on the
 *  Sources screen: a feed that silently failed to load looks exactly like a feed with
 *  nothing new, and nothing new is what a healthy run looks like. */
export function sourceProblems(): readonly string[] {
  return refused;
}

export function adapterFor(id: string): SourceAdapter | null {
  return adapters().find((adapter) => adapter.id === id) ?? null;
}

export interface BoardRef {
  sourceId: string;
  token: string;
}

/** Board URLs, and the token sits in a different place in each.
 *  Ordered most specific first, because several of these hosts also serve other pages. */
const PATTERNS: readonly { sourceId: string; test: RegExp }[] = [
  { sourceId: 'greenhouse', test: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i },
  { sourceId: 'greenhouse', test: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i },
  { sourceId: 'lever', test: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
  { sourceId: 'lever', test: /api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/i },
  { sourceId: 'ashby', test: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i },
  { sourceId: 'ashby', test: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.-]+)/i },
  { sourceId: 'smartrecruiters', test: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
  { sourceId: 'smartrecruiters', test: /api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/i },
];

/** Read a board out of any URL on it, so adding an employer is pasting a link rather
 *  than knowing what an applicant tracking system is. Returns null rather than
 *  guessing -- a wrong token polls somebody else's board for ever and looks like it
 *  is working. */
export function boardFromUrl(input: string): BoardRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const whole = `${url.host}${url.pathname}${url.search}`;
  for (const { sourceId, test } of PATTERNS) {
    const found = test.exec(whole);
    const token = found?.[1];
    if (token && token.length > 1 && !RESERVED.has(token.toLowerCase())) {
      return { sourceId, token };
    }
  }
  return null;
}

/** Path segments that are part of the site rather than a company. Without this,
 *  `jobs.lever.co/search` registers a board called "search". */
const RESERVED = new Set(['search', 'jobs', 'job', 'embed', 'api', 'v0', 'v1', 'boards', 'about', 'login']);
