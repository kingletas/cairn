/** Working out what a harvest will actually do, before it does it. */

import type { BoardRegistration, Profile, SourceState } from '../shared/types.js';

export interface PlannedTarget {
  sourceId: string;
  /** A board name for an employer's own board, a search term for a listing site. */
  token: string;
  /** What to call it in the request log, written for a person. */
  company: string;
}

/** What the planner needs to know about a source, which is less than an adapter is. */
export interface SourceKind {
  kind: 'ats' | 'aggregator';
  /** True when the source takes no search term. It is fetched once rather than once
   *  per title, because the same list six times is six requests for one answer. */
  searchless: boolean;
}

export interface Blocked {
  sourceId: string;
  /** Why this source will not run, in a sentence somebody can act on. */
  because: string;
}

export interface Plan {
  targets: PlannedTarget[];
  blocked: Blocked[];
  /** How many requests this will make, at least. A person pressing a button that
   *  reaches other people's servers should know roughly how many times. */
  requests: number;
}

export interface Family {
  id: string;
  label: string;
  titles: string[];
}

/** One run should not fire two dozen searches. Beyond this the extra terms find the
 *  same roles a second time and the run takes long enough to look broken. */
export const MAX_SEARCH_TERMS = 6;

/** The titles a listing site gets searched for: the ones from the families this
 *  person picked, in order, capped. */
export function searchTerms(profile: Profile, families: readonly Family[]): string[] {
  const chosen = families.filter((family) => profile.families.includes(family.id));
  const terms: string[] = [];
  // Round-robin rather than all of one family then all of the next, so a person with
  // two interests does not get six searches for the first and none for the second.
  for (let index = 0; terms.length < MAX_SEARCH_TERMS; index += 1) {
    const before = terms.length;
    for (const family of chosen) {
      const title = family.titles[index];
      if (title !== undefined && terms.length < MAX_SEARCH_TERMS) terms.push(title);
    }
    if (terms.length === before) break;
  }
  return terms;
}

export function planHarvest(
  sources: readonly SourceState[],
  kinds: ReadonlyMap<string, SourceKind>,
  boards: readonly BoardRegistration[],
  profile: Profile,
  families: readonly Family[],
): Plan {
  const targets: PlannedTarget[] = [];
  const blocked: Blocked[] = [];
  const terms = searchTerms(profile, families);

  for (const source of sources) {
    if (!source.enabled) continue;
    const known = kinds.get(source.id);

    if (known?.kind === 'ats') {
      const mine = boards.filter((board) => board.sourceId === source.id);
      if (mine.length === 0) {
        blocked.push({
          sourceId: source.id,
          because: 'no boards added yet — add one under Employers',
        });
        continue;
      }
      for (const board of mine) {
        targets.push({ sourceId: source.id, token: board.token, company: board.company });
      }
      continue;
    }

    if (known?.kind === 'aggregator') {
      if (terms.length === 0) {
        blocked.push({
          sourceId: source.id,
          because: 'nothing to search for — pick the kinds of work you are after in Settings',
        });
        continue;
      }
      // A source with no search parameter still waits until a person has said what
      // they are after -- it returns everything it has, and everything is what lands
      // in the queue when there is nothing to compare a title against.
      if (known.searchless) {
        targets.push({ sourceId: source.id, token: '', company: 'everything it lists' });
        continue;
      }
      for (const term of terms) {
        targets.push({ sourceId: source.id, token: term, company: term });
      }
      continue;
    }

    blocked.push({ sourceId: source.id, because: 'Cairn has no reader for this source' });
  }

  return { targets, blocked, requests: targets.length };
}
