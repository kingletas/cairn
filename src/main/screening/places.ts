/** One place, however somebody spells it.
 *  A posting says "United States", a person types "US", and until both mean the same
 *  thing the location screen is comparing two spellings rather than two places. */

/** Canonical name, then every spelling worth looking for in a posting. The canonical
 *  name is what gets stored, so a profile written on one day reads the same on another. */
const PLACES: readonly (readonly string[])[] = [
  ['United States', 'US', 'U.S.', 'U.S.A.', 'USA', 'United States of America', 'America', 'Stateside'],
  ['United Kingdom', 'UK', 'U.K.', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'GB'],
  ['Ireland', 'Republic of Ireland', 'Eire', 'IE'],
  ['Canada', 'CA', 'CAN'],
  ['Mexico', 'MX', 'MEX'],
  ['Germany', 'Deutschland', 'DE', 'DEU'],
  ['France', 'FR', 'FRA'],
  ['Spain', 'España', 'Espana', 'ES', 'ESP'],
  ['Portugal', 'PT', 'PRT'],
  ['Italy', 'Italia', 'IT', 'ITA'],
  ['Netherlands', 'The Netherlands', 'Holland', 'NL', 'NLD'],
  ['Belgium', 'BE', 'BEL'],
  ['Switzerland', 'CH', 'CHE'],
  ['Austria', 'AT', 'AUT'],
  ['Poland', 'Polska', 'PL', 'POL'],
  ['Czechia', 'Czech Republic', 'CZ', 'CZE'],
  ['Romania', 'RO', 'ROU'],
  ['Sweden', 'Sverige', 'SE', 'SWE'],
  ['Norway', 'Norge', 'NO', 'NOR'],
  ['Denmark', 'Danmark', 'DK', 'DNK'],
  ['Finland', 'Suomi', 'FI', 'FIN'],
  ['Estonia', 'EE', 'EST'],
  ['Ukraine', 'UA', 'UKR'],
  ['Turkey', 'Türkiye', 'Turkiye', 'TR', 'TUR'],
  ['Greece', 'GR', 'GRC'],
  ['Israel', 'IL', 'ISR'],
  ['United Arab Emirates', 'UAE', 'U.A.E.', 'AE'],
  ['South Africa', 'ZA', 'RSA'],
  ['Nigeria', 'NG', 'NGA'],
  ['Kenya', 'KE', 'KEN'],
  ['Egypt', 'EG', 'EGY'],
  ['India', 'IN', 'IND', 'Bharat'],
  ['Pakistan', 'PK', 'PAK'],
  ['Singapore', 'SG', 'SGP'],
  ['Japan', 'JP', 'JPN', 'Nippon'],
  ['South Korea', 'Korea', 'Republic of Korea', 'KR', 'KOR'],
  ['China', 'PRC', 'CN', 'CHN'],
  ['Hong Kong', 'HK', 'HKG'],
  ['Australia', 'AU', 'AUS'],
  ['New Zealand', 'NZ', 'NZL', 'Aotearoa'],
  ['Brazil', 'Brasil', 'BR', 'BRA'],
  ['Argentina', 'AR', 'ARG'],
  ['Chile', 'CL', 'CHL'],
  ['Colombia', 'CO', 'COL'],
  ['Costa Rica', 'CR', 'CRI'],
  ['Dominican Republic', 'DO', 'DOM'],
  ['Puerto Rico', 'PR', 'PRI'],
  ['Philippines', 'The Philippines', 'PH', 'PHL'],
  ['Indonesia', 'ID', 'IDN'],
  ['Vietnam', 'Viet Nam', 'VN', 'VNM'],
  ['Malaysia', 'MY', 'MYS'],
  ['Thailand', 'TH', 'THA'],
  ['European Union', 'EU', 'E.U.'],
  ['EMEA'],
  ['LATAM', 'Latin America'],
  ['APAC', 'Asia Pacific', 'Asia-Pacific'],
];

/** Loose enough that spacing, punctuation and accents do not decide whether two
 *  spellings are the same word. */
function flatten(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const BY_SPELLING = new Map<string, readonly string[]>();
for (const place of PLACES) {
  for (const spelling of place) BY_SPELLING.set(flatten(spelling), place);
}

/** The name Cairn stores for whatever somebody typed, or null when it recognises
 *  none of them -- a city, a region, or somewhere the table has never heard of. */
export function canonicalPlace(typed: string): string | null {
  return BY_SPELLING.get(flatten(typed))?.[0] ?? null;
}

/** What to look for in a posting. A known place brings every spelling of itself; an
 *  unknown one is searched for exactly as it was typed, which is all Cairn can honestly
 *  do with a city it has no table for. */
export function spellingsOf(typed: string): string[] {
  const known = BY_SPELLING.get(flatten(typed));
  return known === undefined ? [typed] : [...known];
}


/** The places somebody said they are, stored under one name each. Typing US, USA and
 *  United States three times is one place, and a list that holds all three reads as
 *  three and matches as three. */
export function normalisePlaces(typed: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const one of typed) {
    const trimmed = one.trim();
    if (trimmed === '') continue;
    const name = canonicalPlace(trimmed) ?? trimmed;
    const key = flatten(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Work authorisation, which is a sentence more often than a country. A bare place is
 *  stored under its one name; anything else is left exactly as it was written, because
 *  "anywhere in the EU, with a visa I already hold" is not a country and rewriting it
 *  would be Cairn putting words in somebody's mouth on a form. */
export function normaliseAuthorisation(typed: string | null): string | null {
  if (typed === null) return null;
  const trimmed = typed.trim();
  if (trimmed === '') return null;
  return canonicalPlace(trimmed) ?? trimmed;
}
