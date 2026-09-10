/** The languages the interface can be shown in: the ones Cairn ships, and any you
 *  dropped into your own vault. A catalogue is phrases keyed by the English phrase. */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultsFile } from './defaults.js';
import { languagesDir } from '../paths.js';

export interface Language {
  code: string;
  /** What speakers of it call it, so a picker reads to the person choosing. */
  name: string;
  /** True for one Cairn ships, false for one from your vault. */
  shipped: boolean;
}

interface Catalogue {
  name?: unknown;
  phrases?: unknown;
}

const shippedDir = (): string => defaultsFile('lang');

function read(path: string): Catalogue | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    // A catalogue that will not parse is one language missing, not a broken app.
    return null;
  }
}

function codesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^[a-z]{2}(-[A-Za-z]{2,4})?\.json$/.test(file))
    .map((file) => file.replace(/\.json$/, ''));
}

/** English is always first and is never a file: it is the language the phrases are
 *  written in, so there is nothing to look up. */
export function languages(): Language[] {
  const found = new Map<string, Language>([['en', { code: 'en', name: 'English', shipped: true }]]);
  for (const [dir, shipped] of [[shippedDir(), true], [languagesDir(), false]] as const) {
    for (const code of codesIn(dir)) {
      const catalogue = read(join(dir, `${code}.json`));
      if (catalogue === null) continue;
      found.set(code, {
        code,
        name: typeof catalogue.name === 'string' && catalogue.name !== '' ? catalogue.name : code,
        shipped,
      });
    }
  }
  return [...found.values()];
}

/** The phrases for a language, with your own file laid over the shipped one, so
 *  changing a single line does not mean carrying a copy of the whole catalogue. */
export function phrasesFor(code: string): Record<string, string> {
  if (code === 'en') return {};
  const merged: Record<string, string> = {};
  for (const dir of [shippedDir(), languagesDir()]) {
    const catalogue = read(join(dir, `${code}.json`));
    const phrases = catalogue?.phrases;
    if (typeof phrases !== 'object' || phrases === null) continue;
    for (const [english, said] of Object.entries(phrases as Record<string, unknown>)) {
      if (typeof said === 'string') merged[english] = said;
    }
  }
  return merged;
}

/** Every phrase the interface can show, shipped so somebody writing a catalogue has
 *  the source list rather than having to find the strings themselves. */
export function sourcePhrases(): { phrases: string[]; notYet: number } {
  try {
    const parsed = JSON.parse(readFileSync(join(shippedDir(), 'phrases.json'), 'utf8')) as {
      phrases?: unknown; notYet?: unknown;
    };
    return {
      phrases: Array.isArray(parsed.phrases)
        ? parsed.phrases.filter((one): one is string => typeof one === 'string')
        : [],
      notYet: typeof parsed.notYet === 'number' ? parsed.notYet : 0,
    };
  } catch {
    return { phrases: [], notYet: 0 };
  }
}

/** Somewhere to put your own, made on demand so the folder is never an empty promise. */
export function makeLanguagesDir(): string {
  const dir = languagesDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
