/** What a model is allowed to have said. Every rule here throws work away rather than
 *  repairing it: a half-corrected claim is the one nobody checks. */

/** Whitespace differs between the posting and whatever quoted it, and only whitespace
 *  is allowed to differ. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether a quoted sentence really is in the posting. A fact whose quote is not
 *  there was written rather than read, and it is dropped. */
export function supported(quote: string, posting: string): boolean {
  const wanted = flatten(quote);
  if (wanted.length < 8) return false;
  return flatten(posting).includes(wanted);
}

/** Sentences, roughly. Enough to ask whether each one carries a source. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])|\n+/)
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

export interface Unsourced {
  sentence: string;
}

/** Every sentence in a note has to name a source, or the note is refused whole.
 *  Half-sourced is the harder thing to read, because nothing marks which half. */
export function unsourced(note: string, citations: { url: string }[]): Unsourced[] {
  if (citations.length === 0) return sentences(note).map((sentence) => ({ sentence }));
  const hosts = citations.map((one) => {
    try { return new URL(one.url).host.replace(/^www\./, ''); } catch { return one.url; }
  });
  return sentences(note)
    .filter((sentence) => sentence.length > 20)
    .filter((sentence) => !hosts.some((host) => sentence.includes(host)))
    .map((sentence) => ({ sentence }));
}

/** The sentences in a draft that assert something checkable -- a figure, a year, a
 *  name. No machine can tell a true claim about somebody from a plausible one, so
 *  these are listed for a person rather than judged. */
export function claims(letter: string): string[] {
  return sentences(letter).filter((sentence) =>
    /\b\d/.test(sentence) || /\b(?:19|20)\d{2}\b/.test(sentence));
}

/** JSON out of a reply that may have wrapped it in a fence or a sentence.
 *  Null when there is nothing shaped like an object in there at all. */
export function jsonIn(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text].filter((one): one is string => typeof one === 'string');
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch { /* the next candidate, or nothing */ }
  }
  return null;
}
