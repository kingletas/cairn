/** What ships with the app, and what does not. Nothing here describes a person, and a
 *  test enforces it. */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Family } from '../plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultsDir = join(here, '../../../defaults');

export function defaultsFile(name: string): string {
  return join(defaultsDir, name);
}

export interface Defaults {
  sources: unknown;
  families: unknown;
  settings: unknown;
  questions: unknown;
  boards: unknown;
}

function read(name: string): unknown {
  return JSON.parse(readFileSync(defaultsFile(name), 'utf8'));
}

export function loadDefaults(): Defaults {
  return {
    sources: read('sources.json'),
    families: read('families.json'),
    settings: read('settings.json'),
    questions: read('questions.json'),
    boards: read('boards.json'),
  };
}

function familiesIn(value: unknown): Family[] {
  const root = (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const list = Array.isArray(root['families']) ? root['families'] : [];
  return list.flatMap((entry): Family[] => {
    const one = (entry !== null && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const id = typeof one['id'] === 'string' ? one['id'] : null;
    if (id === null) return [];
    const titles = Array.isArray(one['titles'])
      ? one['titles'].filter((title): title is string => typeof title === 'string' && title.trim().length > 0)
      : [];
    if (titles.length === 0) return [];
    return [{ id, label: typeof one['label'] === 'string' ? one['label'] : id, titles }];
  });
}

/** The shipped sample, with your own file laid over it. */
export interface Families {
  families: Family[];
  /** The ids that came from your file, so the app can say which are yours to edit. */
  yours: string[];
  replaceShipped: boolean;
  problem: string | null;
}

export function loadFamilies(localFile: string | null): Families {
  const shipped = familiesIn(loadDefaults().families);
  const sample: Families = { families: shipped, yours: [], replaceShipped: false, problem: null };
  if (localFile === null) return sample;

  let body: string;
  try {
    body = readFileSync(localFile, 'utf8');
  } catch {
    // No file is the ordinary case for a fresh install, not a problem worth a sentence.
    return sample;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ...sample, problem: 'Your job families file is not valid JSON, so the shipped sample is still in use.' };
  }

  const mine = familiesIn(parsed);
  const replaceShipped = (parsed as Record<string, unknown>)['replaceShipped'] === true;
  const yours = mine.map((family) => family.id);
  if (mine.length === 0) {
    return replaceShipped
      ? { ...sample, problem: 'Your job families file is empty, so the shipped sample is still in use.' }
      : sample;
  }
  if (replaceShipped) return { families: mine, yours, replaceShipped, problem: null };

  const byId = new Map(shipped.map((family) => [family.id, family]));
  for (const family of mine) byId.set(family.id, family);
  return { families: [...byId.values()], yours, replaceShipped, problem: null };
}

/** Write the families you edited in the app. Anything with no titles is dropped rather
 *  than saved: a family that searches for nothing is a chip that does nothing, and it
 *  would take a slot in every run. */
export function saveFamilies(localFile: string, families: readonly Family[], replaceShipped: boolean): Family[] {
  const cleaned = families.flatMap((family): Family[] => {
    const id = family.id.trim();
    const titles = family.titles.map((title) => title.trim()).filter((title) => title.length > 0);
    if (id.length === 0 || titles.length === 0) return [];
    return [{ id, label: family.label.trim() === '' ? id : family.label.trim(), titles }];
  });
  if (cleaned.length === 0 && replaceShipped) {
    throw new Error('That would leave nothing to search for. Keep at least one family, or turn the shipped sample back on.');
  }
  mkdirSync(dirname(localFile), { recursive: true });
  writeFileSync(localFile, `${JSON.stringify({
    note: 'Job families you edited in Cairn. Yours, and not part of the app.',
    replaceShipped,
    families: cleaned,
  }, null, 2)}\n`, 'utf8');
  return cleaned;
}

/** Throw yours away and go back to the shipped sample. */
export function resetFamilies(localFile: string): void {
  rmSync(localFile, { force: true });
}
