/** Redraw the whole interface from what is actually on disk.
 *  The window refuses to navigate, so `location.reload()` does nothing at all: every
 *  screen that changes the world has to ask for the redraw instead. */

let again: (() => void) | null = null;

export function onRestart(redraw: () => void): void {
  again = redraw;
}

export function restart(): void {
  if (again === null) throw new Error('Nothing has said how to redraw the interface.');
  again();
}
