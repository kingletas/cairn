/** A very small amount of DOM help, so views read as markup rather than as plumbing.
 *  Every string the interface shows passes through here, which is why this is where it
 *  is translated: 648 call sites needed no change at all. */

import { t } from '../i18n.js';

/** Attributes somebody reads. A class or a data key is not one of them. */
const SPOKEN = new Set(['aria-label', 'title', 'placeholder', 'alt']);

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on') && typeof value === 'string') continue;
    // Styles go through the object, never the attribute. The page runs under a policy
    // with no `unsafe-inline`, which drops a `style` attribute with nothing to say why.
    else if (key === 'style') node.style.cssText = String(value);
    else node.setAttribute(key, SPOKEN.has(key) ? t(String(value)) : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(t(child)) : child);
  }
  return node;
}

/** A run of text for an element you already hold, translated the same way el() does it.
 *  Appending a bare string instead puts English on the screen in every language. */
export function words(text: string): Text {
  return document.createTextNode(t(text));
}

export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
): void {
  node.addEventListener(event, handler);
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Bytes as a person reads them. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What went wrong, in the words it was written in. */
export function saying(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:\w*Error|NotAQuery|PackRejected|VaultLocked|VaultDamaged|SourceShapeChanged|RenderFailed):\s*/, '')
    .trim();
}
