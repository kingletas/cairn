/** Ask whichever provider was brought, and hand back both the answer and the row that
 *  records it. Every request here goes through the same gate a job board does. */

import { randomUUID } from 'node:crypto';
import type { AssistantProvider, AssistantRun, AssistantTask } from '../../shared/types.js';
import type { GateOptions } from '../net/gate.js';
import { anthropicComplete, anthropicModels } from './anthropic.js';
import { openAiComplete, openAiModels } from './openai.js';
import type { AssistantOutcome, AssistantRequest } from './provider.js';

/** Every model the key can reach, asked of the provider rather than shipped by Cairn. */
export async function listModels(
  provider: AssistantProvider, key: string, gate: GateOptions,
): Promise<{ id: string; label: string }[]> {
  return provider.kind === 'anthropic'
    ? anthropicModels(provider.base, key, gate)
    : openAiModels(provider.base, key, gate);
}

/** Whether this provider can search and cite. Only Anthropic's protocol has a way to
 *  return a source, so research is offered there and absent everywhere else. */
export function canGround(provider: AssistantProvider): boolean {
  return provider.kind === 'anthropic';
}

export async function runTask(options: {
  provider: AssistantProvider;
  key: string;
  request: AssistantRequest;
  task: AssistantTask;
  reason: string;
  about: string | null;
  gate: GateOptions;
}): Promise<{ outcome: AssistantOutcome; run: AssistantRun }> {
  const { provider, request, task } = options;
  const outcome = provider.kind === 'anthropic'
    ? await anthropicComplete(provider.base, options.key, request, options.reason, options.gate)
    : await openAiComplete(provider.base, options.key, request, options.reason, options.gate);

  const run: AssistantRun = {
    id: randomUUID(),
    at: new Date().toISOString(),
    task,
    providerId: provider.id,
    model: outcome.model,
    host: outcome.host,
    bytesOut: outcome.bytesOut,
    bytesIn: outcome.bytesIn,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    costEstimate: null,
    outcome: outcome.stoppedBecause,
    about: options.about,
  };
  return { outcome, run };
}
