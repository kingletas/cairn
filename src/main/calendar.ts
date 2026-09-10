/** Everything with a date, gathered from wherever it lives, so there is one answer to
 *  "what is coming up" rather than three that can disagree. */

import type { DatedThing, Interview } from '../shared/types.js';
import type { Repo } from './repo.js';

export function datedThings(repo: Repo): DatedThing[] {
  const roles = new Map(repo.opportunities(true).map((o) => [o.id, o]));
  const things: DatedThing[] = [];

  for (const interview of repo.interviews()) {
    if (interview.outcome === 'cancelled') continue;
    const role = roles.get(interview.opportunityId);
    things.push({
      at: interview.at,
      kind: 'interview',
      title: role ? `${role.company} — ${interview.round || 'interview'}` : interview.round || 'Interview',
      detail: interview.people || null,
      opportunityId: interview.opportunityId,
      stage: role?.stage ?? null,
    });
  }

  for (const role of roles.values()) {
    if (role.archivedAt !== null) continue;
    if (role.nextActionDue !== null && role.nextAction !== null) {
      things.push({
        at: role.nextActionDue,
        kind: 'action',
        // Which role it is, the way an interview and a sent application are both named.
        // A day of "Held to Monday" says nothing about who is being held.
        title: `${role.company} · ${role.role}`,
        detail: role.nextAction,
        opportunityId: role.id,
        stage: role.stage,
      });
    }
    if (role.appliedAt !== null) {
      things.push({
        at: role.appliedAt,
        kind: 'sent',
        title: `Applied to ${role.company}`,
        detail: role.role,
        opportunityId: role.id,
        stage: role.stage,
      });
    }
  }

  return things.sort((a, b) => a.at.localeCompare(b.at));
}

/** The next interview, which is what the Interviews view opens on. A list of them is
 *  a worse answer to "what am I preparing for" than the one that is next. */
export function nextInterview(interviews: readonly Interview[], now = new Date()): Interview | null {
  const upcoming = interviews
    .filter((i) => i.outcome === 'scheduled' && Date.parse(i.at) >= now.getTime())
    .sort((a, b) => a.at.localeCompare(b.at));
  return upcoming[0] ?? null;
}
