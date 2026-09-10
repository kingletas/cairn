/** A harvest run: fetch, screen, and put what survives where a person can judge it.
 *  Nothing here decides: promoting a lead into the pipeline is a person's act. */

import { randomUUID } from 'node:crypto';
import type { Repo } from './repo.js';
import { fetchThrough, type GateOptions } from './net/gate.js';
import { adapterFor } from './sources/index.js';
import { smartrecruitersDetail } from './sources/ats.js';
import { SourceShapeChanged, type RawLead } from './sources/types.js';
import { screen, type Context, type Lead, type ScreeningResult } from './screening/checks.js';

export interface HarvestTarget {
  sourceId: string;
  token: string;
  company: string;
}

export interface HarvestOutcome {
  target: HarvestTarget;
  found: number;
  kept: number;
  /** Why the rest did not survive, counted by check. */
  dropped: Record<string, number>;
  /** Said out loud rather than swallowed. A source that has stopped working must not
   *  look like a source with nothing new -- silence is what a healthy run looks like,
   *  so a failure has to be loud or it is invisible for months. */
  error: string | null;
}

export interface HarvestResult {
  outcomes: HarvestOutcome[];
  requisitions: number;
  ranAt: string;
}

const DETAIL_LIMIT = 25;

/** How far each lane has got. Two of them, because the two kinds of source have
 *  nothing to do with each other: an employer board is polled by name and a listing
 *  site is searched, they are different hosts, and one being slow is no reason for the
 *  other to wait. */
export interface LaneProgress { done: number; total: number }

export interface HarvestProgress {
  boards: LaneProgress;
  feeds: LaneProgress;
}

export interface HarvestOptions {
  /** Read the two kinds at the same time. Each host is still spaced by the gate, so
   *  this is two queues rather than a burst. */
  sideBySide: boolean;
  onProgress?: (progress: HarvestProgress) => void;
}

export async function harvest(
  repo: Repo,
  targets: readonly HarvestTarget[],
  context: Context,
  gate: GateOptions,
  options: HarvestOptions = { sideBySide: true },
): Promise<HarvestResult> {
  const outcomes: HarvestOutcome[] = [];
  let written = 0;

  // Links this run has already taken, since one posting answers several search terms.
  // Claimed before the screening, because the two lanes interleave at every await.
  const seen = new Set<string>();

  const one = async (target: HarvestTarget): Promise<HarvestOutcome> => {
    const adapter = adapterFor(target.sourceId);
    if (!adapter) {
      return { target, found: 0, kept: 0, dropped: {}, error: `No adapter named ${target.sourceId}.` };
    }

    try {
      const response = await fetchThrough(
        adapter.endpoint(target.token),
        `Checking ${target.company} on ${adapter.label}`,
        gate,
      );
      if (!response.ok) {
        return { target, found: 0, kept: 0, dropped: {}, error: `${adapter.label} answered ${response.status}.` };
      }

      let leads = adapter.parse(response.body, target.token);
      leads = await fillDetails(adapter.id, leads, adapter.detailEndpoint, gate, target);

      let kept = 0;
      const dropped: Record<string, number> = {};
      const note = (check: string): void => { dropped[check] = (dropped[check] ?? 0) + 1; };

      for (const lead of leads) {
        if (lead.url !== null) {
          if (seen.has(lead.url)) {
            // The same posting under a second search term, which is not the same
            // thing as one already in your list and should not be counted as one.
            note('seen-this-run');
            continue;
          }
          seen.add(lead.url);
        }
        const screening = await screenOne(lead, adapter.provenance === 'first-party', context);
        if (!screening.clears) {
          const blocker = screening.verdicts.find((v) => v.outcome === 'fail');
          note(blocker?.check ?? 'unknown');
          continue;
        }
        writeRequisition(repo, target, lead, screening);
        kept += 1;
        written += 1;
      }
      return { target, found: leads.length, kept, dropped, error: null };
    } catch (cause) {
      const message =
        cause instanceof SourceShapeChanged
          ? cause.message
          : `Could not read ${target.company} from ${adapter.label}: ${String(cause instanceof Error ? cause.message : cause)}`;
      return { target, found: 0, kept: 0, dropped: {}, error: message };
    }
  };

  const isBoard = (target: HarvestTarget): boolean => adapterFor(target.sourceId)?.kind === 'ats';
  const boards = targets.filter(isBoard);
  const feeds = targets.filter((target) => !isBoard(target));

  const progress: HarvestProgress = {
    boards: { done: 0, total: boards.length },
    feeds: { done: 0, total: feeds.length },
  };
  options.onProgress?.(progress);

  const lane = async (which: 'boards' | 'feeds', list: readonly HarvestTarget[]): Promise<void> => {
    for (const target of list) {
      outcomes.push(await one(target));
      progress[which].done += 1;
      options.onProgress?.(progress);
    }
  };

  if (options.sideBySide) {
    await Promise.all([lane('boards', boards), lane('feeds', feeds)]);
  } else {
    await lane('boards', boards);
    await lane('feeds', feeds);
  }

  return { outcomes, requisitions: written, ranAt: new Date().toISOString() };
}

/** Some sources hand back a list with no description in it. Screening those rows
 *  would pass every one, so the detail is fetched -- capped, because a board with
 *  four hundred openings should not become four hundred requests without a word. */
async function fillDetails(
  sourceId: string,
  leads: RawLead[],
  detailEndpoint: ((lead: RawLead) => string | null) | undefined,
  gate: GateOptions,
  target: HarvestTarget,
): Promise<RawLead[]> {
  if (!detailEndpoint) return leads;
  const out: RawLead[] = [];
  for (const [index, lead] of leads.entries()) {
    if (index >= DETAIL_LIMIT) break;
    const url = detailEndpoint(lead);
    if (url === null) continue;
    const response = await fetchThrough(url, `Reading a posting at ${target.company}`, gate);
    if (!response.ok) continue;
    out.push(sourceId === 'smartrecruiters' ? smartrecruitersDetail(response.body, lead) : lead);
  }
  return out;
}

async function screenOne(lead: RawLead, firstParty: boolean, context: Context): Promise<ScreeningResult> {
  const forScreening: Lead = {
    company: lead.company,
    role: lead.role,
    url: lead.url,
    html: lead.html,
    postedAt: lead.postedAt,
    statedPay: lead.statedPay,
    firstParty,
  };
  return screen(forScreening, context);
}

function writeRequisition(repo: Repo, target: HarvestTarget, lead: RawLead, screening: ScreeningResult): void {
  const { pay, remote, ...rest } = screening;
  repo.saveRequisition({
    id: randomUUID(),
    company: lead.company,
    role: lead.role,
    url: lead.url,
    raw: lead.html.slice(0, 40_000),
    sourceId: target.sourceId,
    capturedAt: new Date().toISOString(),
    pay,
    remote,
    screening: rest,
    state: 'waiting',
  });
}
