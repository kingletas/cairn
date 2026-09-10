/** What every provider has to be able to do, and the shape of what it answers with.
 *  Pure: it reaches no network and no `electron`, so every rule here is testable. */

import type { AssistantCitation, AssistantKind } from '../../shared/types.js';

/** One request, before any provider has turned it into their own wire format. */
export interface AssistantRequest {
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  /** How hard the model should work, where the provider offers a choice. */
  effort: 'low' | 'medium' | 'high';
  /** Ask the provider to search and cite. Refused by a provider that cannot ground. */
  grounded?: boolean;
}

export type Citation = AssistantCitation;

export interface AssistantOutcome {
  text: string;
  json: unknown | null;
  citations: Citation[];
  tokensIn: number;
  tokensOut: number;
  stoppedBecause: 'done' | 'length' | 'refused' | 'error';
  model: string;
  host: string;
  bytesOut: number;
  bytesIn: number;
}

/** One entry in the shipped catalogue: how to reach a provider, and where its own
 *  pages are. It carries no key and no price. */
export interface ProviderPreset {
  id: string;
  label: string;
  kind: AssistantKind;
  base: string;
  model: string;
  grounded: boolean;
  docs: string;
  pricing: string;
  keys: string;
}

/** A key, as it may be shown. Three characters is enough to tell two keys apart and
 *  not enough to use one. */
export function redactKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) return 'none';
  return `${trimmed.slice(0, 3)}${'•'.repeat(Math.min(12, Math.max(3, trimmed.length - 3)))}`;
}

/** Roughly how many tokens a request is, for saying how big it is before it goes.
 *  Four characters to a token is the usual rule of thumb and it is labelled a guess. */
export function estimateTokens(request: AssistantRequest): number {
  const characters = request.system.length
    + request.messages.reduce((total, message) => total + message.content.length, 0);
  return Math.ceil(characters / 4);
}

/** The host a request would reach, for the panel that names it before sending. */
export function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/** A base address Cairn will speak to, or why it will not. Loopback may be plain http
 *  because there is no network between here and there; nothing else may. */
export function baseProblem(base: string): string | null {
  const trimmed = base.trim();
  if (trimmed === '') return 'Enter the address the provider gave you.';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'That is not an address Cairn can reach. It should start with https://.';
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol === 'http:' && loopback) return null;
  if (url.protocol !== 'https:') {
    return 'Cairn only speaks https, except to a model running on this machine.';
  }
  return null;
}

/** Trim a trailing slash so joining a path cannot produce a double one. */
export function endpoint(base: string, path: string): string {
  return `${base.trim().replace(/\/+$/, '')}${path}`;
}

/** What came back, when what came back was not what was asked for. Written for a
 *  person: the status alone reads as a fault in Cairn rather than at the far end. */
export function explainStatus(status: number, host: string): string {
  if (status === 401 || status === 403) return `${host} refused the key. Check it in Settings.`;
  if (status === 404) return `${host} has no such address. Check the base address and the model name.`;
  if (status === 429) return `${host} is asking you to slow down. Try again in a minute.`;
  if (status >= 500) return `${host} is having trouble at their end. Nothing was charged for a failed request.`;
  return `${host} answered ${status}.`;
}
