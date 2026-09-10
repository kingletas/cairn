/** Checking that a rendered letter actually arrived on the page. */

import { inflateSync } from 'node:zlib';

export class RenderFailed extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'RenderFailed';
  }
}

/** Text drawn per non-space character of the letter. Below this the page is blank or
 *  cut short. A healthy render measures around 2.4 -- the figure is a generous proxy
 *  rather than an exact glyph count, and the floor is set well under it so the check
 *  only ever fires on a page that is genuinely empty. */
const TEXT_FLOOR = 0.6;

export interface RenderCheck {
  bytes: number;
  pages: number;
  /** A proxy for how much text is on the page, not an exact glyph count. */
  drawn: number;
  characters: number;
}

/** How much text is drawn, across the inflated content streams. */
function countDrawnText(pdf: Buffer): number {
  const latin = pdf.toString('latin1');
  const streams = /stream\r?\n/g;
  let digits = 0;
  let match: RegExpExecArray | null;
  while ((match = streams.exec(latin)) !== null) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end === -1) continue;
    let content: string;
    try {
      content = inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      continue;
    }
    for (const show of content.match(/(?:<[0-9A-Fa-f]*>|\([^)]*\))\s*(?:Tj|TJ)|\[[^\]]*\]\s*TJ/g) ?? []) {
      for (const hex of show.match(/<([0-9A-Fa-f]*)>/g) ?? []) {
        digits += hex.length - 2;
      }
      for (const literal of show.match(/\(([^)]*)\)/g) ?? []) {
        digits += (literal.length - 2) * 2;
      }
    }
  }
  return Math.floor(digits / 2);
}

function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export function checkPdf(pdf: Buffer, letter: string): RenderCheck {
  if (!pdf.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    throw new RenderFailed('What came back is not a PDF.');
  }
  const characters = letter.replace(/\s/g, '').length;
  const drawn = countDrawnText(pdf);
  const pages = countPages(pdf);

  if (characters > 0 && drawn / characters < TEXT_FLOOR) {
    throw new RenderFailed(
      'The page came out nearly empty — almost none of the letter reached it. Nothing has been saved.',
    );
  }
  return { bytes: pdf.length, pages, drawn, characters };
}

