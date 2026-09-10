/** Employer job boards. */

import type { Money } from '../../shared/types.js';
import { asArray, boardToken, isoDate, parseJson, SourceShapeChanged, str, type RawLead, type SourceAdapter } from './types.js';

const record = (value: unknown): Record<string, unknown> =>
  (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>;

/** A structured pay field, when the employer filled one in. Anything read out of
 *  prose is the screening layer's job -- keeping the two apart is what lets the
 *  interface say whether a figure is the employer's or somebody's reading of it. */
function statedPay(min: unknown, max: unknown, currency: unknown): Money | null {
  const low = typeof min === 'number' ? min : Number(str(min) ?? NaN);
  const high = typeof max === 'number' ? max : Number(str(max) ?? NaN);
  if (!Number.isFinite(low) && !Number.isFinite(high)) return null;
  return {
    min: Number.isFinite(low) ? Math.round(low) : null,
    max: Number.isFinite(high) ? Math.round(high) : null,
    currency: str(currency) ?? 'USD',
    period: 'year',
    provenance: 'first-party',
    evidence: 'Stated by the employer on their own job board.',
  };
}

export const greenhouse: SourceAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse job boards',
  kind: 'ats',
  provenance: 'first-party',
  docs: 'https://developers.greenhouse.io/job-board.html',
  note:
    'The whole description, so a pay range can be read out of the text. This is the family that escapes its content twice, which Cairn undoes.',
  endpoint: (token) => `https://boards-api.greenhouse.io/v1/boards/${boardToken('greenhouse', token)}/jobs?content=true`,
  parse(body, token) {
    const root = record(parseJson(this.id, body));
    return asArray(this.id, root['jobs'], 'jobs').map((entry): RawLead => {
      const job = record(entry);
      const offices = asArray(this.id, job['offices'] ?? [], 'offices').map((o) => str(record(o)['name']));
      return {
        company: str(record(root['meta'])['company_name']) ?? token,
        role: str(job['title']) ?? 'Untitled role',
        url: str(job['absolute_url']),
        // Passed through untouched: some boards escape twice, and toText() unescapes in a
        // loop until the text stops changing.
        html: str(job['content']) ?? '',
        location: str(record(job['location'])['name']) ?? (offices.filter(Boolean).join(', ') || null),
        postedAt: isoDate(job['updated_at'] ?? job['first_published']),
        statedPay: null,
      };
    });
  },
};

export const lever: SourceAdapter = {
  id: 'lever',
  label: 'Lever postings',
  kind: 'ats',
  provenance: 'first-party',
  docs: 'https://github.com/lever/postings-api',
  note:
    'The whole description, and the workplace type is a real field rather than a sentence somewhere in the prose.',
  endpoint: (token) => `https://api.lever.co/v0/postings/${boardToken('lever', token)}?mode=json`,
  parse(body, token) {
    return asArray(this.id, parseJson(this.id, body), 'the response').map((entry): RawLead => {
      const job = record(entry);
      const categories = record(job['categories']);
      const salary = record(job['salaryRange']);
      return {
        company: str(job['categories'] ? categories['team'] : null) ?? token,
        role: str(job['text']) ?? 'Untitled role',
        url: str(job['hostedUrl']) ?? str(job['applyUrl']),
        html: `${str(job['descriptionPlain']) ?? str(job['description']) ?? ''}\n${str(job['additionalPlain']) ?? ''}`,
        location: str(categories['location']),
        postedAt: typeof job['createdAt'] === 'number' ? new Date(job['createdAt']).toISOString() : null,
        statedPay: statedPay(salary['min'], salary['max'], salary['currency']),
      };
    });
  },
};

export const ashby: SourceAdapter = {
  id: 'ashby',
  label: 'Ashby job boards',
  kind: 'ats',
  provenance: 'first-party',
  docs: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
  note:
    'Carries a structured pay summary whenever the employer published one, which makes it the most decisive of the four.',
  endpoint: (token) =>
    `https://api.ashbyhq.com/posting-api/job-board/${boardToken('ashby', token)}?includeCompensation=true`,
  parse(body, token) {
    const root = record(parseJson(this.id, body));
    return asArray(this.id, root['jobs'], 'jobs').map((entry): RawLead => {
      const job = record(entry);
      const compensation = record(job['compensation']);
      const summary = str(compensation['scrapeableCompensationSalarySummary']);
      return {
        company: str(root['organizationName']) ?? token,
        role: str(job['title']) ?? 'Untitled role',
        url: str(job['jobUrl']) ?? str(job['applyUrl']),
        // The compensation summary is appended rather than parsed here, so the same
        // range parser reads it as it reads any other prose -- one place to fix, and
        // one place that can be wrong.
        html: `${str(job['descriptionHtml']) ?? str(job['descriptionPlain']) ?? ''}${summary ? `\n${summary}` : ''}`,
        location: str(job['location']),
        postedAt: isoDate(job['publishedAt'] ?? job['updatedAt']),
        statedPay: null,
      };
    });
  },
};

export const smartrecruiters: SourceAdapter = {
  id: 'smartrecruiters',
  label: 'SmartRecruiters postings',
  kind: 'ats',
  provenance: 'first-party',
  docs: 'https://developers.smartrecruiters.com/reference/postings-1',
  note:
    'Remote is a proper flag here. The list rows carry no description, so each posting needs a second request and a run is capped.',
  endpoint: (token) => `https://api.smartrecruiters.com/v1/companies/${boardToken('smartrecruiters', token)}/postings`,
  parse(body, token) {
    const root = record(parseJson(this.id, body));
    return asArray(this.id, root['content'], 'content').map((entry): RawLead => {
      const job = record(entry);
      const location = record(job['location']);
      const place = [str(location['city']), str(location['region']), str(location['country'])]
        .filter(Boolean).join(', ');
      return {
        company: str(record(job['company'])['name']) ?? token,
        role: str(job['name']) ?? 'Untitled role',
        url: str(job['ref']),
        // A list row here carries no description at all, so it is fetched per posting.
        // Screening the list row instead would pass every single one, which looks like
        // a source that works and is a source that decides nothing.
        html: '',
        location: place.length > 0 ? place : null,
        postedAt: isoDate(job['releasedDate']),
        statedPay: null,
      };
    });
  },
  detailEndpoint: (lead) => lead.url,
};

/** SmartRecruiters again, for the second fetch. Kept separate because a detail
 *  response is a different shape from a list one. */
export function smartrecruitersDetail(body: string, into: RawLead): RawLead {
  const job = record(parseJson('smartrecruiters', body));
  const ad = record(job['jobAd']);
  const sections = record(record(ad['sections']));
  const text = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((key) => str(record(sections[key])['text']) ?? '')
    .join('\n');
  if (text.trim().length === 0) {
    throw new SourceShapeChanged('smartrecruiters', 'the posting has no description sections');
  }
  return { ...into, html: text };
}

export const ATS_ADAPTERS = [greenhouse, lever, ashby, smartrecruiters] as const;
