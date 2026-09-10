/** Every outbound request goes through here, or it does not happen.
 *  Nothing imports `fetch` directly, and a test fails the build if a second call site appears. */

import type { OutboundRecord } from '../../shared/types.js';

export type IdentifyAs = 'cairn' | 'generic' | 'nothing';

const AGENTS: Record<IdentifyAs, string | null> = {
  cairn: 'Cairn/1.0 (+https://github.com/kingletas/cairn)',
  generic: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  nothing: null,
};

export interface GateOptions {
  identifyAs: IdentifyAs;
  delayMs: number;
  timeoutMs: number;
  onRecord: (record: OutboundRecord) => void;
}

/** What a request carries when it is more than a read: a method, headers and a body. */
export interface Sending {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The next moment each host may be asked again.
 *  Per host rather than one clock, and the slot is reserved before the wait. */
const nextAllowed = new Map<string, number>();

/** A model running on this machine is the one case where there is no network to
 *  protect, so plain http is allowed to `localhost` and nowhere else. */
function isLoopback(target: URL): boolean {
  return target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '[::1]';
}

async function through(
  url: string,
  reason: string,
  options: GateOptions,
  sending: Sending,
  allowLoopback: boolean,
): Promise<{ ok: boolean; status: number; body: string }> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(allowLoopback && target.protocol === 'http:' && isLoopback(target))) {
    throw new Error(`Refusing to fetch ${target.protocol}//${target.host} -- Cairn only speaks https.`);
  }

  const now = Date.now();
  const turn = Math.max(now, nextAllowed.get(target.host) ?? 0);
  nextAllowed.set(target.host, turn + options.delayMs);
  if (turn > now) await sleep(turn - now);

  const headers: Record<string, string> = {
    accept: 'application/json, text/html;q=0.9',
    ...(sending.headers ?? {}),
  };
  const agent = AGENTS[options.identifyAs];
  if (agent) headers['user-agent'] = agent;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  let ok = false;
  let body = '';
  try {
    const response = await fetch(target, {
      method: sending.method,
      headers,
      ...(sending.body === undefined ? {} : { body: sending.body }),
      signal: controller.signal,
      redirect: 'follow',
    });
    ok = response.ok;
    body = await response.text();
    return { ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
    options.onRecord({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      host: target.host,
      reason,
      ok,
      // What came back plus what went, so a request carrying a resume is not recorded
      // as though it had asked for something and sent nothing.
      bytes: body.length + (sending.body?.length ?? 0),
    });
  }
}

/** Fetch, count it, log it, and be polite about spacing.
 *  `reason` is written for a person to read in the privacy panel, not for a machine. */
export async function fetchThrough(
  url: string,
  reason: string,
  options: GateOptions,
): Promise<{ ok: boolean; status: number; body: string }> {
  return through(url, reason, options, { method: 'GET' }, false);
}

/** Send a body, counted and listed exactly as a read is.
 *  A provider is being asked rather than crawled, so there is no politeness delay. */
export async function sendThrough(
  url: string,
  reason: string,
  options: GateOptions,
  sending: Sending,
): Promise<{ ok: boolean; status: number; body: string }> {
  return through(url, reason, { ...options, delayMs: 0 }, sending, true);
}
