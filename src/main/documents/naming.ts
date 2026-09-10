/** Working out what a file should be called once it is in the vault. */

import { extname } from 'node:path';

export type DocumentFormat = 'pdf' | 'markdown' | 'docx' | 'other';

const FORMATS: Record<string, DocumentFormat> = {
  '.pdf': 'pdf', '.md': 'markdown', '.markdown': 'markdown', '.txt': 'markdown',
  '.docx': 'docx', '.rtf': 'other', '.odt': 'other',
};

export function formatOf(path: string): DocumentFormat {
  return FORMATS[extname(path).toLowerCase()] ?? 'other';
}

/** Strip a filename back to something safe to write. It comes from a file the user
 *  chose, so it is not trusted with a path separator or a pair of dots. */
export function safeName(name: string): string {
  // Both separators, always. `basename` follows the platform, so the same file gave a
  // different name on Windows -- and a vault is a thing people move between machines.
  const last = name.split(/[/\\]/).pop() ?? '';
  const cleaned = last
    .replace(/[/\\]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .replace(/\s+/g, ' ')
    // A leading dot makes a hidden file, which is a poor place to keep the résumé
    // somebody is looking for.
    .replace(/^[.\s]+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'document';
}

/** A name nothing in the folder has, so importing twice never silently replaces the
 *  copy that already went to somebody. The suffix goes before the extension. */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  let candidate = name;
  for (let n = 2; taken(candidate); n += 1) {
    candidate = `${stem} (${n})${extension}`;
  }
  return candidate;
}
