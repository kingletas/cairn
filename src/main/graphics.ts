/** Whether to use the graphics card, and what to say about the last time it went.
 *  The launcher script does this for a checkout; a packaged Cairn has no launcher.
 *  Pure: it takes the paths rather than asking `electron` for them, so it is testable. */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** The same file the launcher uses, so the two never hold different opinions about
 *  whether this machine has crashed. */
export function markerPath(userData: string): string {
  if (process.platform === 'linux') {
    const state = process.env['XDG_STATE_HOME'] ?? join(homedir(), '.local/state');
    return join(state, 'cairn', 'graphics-crashed');
  }
  return join(userData, 'graphics-crashed');
}

export function graphicsCrashedBefore(marker: string): boolean {
  return existsSync(marker);
}

/** Once a machine has shown it crashes, stop making it prove it every launch. */
export function rememberGraphicsCrashed(marker: string): void {
  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch {
    // Somewhere unwritable. Falling back every time is worse than crashing every time,
    // but not by enough to take the app down over.
  }
}

function forgetGraphicsCrash(marker: string): boolean {
  if (!existsSync(marker)) return false;
  rmSync(marker, { force: true });
  return true;
}

/** The flags that answer and stop rather than opening a window. True when one was
 *  handled, and the caller exits. */
export function answeredOnTheCommandLine(
  argv: readonly string[], crashLog: string, marker: string,
): boolean {
  if (argv.includes('--crashes')) {
    const said = existsSync(crashLog) ? readFileSync(crashLog, 'utf8').trimEnd() : '';
    process.stdout.write(said === ''
      ? 'Cairn has recorded no crashes on this machine.\n'
      : `${said}\n`);
    return true;
  }
  if (argv.includes('--try-graphics')) {
    process.stdout.write(forgetGraphicsCrash(marker)
      ? 'Cairn will use the graphics card again next time it starts.\n'
      : 'Cairn was already using the graphics card.\n');
    return true;
  }
  return false;
}
