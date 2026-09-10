/** What else is going on at one employer. Question six is the only one of the six that
 *  asks about us rather than about the posting, and every fact it needs is already
 *  here -- it was answered from memory until a second application went out four days
 *  after the first with every other check reading green. */

import type { AtEmployer, Opportunity, TimelineEvent } from '../shared/types.js';
import { employerKey } from './screening/employers.js';

export function atEmployer(
  roles: readonly Opportunity[],
  lastEvent: ReadonlyMap<string, TimelineEvent>,
  company: string,
  exclude: string,
): AtEmployer {
  // The same reading the exclusion screen uses. Hollis Health and Hollis Health, Inc.
  // are one employer, and matching the strings held them as two.
  const wanted = employerKey(company);
  const theirs = roles
    .filter((o) => o.id !== exclude && o.appliedAt !== null && employerKey(o.company) === wanted)
    .sort((a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? ''));
  return {
    live: theirs.filter((o) => o.archivedAt === null),
    // A row that has been turned down is archived, so it is not live -- and applying
    // again the same week reads as not having heard the answer, which is the fourth
    // thing question six asks and the one nothing could answer.
    declined: theirs
      .filter((o) => o.archivedAt !== null && lastEvent.get(o.id)?.kind === 'rejected')
      .map((o) => ({ role: o.role, at: o.archivedAt ?? '' })),
  };
}
