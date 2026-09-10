/** Anthropic's own protocol, as raw requests through the one gate.
 *  A client library would open its own sockets, and Cairn's whole claim is that
 *  nothing does. */

import { sendThrough, type GateOptions } from '../net/gate.js';
import {
  endpoint, explainStatus, hostOf, type AssistantOutcome, type AssistantRequest,
} from './provider.js';

const VERSION = '2023-06-01';

/** The web search tool, which is what makes a sourced answer possible at all. */
const SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 };

interface TextBlock {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string; cited_text?: string }[];
}

interface Reply {
  content?: TextBlock[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function headers(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'anthropic-version': VERSION,
    'content-type': 'application/json',
  };
}

/** Every model the key can reach, in the provider's own words rather than a list
 *  Cairn ships and has to keep true. */
export async function anthropicModels(
  base: string, key: string, gate: GateOptions,
): Promise<{ id: string; label: string }[]> {
  const response = await sendThrough(
    endpoint(base, '/v1/models?limit=100'), 'Asking your assistant which models it offers', gate,
    { method: 'GET', headers: headers(key) },
  );
  if (!response.ok) throw new Error(explainStatus(response.status, hostOf(base)));
  const body = JSON.parse(response.body) as { data?: { id?: string; display_name?: string }[] };
  return (body.data ?? [])
    .filter((one): one is { id: string; display_name?: string } => typeof one.id === 'string')
    .map((one) => ({ id: one.id, label: one.display_name ?? one.id }));
}

export async function anthropicComplete(
  base: string, key: string, request: AssistantRequest, reason: string, gate: GateOptions,
): Promise<AssistantOutcome> {
  const body = JSON.stringify({
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
    output_config: { effort: request.effort },
    ...(request.grounded === true ? { tools: [SEARCH] } : {}),
  });

  const response = await sendThrough(endpoint(base, '/v1/messages'), reason, gate, {
    method: 'POST', headers: headers(key), body,
  });

  if (!response.ok) {
    const said = (JSON.parse(response.body || '{}') as Reply).error?.message;
    throw new Error(said ?? explainStatus(response.status, hostOf(base)));
  }

  const reply = JSON.parse(response.body) as Reply;
  const blocks = (reply.content ?? []).filter((block) => block.type === 'text');
  const text = blocks.map((block) => block.text ?? '').join('');
  const citations = blocks.flatMap((block) => block.citations ?? []).flatMap((one) =>
    typeof one.url === 'string'
      ? [{ url: one.url, title: one.title ?? one.url, quoted: one.cited_text ?? '' }]
      : []);

  return {
    text,
    json: null,
    citations,
    tokensIn: reply.usage?.input_tokens ?? 0,
    tokensOut: reply.usage?.output_tokens ?? 0,
    stoppedBecause:
      reply.stop_reason === 'max_tokens' ? 'length'
      : reply.stop_reason === 'refusal' ? 'refused'
      : 'done',
    model: reply.model ?? request.model,
    host: hostOf(base),
    bytesOut: body.length,
    bytesIn: response.body.length,
  };
}
