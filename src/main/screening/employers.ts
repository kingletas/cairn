/** One employer, however it is written down.
 *  Red Heron, redheron, redHEron and Red Heron ICI are one company, and a list that
 *  holds them as four is a list that misses three. */

/** Legal forms rather than names. Dropping a name word would merge two companies;
 *  dropping "Inc" merges two spellings of one. */
const LEGAL_FORMS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'ltd', 'limited', 'corp', 'corporation', 'co',
  'plc', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'bv', 'nv', 'ab', 'oy', 'as', 'pty', 'srl',
  'spa', 'kk', 'ug', 'kg', 'aps', 'sl',
]);

/** Words rather than characters, so a legal form can be dropped whole. */
function words(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // A company writes itself both ways on the same day, and stripping the symbol as
    // punctuation left Stone & Rowe and Stone and Rowe as two firms.
    .replace(/[&+]/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** What two spellings of one employer have in common: no case, no spacing, no
 *  punctuation, and no legal form on the end. */
export function employerKey(name: string): string {
  const parts = words(name);
  while (parts.length > 1 && LEGAL_FORMS.has(parts[parts.length - 1] as string)) parts.pop();
  return parts.join('');
}

/** Whether a company on a posting is one somebody excluded: equal, or starting with it,
 *  which catches a name that has grown a suffix. Not merely containing it -- this drops
 *  a lead outright, and a name inside a longer one is how a real role disappears. */
export function isExcludedCompany(company: string, excluded: string): boolean {
  const here = employerKey(company);
  const listed = employerKey(excluded);
  if (listed.length < 2 || here.length === 0) return false;
  if (here === listed) return true;
  return listed.length >= 4 && here.startsWith(listed);
}

/** The spellings to look for in the text of a posting. An agency writes a client's name
 *  however it likes, and the one somebody typed is only one of them. */
export function spellingsOf(name: string): string[] {
  const parts = words(name);
  const shortened = [...parts];
  while (shortened.length > 1 && LEGAL_FORMS.has(shortened[shortened.length - 1] as string)) shortened.pop();
  const all = [name.trim(), parts.join(' '), shortened.join(' '), employerKey(name)];
  return [...new Set(all.filter((one) => one.length > 1))];
}

/** The list as it is kept: one entry per employer, in the spelling first typed. */
export function normaliseExclusions(names: readonly string[]): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name.length < 2) continue;
    const key = employerKey(name);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}
