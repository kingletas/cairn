/** What must never reach an employer: headings, tables, fences, placeholders, or any sign
 *  of the machinery. It fails closed -- a letter that trips one is refused, never cleaned up. */

export interface Refusal {
  reason: string;
  /** The text that caused it, so the writer can see what to fix. */
  found: string;
}

interface Rule {
  pattern: RegExp;
  reason: string;
}

const RULES: readonly Rule[] = [
  // --- placeholders. The one that actually gets sent ---------------------
  { pattern: /\{\{[^}]{0,80}\}\}/, reason: 'a template placeholder that was never filled in' },
  { pattern: /\[[A-Z][A-Za-z]*(?: [A-Za-z]+){0,3}\]/, reason: 'a square-bracket placeholder like [Hiring Manager]' },
  { pattern: /\b(?:XXX+|TBD|TODO|FIXME)\b/, reason: 'a note to yourself that was left in' },
  { pattern: /<\s*insert[^>]{0,60}>/i, reason: 'an instruction to insert something' },

  // --- markup that survived extraction ------------------------------------
  { pattern: /^\s*#{1,6}\s+\S/m, reason: 'a markdown heading' },
  { pattern: /^\s*\|.*\|\s*$/m, reason: 'a table row' },
  { pattern: /^\s*```/m, reason: 'a code fence' },
  { pattern: /\[\[[^\]]{1,80}\]\]/, reason: 'a wikilink' },
  { pattern: /^\s*>\s*\[!\w+\]/m, reason: 'a callout' },
  { pattern: /^---\s*$/m, reason: 'a frontmatter rule' },

  // --- the tells of something that wrote it for you -----------------------
  { pattern: /\b(?:here is|here'?s) your (?:cover )?letter\b/i, reason: 'a preamble from whatever drafted this' },
  { pattern: /\bi hope this helps\b/i, reason: 'a sign-off from whatever drafted this' },
  { pattern: /\blet me know if you(?:'d| would)? like\b/i, reason: 'an offer to revise, addressed to you rather than the employer' },
  { pattern: /\bas an? (?:AI|language model)\b/i, reason: 'a model talking about itself' },
  { pattern: /\bfeel free to (?:adjust|tweak|modify|edit)\b/i, reason: 'an instruction to you that would be read by them' },
];

/** Everything wrong with a letter, not just the first thing. Reporting one at a time
 *  turns a two-minute fix into four rounds. */
export function refusals(letter: string): Refusal[] {
  const found: Refusal[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(letter);
    if (match) found.push({ reason: rule.reason, found: match[0].trim().slice(0, 80) });
  }
  return found;
}

export function isSendable(letter: string): boolean {
  return letter.trim().length > 0 && refusals(letter).length === 0;
}
