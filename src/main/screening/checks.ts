/** The screens. Every check reads a settings row or a profile field, never a document.
 *  And a check reports rather than decides: fit, family and location are left open. */

import type { Money, Opportunity, Profile, Screening, Settings, Verdict } from '../../shared/types.js';
import { bandOf } from '../../shared/band.js';
import { countMentions, findPhrase, toText } from './text.js';
import { spellingsOf as placeSpellings } from './places.js';
import { employerKey, isExcludedCompany, normaliseExclusions, spellingsOf } from './employers.js';
export { normaliseExclusions } from './employers.js';
import { parsePay, partialRangeLabel, UNKNOWN_CURRENCY } from './pay.js';

export interface Lead {
  company: string;
  role: string;
  url: string | null;
  html: string;
  postedAt: string | null;
  /** What the source stated, when it states one, rather than what we read from prose. */
  statedPay: Money | null;
  firstParty: boolean;
}

export interface Context {
  profile: Profile;
  settings: Settings;
  /** The job titles this person is actually after, from the families they picked.
   *  A listing site returns everything it has -- a search for a platform engineer
   *  comes back with sales roles in it -- so without this the queue fills with work
   *  nobody asked about and stops being worth opening. */
  titles: readonly string[];
  /** URLs already in the vault, so the same posting does not arrive twice. */
  knownUrls: ReadonlySet<string>;
  /** Employer-and-role for everything already here, because a re-listed posting comes
   *  back on a new link. Build it with `pairKey`, never by hand. */
  knownPairs: ReadonlySet<string>;
  /** Hashes of links the user dropped. The link itself is never kept. */
  droppedHashes: ReadonlySet<string>;
  now: Date;
}

/** An absent key and a key holding undefined are different things under
 *  `exactOptionalPropertyTypes`, so this keeps `evidence` off when there is
 *  nothing worth quoting. */
function verdict(
  check: string,
  outcome: Verdict['outcome'],
  because: string,
  evidence?: string | null,
): Verdict {
  return evidence ? { check, outcome, because, evidence } : { check, outcome, because };
}

const LOCATION_CLAUSES = [
  'in office', 'in-office', 'onsite', 'on-site', 'on site', 'hybrid',
  'relocation', 'relocate', 'days per week in', 'in person', 'in-person',
] as const;

const INTERMEDIARY_PHRASES = [
  'on behalf of', 'not the employing entity', 'recruitment partner',
  'our client', 'we are recruiting for',
] as const;

const CLEARANCE_BLOCKING = ['active security clearance', 'active clearance', 'current clearance'] as const;
const CLEARANCE_OBTAINABLE = ['able to obtain', 'eligible to obtain', 'willing to obtain'] as const;

/** Work that can only be done by somebody a government already allows. Nationality is
 *  the whole of the test, so this is reported against the profile rather than judged. */
const RESTRICTED = [
  'itar', 'export control', 'export-controlled', 'export controlled',
  'u.s. person', 'us person', 'ear99', 'deemed export',
] as const;

/** A company that places people at other companies. Named in the company field rather
 *  than in the prose, which is the half `named-employer` cannot see. */
const INTERMEDIARY_NAMES = [
  'staffing', 'recruiting', 'recruitment', 'talent partners', 'talent solutions',
  'headhunt', 'consultancy', 'solution partner', 'solutions partner', 'resourcing',
] as const;

/** The rung a title names. Ordered, so the highest one present is the one reported. */
const TIERS = [
  'distinguished', 'fellow', 'architect', 'principal', 'director', 'head of',
  'staff', 'lead', 'manager', 'senior',
] as const;

/** Titles that name a rung below the one this list is for. */
const JUNIOR_TIERS = ['junior', 'associate', 'graduate', 'intern', 'entry level', 'entry-level'] as const;

const REMOTE_PHRASES = ['fully remote', 'remote-first', 'remote first', '100% remote', 'work from home', 'remote'] as const;
const HYBRID_PHRASES = ['hybrid', 'days per week in', 'days a week in', 'days in the office'] as const;
const ONSITE_PHRASES = ['on-site', 'onsite', 'on site', 'in office', 'in-office', 'in person', 'in-person'] as const;

/** Only these can fail a lead outright, and every one of them answers to something the
 *  person set: you excluded that employer, it is already in your list, the pay is under
 *  your floor, the posting is older than your limit, the title is not one of the ones
 *  you are looking for.
 */
const HARD = new Set(['employer-excluded', 'already-known', 'dropped-before', 'pay-floor', 'freshness', 'title']);

/** Words too common in job titles to mean anything on their own. "Senior Engineer"
 *  and "Senior Account Executive" share a word and nothing else. */
const TITLE_NOISE = new Set([
  'senior', 'staff', 'principal', 'lead', 'junior', 'mid', 'level', 'ii', 'iii',
  'the', 'and', 'for', 'with', 'remote', 'contract', 'full', 'time', 'part',
]);

function titleWords(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((word) => word.length > 2 && !TITLE_NOISE.has(word)),
  );
}

/** Whether a posting's title is one of the jobs this person is looking for.
 *  Two shared meaningful words, or one that is the whole of a short title -- enough
 *  to keep "Platform Engineer" against "Senior Platform Engineer" and to drop
 *  "Account Executive". */
export function titleMatches(role: string, titles: readonly string[]): string | null {
  const words = titleWords(role);
  if (words.size === 0) return null;
  for (const wanted of titles) {
    const target = titleWords(wanted);
    if (target.size === 0) continue;
    let shared = 0;
    for (const word of target) if (words.has(word)) shared += 1;
    if (shared >= 2 || (shared === 1 && target.size === 1)) return wanted;
  }
  return null;
}

/** One posting, however it was written down. The company half collapses spellings the
 *  way the exclusion screen does, so "Hollis Health" and "Hollis Health, Inc." are one
 *  employer here too. */
export function pairKey(company: string, role: string): string {
  const title = role.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${employerKey(company)}\u0000${title}`;
}

export async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ScreeningResult extends Screening {
  /** What the pay checks read, so a caller does not parse the same prose twice and
   *  end up with two answers that can disagree. */
  pay: Money | null;
  /** What the posting says about being in an office, read once here so the role a lead
   *  becomes says the same thing the lead did. */
  remote: Opportunity['remote'];
}

export async function screen(lead: Lead, context: Context): Promise<ScreeningResult> {
  const { profile, settings } = context;
  const text = toText(lead.html);
  const verdicts: Verdict[] = [];
  const open: string[] = [];

  const pay = lead.statedPay ?? parsePay(text, lead.firstParty ? 'first-party' : 'aggregated');

  // Cheapest and most decisive first, and the one screen whose answer is a list the
  // person keeps: a title nobody is looking for costs nothing to set aside and fills
  // the queue if it is left in.
  if (context.titles.length === 0) {
    verdicts.push(verdict('title', 'unknown',
      'You have not said which jobs you are after, so nothing is being matched on title.'));
  } else {
    const matched = titleMatches(lead.role, context.titles);
    verdicts.push(matched === null
      ? verdict('title', 'fail',
          `“${lead.role}” is not one of the job titles you are looking for. Settings is where that list lives.`)
      : verdict('title', 'pass', `Reads as ${matched}.`));
  }

  const exclusion = await excluded(lead, text, settings);
  verdicts.push(exclusion);
  if (exclusion.outcome === 'ask') {
    open.push('Is this posting for an employer you excluded, or does it only mention them?');
  }
  verdicts.push(await seenBefore(lead, context));
  verdicts.push(...payChecks(pay, text, profile, settings));
  verdicts.push(freshness(lead, context, settings));

  verdicts.push(locationCheck(text, profile, open));

  const intermediary = findPhrase(text, INTERMEDIARY_PHRASES);
  const byName = findPhrase(lead.company, INTERMEDIARY_NAMES);
  if (byName !== null) {
    verdicts.push(verdict('named-employer', 'ask',
      `${lead.company} places people at other companies, so the employer is somebody else.`,
      lead.company));
  } else if (intermediary) {
    verdicts.push(verdict('named-employer', 'ask',
      'This looks like it was posted for an employer it does not name.', intermediary.evidence));
  }

  const blocking = findPhrase(text, CLEARANCE_BLOCKING);
  const obtainable = findPhrase(text, CLEARANCE_OBTAINABLE);
  if (blocking && !obtainable) {
    verdicts.push(verdict('clearance', 'ask',
      'It asks for a clearance you must already hold, not one you could be put in for.',
      blocking.evidence));
  }

  verdicts.push(restricted(text, profile));
  verdicts.push(route(lead));
  verdicts.push(tier(lead.role));

  const mentions = countMentions(text, profile.skills);
  const total = Object.values(mentions).reduce((sum, n) => sum + n, 0);
  verdicts.push(verdict('skills', 'ask',
    total === 0
      ? 'None of your skills are mentioned.'
      : `Mentions: ${Object.entries(mentions).map(([k, v]) => `${k} ${v}`).join(', ')}.`));

  open.push('Is your specialty the job here, or a line in the requirements?');
  open.push('Is this a fit?');
  if (profile.families.length > 0) open.push('Which family does it belong to?');

  const clears = !verdicts.some((v) => HARD.has(v.check) && v.outcome === 'fail');
  return { verdicts, clears, open, pay, remote: remoteOf(text) };
}

/** Whether the work needs a nationality rather than a skill. Reported against what the
 *  profile says, never decided: the answer is a fact about a person, and Cairn holds
 *  one sentence of it. */
function restricted(text: string, profile: Profile): Verdict {
  const found = findPhrase(text, RESTRICTED);
  if (found === null) {
    return verdict('restricted-work', 'pass', 'Nothing here says the work is export-controlled.');
  }
  const said = profile.workAuthorisation?.trim() ?? '';
  return verdict('restricted-work', 'ask',
    said === ''
      ? `This names ${found.phrase}, which needs a particular nationality. Your profile does not say what yours is.`
      : `This names ${found.phrase}, which needs a particular nationality. Your profile says ${said}.`,
    found.evidence);
}

/** Whether there is any way to apply at all. No link and no named employer means the
 *  gate's fourth question cannot be run, which is what makes a posting un-actionable
 *  rather than merely unattractive. */
function route(lead: Lead): Verdict {
  const named = lead.company.trim().length > 1;
  if (lead.url !== null && named) {
    return verdict('route', 'pass', 'There is a link and a named employer.');
  }
  if (lead.url === null && !named) {
    return verdict('route', 'ask',
      'No link and no employer named, so there is nowhere to apply and nowhere to look.');
  }
  return lead.url === null
    ? verdict('route', 'ask', `No link. Applying means finding this on ${lead.company}'s own board.`)
    : verdict('route', 'ask', 'The employer is not named, so there is no board of their own to check.');
}

/** Which rung the title names. Reported, because whether a rung is the right one is a
 *  judgement about a career rather than a fact about a string. */
function tier(role: string): Verdict {
  const junior = findPhrase(role, JUNIOR_TIERS);
  if (junior !== null) {
    return verdict('title-tier', 'ask', `The title says ${junior.phrase}.`, role);
  }
  const found = TIERS.find((one) => findPhrase(role, [one]) !== null);
  return found === undefined
    ? verdict('title-tier', 'ask', 'The title names no rung, so what it is worth is not stated in it.', role)
    : verdict('title-tier', 'pass', `The title says ${found}.`, role);
}

/** Where the work is done, as the posting puts it. Nothing is inferred from silence:
 *  a posting that says nothing leaves this unstated, which is what it is. */
function remoteOf(text: string): Opportunity['remote'] {
  const hybrid = findPhrase(text, HYBRID_PHRASES);
  if (hybrid !== null) return 'hybrid';
  const remote = findPhrase(text, REMOTE_PHRASES);
  const onsite = findPhrase(text, ONSITE_PHRASES);
  if (remote !== null && onsite === null) return 'remote';
  if (onsite !== null && remote === null) return 'onsite';
  return 'unstated';
}

/** Trimmed, deduplicated, and refusing anything too short to name an employer. */


/** Whether this is an employer you refuse to work for, and the two answers are not the
 *  same kind of answer.
 */
async function excluded(lead: Lead, text: string, settings: Settings): Promise<Verdict> {
  const names = normaliseExclusions(settings.excludedEmployers);

  // One employer however it is written: Red Heron, redheron and Red Heron ICI are
  // the same company, and two of those used to reach the queue.
  const listed = names.find((name) => isExcludedCompany(lead.company, name));
  if (listed !== undefined) {
    return verdict('employer-excluded', 'fail', `You excluded ${listed}.`, lead.company);
  }

  // An agency writes a client's name however it likes, so the text is read for every
  // spelling rather than only the one somebody typed.
  const mentioned = findPhrase(text, names.flatMap(spellingsOf));
  if (mentioned !== null) {
    return verdict('employer-excluded', 'ask',
      `The posting names ${mentioned.phrase}, who you excluded, but does not list them as the ` +
        'employer. An agency posting on their behalf reads exactly like this, and so does a ' +
        'posting that just mentions them.',
      mentioned.evidence);
  }
  return verdict('employer-excluded', 'pass', 'Not on your excluded list.');
}

/** Three different reasons a posting is not new, and they were one number. */
async function seenBefore(lead: Lead, context: Context): Promise<Verdict> {
  if (lead.url !== null && context.knownUrls.has(lead.url)) {
    return verdict('already-known', 'fail', 'This is already in your pipeline.');
  }
  // A filled requisition is re-listed under a new link, so the link alone let the same
  // role in twice. The spreadsheet importer has always matched both; this is that rule.
  if (context.knownPairs.has(pairKey(lead.company, lead.role))) {
    return verdict('already-known', 'fail',
      `${lead.company} — ${lead.role} is already in your pipeline, under a different link.`);
  }
  if (lead.url === null) {
    return verdict('already-known', 'pass', 'New to you, matched on the employer and the title.');
  }
  if (context.settings.keepDroppedHashes && context.droppedHashes.has(await hashUrl(lead.url))) {
    return verdict('dropped-before', 'fail', 'You said no to this one before, and Cairn remembers the link.');
  }
  return verdict('already-known', 'pass', 'New to you.');
}

/** Where you have to be, against where you said you are. */
function locationCheck(text: string, profile: Profile, open: string[]): Verdict {
  const clause = findPhrase(text, LOCATION_CLAUSES);
  // Every spelling of every place, so "United States" in a posting answers "US" in a
  // profile. A place Cairn does not know is searched for exactly as it was typed.
  const mine = profile.locations
    .filter((one) => one.trim().length > 1)
    .flatMap((one) => placeSpellings(one.trim()));
  const yours = findPhrase(text, mine);

  if (clause === null) {
    return yours === null
      ? verdict('location-clause', 'pass', 'No location requirement found in the text.')
      : verdict('location-clause', 'pass', `No location requirement, and it names ${yours.phrase}, which is one of yours.`, yours.evidence);
  }

  open.push('Does the location actually work for you?');

  if (profile.remoteOnly) {
    return verdict('location-clause', 'ask',
      'You said remote only, and this asks you to be somewhere. Read it before you decide.',
      clause.evidence);
  }
  if (yours !== null) {
    return verdict('location-clause', 'ask',
      `It asks you to be somewhere, and it names ${yours.phrase}, which is one of yours.`,
      clause.evidence);
  }
  if (profile.locations.length > 0) {
    return verdict('location-clause', 'ask',
      'It asks you to be somewhere, and does not name anywhere you said you are.',
      clause.evidence);
  }
  return verdict('location-clause', 'ask',
    'The posting says something about where you have to be. Read it before you decide.',
    clause.evidence);
}

/** Two thresholds, because one number cannot say both "dead" and "worth a look". */
function payChecks(pay: Money | null, text: string, profile: Profile, settings: Settings): Verdict[] {
  if (pay === null) {
    return [verdict('pay-floor', 'unknown', 'No pay is stated, so the pay rule could not run.')];
  }

  const out: Verdict[] = [];
  if (profile.payFloor === null) {
    out.push(verdict('pay-floor', 'unknown',
      'You have not set a pay floor yet, so nothing is being compared.', pay.evidence));
  } else if (pay.currency === UNKNOWN_CURRENCY) {
    // Reading it as yours is how a Canadian band clears a dollar floor: the figures
    // look right, the arithmetic is right, and the answer is wrong by a third.
    out.push(verdict('pay-floor', 'unknown',
      'The posting names figures and no currency, so they were not compared with your floor.',
      pay.evidence));
  } else if (pay.currency !== profile.currency) {
    // A range in one currency against a floor in another is not a comparison. Pay drops
    // a lead outright, so leaving it silent removed real roles by arithmetic nobody saw.
    out.push(verdict('pay-floor', 'unknown',
      `The range is in ${pay.currency} and your floor is in ${profile.currency}, so the two were not compared.`,
      pay.evidence));
  } else {
    const target = profile.payTarget ?? profile.payFloor;
    const band = bandOf(pay, profile);
    if (band === 'below') {
      out.push(verdict('pay-floor', 'fail',
        `The top of the range is below your floor of ${profile.payFloor.toLocaleString()}.`, pay.evidence));
    } else {
      out.push(verdict('pay-floor', 'pass',
        band === 'under'
          ? `Above your floor but under your target of ${target.toLocaleString()} -- worth a look on a strong match.`
          : 'The top of the range clears your target.',
        pay.evidence));
    }
  }

  out.push(
    pay.provenance === 'first-party'
      ? verdict('pay-provenance', 'pass', "This is the employer's own figure.")
      : verdict('pay-provenance', settings.requireFirstPartyPay ? 'fail' : 'ask',
          'This figure comes from a listing site, not the employer. It has no standing until their own posting agrees.'),
  );

  const partial = partialRangeLabel(text);
  if (partial !== null) {
    out.push(verdict('pay-partial-range', 'ask',
      `The posting calls this a "${partial}", so the top of it is not the ceiling.`,
      findPhrase(text, [partial])?.evidence));
  }
  return out;
}

/** An aggregator's date is its own claim, so an age from one is a lower bound on
 *  staleness rather than a liveness check. */
function freshness(lead: Lead, context: Context, settings: Settings): Verdict {
  if (lead.postedAt === null) return verdict('freshness', 'unknown', 'No posting date given.');
  const days = Math.floor((context.now.getTime() - Date.parse(lead.postedAt)) / 86_400_000);
  if (!Number.isFinite(days)) return verdict('freshness', 'unknown', 'The posting date could not be read.');
  return days > settings.maxPostingAgeDays
    ? verdict('freshness', 'fail', `Posted ${days} days ago, past your ${settings.maxPostingAgeDays}-day limit.`)
    : verdict('freshness', 'pass', `Posted ${Math.max(days, 0)} days ago.`);
}
