/** Reading source packs off disk, taking one in from elsewhere, and saving the ones
 *  you write in the app.
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readPack, PackRejected, type SourceDefinition } from './pack.js';

/** A pack is a field map, not a data set. Anything this size is something else, and
 *  reading it into memory before finding that out is the mistake. */
const MOST_BYTES = 256 * 1024;

/** What the app writes. Packs you imported keep their own filenames and are left
 *  alone -- rewriting somebody else's file would lose whatever else was in it. */
export const YOUR_FEEDS = 'your-feeds.json';

export interface Sourced {
  definition: SourceDefinition;
  /** Which file it came from, so a message about it names something you can open. */
  origin: string;
  /** A shipped feed is meant to be replaced by yours and that is not worth a sentence.
   *  Two of your own files claiming one id is ambiguity, and is. */
  shipped: boolean;
}

export interface Library {
  /** In precedence order: later replaces earlier by id. */
  entries: Sourced[];
  /** One sentence per pack that could not be read. Never thrown: one bad file must not
   *  take the good ones down with it. */
  problems: string[];
  /** The pack files in your vault, so the app can list and remove them. */
  files: { file: string; sources: string[] }[];
}

function readOne(file: string, shipped: boolean, into: Library): void {
  const name = basename(file);
  try {
    if (statSync(file).size > MOST_BYTES) {
      into.problems.push(`${name} is too big to be a source pack, so it was not read.`);
      return;
    }
    const definitions = readPack(name, readFileSync(file, 'utf8'));
    for (const definition of definitions) into.entries.push({ definition, origin: name, shipped });
    if (!shipped) into.files.push({ file: name, sources: definitions.map((one) => one.id) });
  } catch (cause) {
    into.problems.push(cause instanceof PackRejected
      ? cause.message
      : `${name} could not be read: ${String(cause instanceof Error ? cause.message : cause)}`);
  }
}

export function loadLibrary(shippedFile: string, localDir: string): Library {
  const library: Library = { entries: [], problems: [], files: [] };
  readOne(shippedFile, true, library);
  for (const file of localPacks(localDir)) readOne(file, false, library);
  return library;
}

/** Imported packs first, then your own file, because a feed you edited in the app is
 *  the most deliberate statement about it and should win. */
function localPacks(localDir: string): string[] {
  try {
    const names = readdirSync(localDir).filter((name) => name.endsWith('.json')).sort();
    return [...names.filter((name) => name !== YOUR_FEEDS), ...names.filter((name) => name === YOUR_FEEDS)]
      .map((name) => join(localDir, name));
  } catch {
    // No folder yet is the ordinary case, not a problem worth a sentence.
    return [];
  }
}

/** The feeds you wrote or edited in the app. A file that has become unreadable gives
 *  back nothing rather than throwing: the screen that would show you the problem is
 *  the same screen this feeds. */
export function readYourFeeds(localDir: string): SourceDefinition[] {
  try {
    return readPack(YOUR_FEEDS, readFileSync(join(localDir, YOUR_FEEDS), 'utf8'));
  } catch {
    return [];
  }
}

/** Written through the same reader that judges an imported file, so a feed made in the
 *  app and one that arrived in a pack are held to one standard. */
export function writeYourFeeds(localDir: string, definitions: readonly SourceDefinition[]): SourceDefinition[] {
  const body = JSON.stringify({
    note: 'Feeds you added or edited in Cairn. Yours, and not part of the app.',
    sources: definitions,
  }, null, 2);
  const checked = readPack(YOUR_FEEDS, body);
  mkdirSync(localDir, { recursive: true });
  writeFileSync(join(localDir, YOUR_FEEDS), `${body}\n`, 'utf8');
  return checked;
}

/** Only a name, and only the safe part of one. The file being imported was chosen in a
 *  file dialog, so its name is whatever somebody called it. */
function safeName(file: string): string {
  const name = basename(file).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '');
  return name.endsWith('.json') ? name : `${name}.json`;
}

export interface Imported {
  file: string;
  sources: string[];
}

/** Read it, refuse it if it is not a pack, and only then keep a copy. A file that
 *  lands in the folder and fails at the next startup is a feed that disappears without
 *  a word. */
export function importPack(localDir: string, chosen: string): Imported {
  if (statSync(chosen).size > MOST_BYTES) {
    throw new PackRejected(basename(chosen), 'this is too big to be a source pack');
  }
  const definitions = readPack(basename(chosen), readFileSync(chosen, 'utf8'));
  if (definitions.length === 0) {
    throw new PackRejected(basename(chosen), 'there are no feeds in it');
  }
  mkdirSync(localDir, { recursive: true });
  const file = join(localDir, safeName(chosen));
  copyFileSync(chosen, file);
  return { file: safeName(chosen), sources: definitions.map((one) => one.id) };
}

/** Remove a pack you imported. Only ever a file in your own folder, named from the
 *  list the app is showing rather than from anything typed. */
export function removePack(localDir: string, file: string): boolean {
  const name = safeName(file);
  if (!localPacks(localDir).some((path) => basename(path) === name)) return false;
  rmSync(join(localDir, name), { force: true });
  return true;
}
