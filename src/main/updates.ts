/** Whether a release is newer than the one running.
 *  Pure, so the comparison can be tested without asking anybody's server. */

/** A version as numbers, or null when it is not one Cairn can compare. */
function parts(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split('.').map(Number);
}

/** The published tag when it is ahead of what is running, and null otherwise.
 *  Null covers a tag Cairn cannot read: saying nothing beats claiming an update
 *  because a release was named something unexpected. */
export function newerRelease(running: string, published: string): string | null {
  const here = parts(running);
  const there = parts(published);
  if (here === null || there === null) return null;

  const length = Math.max(here.length, there.length);
  for (let at = 0; at < length; at += 1) {
    const a = here[at] ?? 0;
    const b = there[at] ?? 0;
    if (b > a) return published.trim();
    if (b < a) return null;
  }
  return null;
}

/** The tag on the latest release, out of what GitHub answered. */
export function tagFrom(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { tag_name?: unknown };
    return typeof parsed.tag_name === 'string' ? parsed.tag_name : null;
  } catch {
    return null;
  }
}
