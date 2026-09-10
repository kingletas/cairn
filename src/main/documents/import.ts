/** Bringing a file into the vault. */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { documentsDir, toVaultRelative } from '../paths.js';
import { formatOf, freeName, safeName } from './naming.js';
import type { DocumentRecord, DocumentVersion } from '../../shared/types.js';

/** Anything larger than this is not a résumé, and copying it into the vault is a
 *  mistake somebody would rather be told about than discover later. */
const SIZE_LIMIT = 25 * 1024 * 1024;

export class ImportRefused extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ImportRefused';
  }
}

export function importDocument(
  sourcePath: string,
  kind: DocumentRecord['kind'],
  note: string,
  held: DocumentRecord['held'] = 'copied',
): DocumentRecord {
  if (!existsSync(sourcePath)) throw new ImportRefused('That file is not there any more.');

  const size = statSync(sourcePath).size;
  if (size === 0) throw new ImportRefused('That file is empty.');
  if (size > SIZE_LIMIT) {
    throw new ImportRefused(
      `That file is ${Math.round(size / 1024 / 1024)} MB, which is far larger than a résumé. ` +
        'Cairn has not copied it.',
    );
  }

  // A linked file is left exactly where it is and the record points at it. Nothing is
  // written into the vault, which is the whole difference and also the whole risk.
  if (held === 'linked') {
    return {
      id: randomUUID(),
      kind,
      title: basename(sourcePath).replace(/\.[^.]+$/, ''),
      relativePath: sourcePath,
      held,
      format: formatOf(sourcePath),
      isDefault: false,
      note,
      usedCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  mkdirSync(documentsDir(), { recursive: true });
  const name = freeName(safeName(basename(sourcePath)),
    (candidate) => existsSync(join(documentsDir(), candidate)));
  const target = join(documentsDir(), name);
  copyFileSync(sourcePath, target);

  return {
    id: randomUUID(),
    kind,
    title: name.replace(/\.[^.]+$/, ''),
    relativePath: toVaultRelative(target),
    held,
    format: formatOf(name),
    isDefault: false,
    note,
    usedCount: 0,
    updatedAt: new Date().toISOString(),
  };
}


/** Replace what a document points at, keeping the file it used to be.
 *  The old file stays where it is and the record moves to the new one, so an
 *  application that recorded a version still points at the bytes that went. */
export function replaceDocument(
  record: DocumentRecord,
  sourcePath: string,
  currentAbsolutePath: string,
  now = new Date(),
): { record: DocumentRecord; version: DocumentVersion } {
  const fresh = importDocument(sourcePath, record.kind, record.note);
  return {
    record: {
      ...record,
      relativePath: fresh.relativePath,
      format: fresh.format,
      updatedAt: now.toISOString(),
    },
    version: {
      id: randomUUID(),
      documentId: record.id,
      relativePath: record.relativePath,
      format: record.format,
      bytes: existsSync(currentAbsolutePath) ? statSync(currentAbsolutePath).size : 0,
      replacedAt: now.toISOString(),
    },
  };
}
