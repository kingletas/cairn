/** Writing down what died. */

import { app, crashReporter } from 'electron';
import type { BrowserWindow } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { markerPath, rememberGraphicsCrashed } from './graphics.js';

/** Electron's own answer per platform, rather than one platform's convention on all
 *  three: a Windows install was writing to a Linux path under the home directory. */
export function logDir(): string {
  return app.getPath('logs');
}

/** Where Chromium writes a dump when a process dies. A dump holds memory from the
 *  moment of the crash, which is why erasing everything has to include these. */
export function dumpDir(): string {
  return app.getPath('crashDumps');
}

export function crashLogPath(): string {
  return join(logDir(), 'crashes.log');
}

function note(line: string): void {
  try {
    mkdirSync(logDir(), { recursive: true });
    appendFileSync(crashLogPath(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Somewhere unwritable. A diagnostic that takes the app down to report a problem
    // is worse than the problem.
  }
  console.error(`cairn: ${line}`);
}

/** Set up before the app is ready, because a crash during startup is one of the ones
 *  worth catching. */
export function startDiagnostics(): void {
  crashReporter.start({ submitURL: '', uploadToServer: false, compress: false });
  note(`started · electron ${process.versions.electron} · ${process.platform} · session ${process.env['XDG_SESSION_TYPE'] ?? process.platform} · dumps in ${app.getPath('crashDumps')}`);

  app.on('child-process-gone', (_event, details) => {
    note(`child process gone · type=${details.type} reason=${details.reason} exit=${details.exitCode} ${details.name ?? ''}`);
    // A graphics process that was told to stop is not a crash, and remembering it as
    // one would put every machine on the slow path after a normal quit.
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
      rememberGraphicsCrashed(markerPath(app.getPath('userData')));
    }
  });

  app.on('gpu-process-crashed' as 'child-process-gone', () => {
    note('the gpu process crashed');
    rememberGraphicsCrashed(markerPath(app.getPath('userData')));
  });

  process.on('uncaughtException', (error) => {
    note(`uncaught in main · ${error.stack ?? error.message}`);
  });
}

/** Per window, because a renderer that dies takes only its own window with it and
 *  Electron carries on -- which is why this is worth distinguishing from the app
 *  simply vanishing. */
export function watchWindow(window: BrowserWindow): void {
  window.webContents.on('render-process-gone', (_event, details) => {
    note(`renderer gone · reason=${details.reason} exit=${details.exitCode}`);
  });
  window.webContents.on('unresponsive', () => note('renderer stopped responding'));
}
