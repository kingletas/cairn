/** Letters on disk, and the record of what went out. */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { documentsDir, toVaultRelative } from '../paths.js';
import type { DocumentRecord } from '../../shared/types.js';
import type { Repo } from '../repo.js';

export class WouldOverwrite extends Error {
  constructor(name: string) {
    super(`${name} already exists. If it went to an employer, it is the only copy of what they read.`);
    this.name = 'WouldOverwrite';
  }
}

/** A filename from a company name, which is user input on its way to the filesystem. */
function letterFilename(displayName: string, company: string): string {
  const clean = (text: string): string =>
    text.replace(/[^\p{L}\p{N} .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const who = clean(displayName) || 'Cover letter';
  const where = clean(company) || 'application';
  return `${who} — Cover letter — ${where}.pdf`;
}

export function saveLetter(
  repo: Repo,
  pdf: Buffer,
  displayName: string,
  company: string,
  overwrite: boolean,
): DocumentRecord {
  mkdirSync(documentsDir(), { recursive: true });
  const name = letterFilename(displayName, company);
  const target = join(documentsDir(), name);

  // The path is derived from a company name, so it is checked rather than trusted.
  const relative = toVaultRelative(target);
  if (relative.includes('..')) throw new Error('That company name produced a path outside the vault.');

  if (existsSync(target) && !overwrite) throw new WouldOverwrite(name);
  writeFileSync(target, pdf, { mode: 0o600 });

  const record: DocumentRecord = {
    id: randomUUID(),
    kind: 'cover-letter',
    title: name.replace(/\.pdf$/, ''),
    relativePath: relative,
    format: 'pdf',
    held: 'copied',
    isDefault: false,
    note: '',
    usedCount: 0,
    updatedAt: new Date().toISOString(),
  };
  repo.saveDocument(record);
  return record;
}
