/** Naming the vault as it was, when you start over. */

/** A name for the vault as it was, beside where it is now. Checked for a clash rather than
 *  assumed unique: two landing on one name would be the second destroying the first. */
export function archiveFolderName(now: Date, taken: (name: string) => boolean): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const base = `vault-before-${stamp}`;
  if (!taken(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const name = `${base}-${n}`;
    if (!taken(name)) return name;
  }
  throw new Error('There are already a thousand set-aside vaults with this timestamp.');
}

/** The word somebody has to type before anything is deleted.
 *  A dialog with two buttons is one misclick; this is a sentence you have to mean. */
export const ERASE_PHRASE = 'erase everything';

/** Whether what was typed is the phrase. Spacing and case are forgiven -- the point is
 *  deliberate, not dexterous -- and nothing else is. */
export function saidErase(typed: string): boolean {
  return typed.trim().replace(/\s+/g, ' ').toLowerCase() === ERASE_PHRASE;
}

/** A folder beside the vault that holds a vault set aside earlier. Matched on the name
 *  this file gives them, so nothing else in the directory is ever a candidate. */
export function isSetAsideVault(name: string): boolean {
  return /^vault-before-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(-\d+)?$/.test(name);
}
