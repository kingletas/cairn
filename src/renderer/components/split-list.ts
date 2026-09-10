/** Splitting a pasted list into entries without splitting a name in half: a line wins
 *  over a comma, and a legal form after a comma belongs to the name in front of it. */

const LEGAL_FORMS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'ltd', 'limited', 'corp', 'corporation', 'co',
  'plc', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'bv', 'nv', 'ab', 'oy', 'as', 'pty', 'srl',
  'spa', 'kk', 'ug', 'kg', 'aps', 'sl',
]);

const isLegalForm = (part: string): boolean =>
  LEGAL_FORMS.has(part.replace(/[^\p{L}]/gu, '').toLowerCase());

export function splitList(text: string): string[] {
  // Lines first: somebody pasting a list they already had has one per line, and a name
  // on its own line is never two names.
  const lines = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  const out: string[] = [];
  for (const part of (lines[0] ?? '').split(',').map((one) => one.trim()).filter(Boolean)) {
    if (out.length > 0 && isLegalForm(part)) out[out.length - 1] = `${out[out.length - 1]}, ${part}`;
    else out.push(part);
  }
  return out;
}
