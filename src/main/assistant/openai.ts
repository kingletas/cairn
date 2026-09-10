/** The chat-completions shape, which OpenAI, Gemini, Mistral and Ollama all speak.
 *  One adapter reaches every provider that is not Anthropic. */

import { sendThrough, type GateOptions } from '../net/gate.js';
import {
  endpoint, explainStatus, hostOf, type AssistantOutcome, type AssistantRequest,
} from './provider.js';

interface Reply {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function headers(key: string): Record<string, string> {
  const built: Record<string, string> = { 'content-type': 'application/json' };
  // A model on this machine needs no key, and sending an empty bearer to one that
  // does not want it is refused by some servers.
  if (key.trim() !== '') built['authorization'] = `Bearer ${key.trim()}`;
  return built;
}

export async function openAiModels(
  base: string, key: string, gate: GateOptions,
): Promise<{ id: string; label: string }[]> {
  const response = await sendThrough(
    endpoint(base, '/v1/models'), 'Asking your assistant which models it offers', gate,
    { method: 'GET', headers: headers(key) },
  );
  if (!response.ok) throw new Error(explainStatus(response.status, hostOf(base)));
  const body = JSON.parse(response.body) as { data?: { id?: string }[] };
  return (body.data ?? [])
    .filter((one): one is { id: string } => typeof one.id === 'string')
    .map((one) => ({ id: one.id, label: one.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function openAiComplete(
  base: string, key: string, request: AssistantRequest, reason: string, gate: GateOptions,
): Promise<AssistantOutcome> {
  // No token cap is sent. The field is spelled differently by different servers and
  // one of them refuses the other's spelling, so the provider's own default is used.
  const body = JSON.stringify({
    model: request.model,
    messages: [{ role: 'system', content: request.system }, ...request.messages],
  });

  const response = await sendThrough(endpoint(base, '/v1/chat/completions'), reason, gate, {
    method: 'POST', headers: headers(key), body,
  });

  if (!response.ok) {
    const said = (JSON.parse(response.body || '{}') as Reply).error?.message;
    throw new Error(said ?? explainStatus(response.status, hostOf(base)));
  }

  const reply = JSON.parse(response.body) as Reply;
  const choice = reply.choices?.[0];

  return {
    text: choice?.message?.content ?? '',
    json: null,
    // This shape has no way to return a source, so nothing here can be grounded.
    citations: [],
    tokensIn: reply.usage?.prompt_tokens ?? 0,
    tokensOut: reply.usage?.completion_tokens ?? 0,
    stoppedBecause:
      choice?.finish_reason === 'length' ? 'length'
      : choice?.finish_reason === 'content_filter' ? 'refused'
      : 'done',
    model: reply.model ?? request.model,
    host: hostOf(base),
    bytesOut: body.length,
    bytesIn: response.body.length,
  };
}
