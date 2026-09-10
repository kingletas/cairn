/** Reading an application form out of a pasted page. A selection carries the rendered
 *  HTML but not what a field marks as required, and Cairn says so rather than guessing. */

export interface FormField {
  label: string;
  kind: 'short' | 'long' | 'choice' | 'file' | 'unknown';
  /** Whatever the page showed as already filled in. */
  value: string | null;
  /** Options, when the paste happened to carry them. Empty is not "none offered". */
  options: string[];
}

const LABEL_LIMIT = 200;

/** A label is prose, and a paste brings a lot of layout with it. Anything this long
 *  is a paragraph that happened to sit near an input. */
function plausibleLabel(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 2 && trimmed.length <= LABEL_LIMIT && /[a-z]/i.test(trimmed);
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
}

/** Pull `<label>` text and the control it names out of pasted markup.
 *  Deliberately forgiving: a real paste is broken markup, and refusing it outright
 *  would mean the feature only works on pages nobody needs help with. */
export function fieldsFromHtml(html: string): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>();

  const labelPattern = /<label\b[^>]*>([\s\S]{0,400}?)<\/label>/gi;
  for (const match of html.matchAll(labelPattern)) {
    const label = tidy(stripTags(match[1] ?? ''));
    if (!plausibleLabel(label) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());

    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 600);
    fields.push({ label, ...controlIn(after) });
  }

  // Some forms use a heading above the control instead of a label element.
  const headingPattern = /<(?:h[3-6]|legend|p|div)[^>]*>([\s\S]{0,200}?)<\/(?:h[3-6]|legend|p|div)>\s*(<(?:input|textarea|select)\b[^>]*>)/gi;
  for (const match of html.matchAll(headingPattern)) {
    const label = tidy(stripTags(match[1] ?? ''));
    if (!plausibleLabel(label) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    fields.push({ label, ...controlIn(match[2] ?? '') });
  }

  return fields;
}

/** The control a label names is the *nearest* one after it, whatever kind it is.
 *  Looking for a textarea first finds the next field's, and every short answer in the
 *  form is then reported as a long one -- which changes what the interface asks for
 *  and is invisible until somebody looks at the result. */
function controlIn(fragment: string): Omit<FormField, 'label'> {
  const nearest = /<(input|textarea|select)\b[^>]*>/i.exec(fragment);
  if (!nearest) return { kind: 'unknown', value: null, options: [] };

  const tag = (nearest[1] ?? '').toLowerCase();
  const rest = fragment.slice(nearest.index);

  if (tag === 'textarea') {
    return { kind: 'long', value: textBetween(rest, 'textarea'), options: [] };
  }
  if (tag === 'select') {
    const closing = rest.search(/<\/select>/i);
    const within = closing === -1 ? rest : rest.slice(0, closing);
    const options = [...within.matchAll(/<option\b[^>]*>([\s\S]{0,120}?)<\/option>/gi)]
      .map((m) => tidy(stripTags(m[1] ?? '')))
      .filter((text) => text.length > 0);
    return { kind: 'choice', value: null, options };
  }

  const input = nearest[0];
  const type = /type\s*=\s*["']?([a-z]+)/i.exec(input)?.[1]?.toLowerCase() ?? 'text';
  if (type === 'file') return { kind: 'file', value: null, options: [] };
  if (type === 'radio' || type === 'checkbox') return { kind: 'choice', value: null, options: [] };
  return { kind: 'short', value: attribute(input, 'value'), options: [] };
}

function attribute(tag: string, name: string): string | null {
  const found = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  const value = found?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function textBetween(fragment: string, tag: string): string | null {
  const found = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]{0,2000}?)</${tag}>`, 'i').exec(fragment);
  const text = tidy(stripTags(found?.[1] ?? ''));
  return text.length > 0 ? text : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}
