/** Hiding what somebody would not want on a shared screen.
 *  The role stays and the employer and the money go: a demonstration of the app is
 *  about how it works, and who you are talking to and what they pay is the half that
 *  is nobody else's. */

const HIDDEN = '•••••';

let on = false;

/** Turned on and off in one place, so no screen can be showing the old answer. */
export function setScreenShare(hide: boolean): void {
  on = hide;
}

export function screenShareOn(): boolean {
  return on;
}

/** An employer, or the mask. Kept the same width as the mask everywhere so a row does
 *  not change shape when it is turned on. */
export function company(name: string): string {
  return on ? HIDDEN : name;
}

/** Anything with a figure in it. A pay line reads "$150,000–$180,000 · they published
 *  it", and the words after the figures are worth keeping: what is private is the
 *  number, not that the employer stated one. */
export function amounts(text: string): string {
  return on ? text.replace(/[\d][\d,.\s]*/g, '•••') : text;
}
