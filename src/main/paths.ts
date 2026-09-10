/** Where Cairn keeps things. */

import { app } from 'electron';
import { join, relative, resolve, sep } from 'node:path';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

/** Where the vault is, when it is not where Cairn would have put it. A pointer rather
 *  than a setting: it has to be readable before anything is open. */
function pointerFile(): string {
  return join(app.getPath('userData'), 'vault-location.json');
}

export function vaultDir(): string {
  try {
    const moved = JSON.parse(readFileSync(pointerFile(), 'utf8')) as { path?: unknown };
    if (typeof moved.path === 'string' && moved.path.trim() !== '') return moved.path;
  } catch {
    // No pointer, or one nothing can read. Either way the vault is where it started,
    // which is the answer that cannot be wrong.
  }
  return join(app.getPath('userData'), 'vault');
}

export function defaultVaultDir(): string {
  return join(app.getPath('userData'), 'vault');
}

/** Point Cairn at a vault somewhere else, or back at where it started. */
export function rememberVaultAt(path: string | null): void {
  if (path === null) { rmSync(pointerFile(), { force: true }); return; }
  writeFileSync(pointerFile(), JSON.stringify({ path }, null, 2), { mode: 0o600 });
}

export function vaultFile(): string {
  return join(vaultDir(), 'vault.db');
}

export function documentsDir(): string {
  return join(vaultDir(), 'documents');
}

export function templatesDir(): string {
  return join(vaultDir(), 'templates');
}

/** Source packs you added yourself. Kept in the vault directory rather than beside the
 *  code, so nothing you read is something that had to be committed to a repository. */
export function sourcePacksDir(): string {
  return join(vaultDir(), 'sources');
}

/** Your own job families, laid over the shipped sample. */
export function familiesFile(): string {
  return join(vaultDir(), 'families.json');
}

/** Vault-relative, forward-slashed, and refuses anything that escapes the vault.
 *  A stored path comes from user input often enough that this cannot be a convention. */
/** Your own catalogues, beside the ones Cairn ships. A language Cairn has never heard
 *  of works by dropping a file here, the way a feed or a family list does. */
export function languagesDir(): string {
  return join(vaultDir(), 'lang');
}

export function toVaultRelative(absolute: string): string {
  const root = resolve(vaultDir());
  const target = resolve(absolute);
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    throw new Error('That file is outside the vault, so Cairn will not record a path to it.');
  }
  return rel.split(sep).join('/');
}

export function fromVaultRelative(rel: string): string {
  const root = resolve(vaultDir());
  const target = resolve(root, rel);
  if (!target.startsWith(root + sep) && target !== root) {
    throw new Error('That path leaves the vault.');
  }
  return target;
}
