/** Letter templates: a skeleton, its slots, and filling them in. */

export interface Template {
  id: string;
  name: string;
  /** When to reach for this one, in a sentence. */
  use: string;
  body: string;
  slots: string[];
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const SLOT = /\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi;

export function parseTemplate(id: string, source: string): Template {
  const front = FRONTMATTER.exec(source);
  const body = front ? source.slice(front[0].length).trim() : source.trim();
  const header = front?.[1] ?? '';

  const field = (name: string): string =>
    new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(header)?.[1]?.trim() ?? '';

  const slots = new Set<string>();
  for (const match of body.matchAll(SLOT)) {
    const slot = match[1];
    if (slot) slots.add(slot);
  }

  return {
    id,
    name: field('name') || id,
    use: field('use'),
    body,
    slots: [...slots],
  };
}

export interface FillResult {
  letter: string;
  /** Slots nothing filled. Named rather than blanked, because an empty space where a
   *  company name should be is only obvious to somebody who already knows. */
  unfilled: string[];
}

/** Fill what is known. A slot may carry a fallback after a pipe -- `{{a|b}}` uses b
 *  when a is unknown, which is how "Dear Hiring team" works without anybody's name. */
export function fill(template: Template, values: Readonly<Record<string, string>>): FillResult {
  const unfilled = new Set<string>();
  const letter = template.body.replace(SLOT, (whole, name: string, fallback?: string) => {
    const value = values[name]?.trim();
    if (value) return value;
    const spare = fallback?.trim();
    if (spare) return spare;
    unfilled.add(name);
    return whole;
  });
  return { letter, unfilled: [...unfilled] };
}
