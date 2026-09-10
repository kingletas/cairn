/** What is about to leave, in full and unsummarised, so it can be read before it goes.
 *  Pure, and it never receives the key -- only how much of one there is. */

import type { AssistantProvider, AssistantTask } from '../../shared/types.js';
import { estimateTokens, hostOf, redactKey, type AssistantRequest } from './provider.js';

export interface Leaving {
  task: AssistantTask;
  host: string;
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  bytes: number;
  estimatedTokens: number;
  key: string;
  grounded: boolean;
  /** Where the provider publishes what this costs. Cairn ships no price table,
   *  because a stale figure is worse than none. */
  pricing: string;
}

export function whatLeaves(
  task: AssistantTask,
  request: AssistantRequest,
  provider: AssistantProvider,
  key: string,
  pricing: string,
): Leaving {
  const bytes = JSON.stringify({ system: request.system, messages: request.messages }).length;
  return {
    task,
    host: hostOf(provider.base),
    model: request.model,
    system: request.system,
    messages: request.messages.map((one) => ({ role: one.role, content: one.content })),
    bytes,
    estimatedTokens: estimateTokens(request),
    key: redactKey(key),
    grounded: request.grounded === true,
    pricing,
  };
}
