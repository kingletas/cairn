/** Finding a thing again, wherever it is.
 *  Pure: it is handed rows and gives back what matched, so the ranking can be tested
 *  without a vault. */

export type FoundKind = 'role' | 'lead' | 'answer' | 'document' | 'interview';

export interface Found {
  kind: FoundKind;
  id: string;
  title: string;
  /** What it is, in the words of the screen it lives on. */
  detail: string;
  /** The sentence the match was in, so a hit explains itself. */
  evidence: string | null;
  score: number;
}

/** A row offered to the search: what to show, and what to look in. */
export interface Searchable {
  kind: FoundKind;
  id: string;
  title: string;
  detail: string;
  /** Every field worth matching, longest last so evidence comes from the fullest one. */
  text: string[];
}

/** Words worth matching on. A one-letter word matches everything and means nothing. */
export function terms(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((word) => word.length > 1);
}

/** Where a term sits in a word decides what it is worth: the whole field is a name
 *  somebody typed, the start of a word is a prefix they are part-way through, and
 *  anywhere else is a mention. */
function scoreIn(haystack: string, term: string): number {
  const text = haystack.toLowerCase();
  if (text === term) return 8;
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(text)) return 4;
  return text.includes(term) ? 1 : 0;
}

/** A sentence around the first hit, when it says something the row does not already.
 *  Evidence repeating the title under the title is a line that costs a row of height
 *  and answers nothing. */
function evidenceFor(fields: string[], term: string, shown: string): string | null {
  const already = shown.toLowerCase();
  for (const field of fields) {
    const at = field.toLowerCase().indexOf(term);
    if (at < 0) continue;
    if (already.includes(field.trim().toLowerCase())) continue;
    const from = Math.max(0, at - 40);
    const to = Math.min(field.length, at + term.length + 60);
    const quote = `${from > 0 ? '…' : ''}${field.slice(from, to).trim()}${to < field.length ? '…' : ''}`;
    return already.includes(quote.toLowerCase()) ? null : quote;
  }
  return null;
}

/** Everything that matched every word, best first.
 *  Every word, not any: two words are somebody narrowing, and a result matching one of
 *  them is the noise they were narrowing away from. */
export function search(query: string, rows: readonly Searchable[], limit = 40): Found[] {
  const wanted = terms(query);
  if (wanted.length === 0) return [];

  const found: Found[] = [];
  for (const row of rows) {
    let score = 0;
    let all = true;
    for (const term of wanted) {
      const best = Math.max(...row.text.map((field) => scoreIn(field, term)), 0);
      if (best === 0) { all = false; break; }
      score += best;
    }
    if (!all) continue;
    found.push({
      kind: row.kind, id: row.id, title: row.title, detail: row.detail,
      evidence: evidenceFor(row.text, wanted[0] as string, `${row.title} ${row.detail}`), score,
    });
  }

  return found
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
