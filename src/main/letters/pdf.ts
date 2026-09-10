/** Turning a letter into the file an employer receives. */

import { BrowserWindow } from 'electron';
import { checkPdf, type RenderCheck } from './verify.js';

export { RenderFailed, checkPdf } from './verify.js';
export type { RenderCheck } from './verify.js';

/** Print in a window of its own, off screen, with no preload and nothing fetched from
 *  anywhere. The letter arrives as a data URL rather than a file, so nothing is
 *  written to disk that then has to be cleaned up.
 */
export async function renderLetter(letter: string, stylesheet: string): Promise<{ pdf: Buffer; check: RenderCheck }> {
  const paragraphs = letter
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${stylesheet}</style></head><body>${paragraphs}</body></html>`;

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true, javascript: false, images: false,
      nodeIntegration: false, contextIsolation: true, webSecurity: true,
    },
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await window.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: false,
      margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
    });
    return { pdf, check: checkPdf(pdf, letter) };
  } finally {
    window.destroy();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
