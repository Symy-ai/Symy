// Stream separation design ported from anthropics/commerce-agents
// (commerce-common/commerce_common/turn.py, streaming.py, execution.py)
// Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0.
// TS port for WeAreAllMe chat streaming (use-chat-actions / consume-ai-stream).
//
// Core doctrine (fixes the P0 "reasoning leaked into bubble" bug class at the architecture
// level): an agent turn yields TYPED events; the host renders by event type and IGNORES
// types it does not know. Assistant-visible text comes ONLY from text_delta events.
// Reasoning/status/progress are separate event types that never enter the message body.

/** Discriminated union: one streamed event from an agent turn to its host. */
export type AgentStreamEvent =
  | { type: 'text_delta'; data: { text: string } }
  | { type: 'reasoning_delta'; data: { text: string } }
  | { type: 'status'; data: { label: string } }
  | { type: 'tool_call'; data: { tool: string; id: string; arguments: Record<string, unknown> } }
  | { type: 'tool_result'; data: { tool: string; id: string; summary: string; isError: boolean } }
  | { type: 'progress'; data: { message: string } }
  | { type: 'turn_complete'; data: { usage?: unknown } };

/** One channel of a turn stream, accumulated independently. */
export interface TurnChannels {
  text: string[];
  reasoning: string[];
}

export function newChannels(): TurnChannels {
  return { text: [], reasoning: [] };
}

/**
 * Route one event into its channel. Only `text_delta` appends to the bubble body;
 * `reasoning_delta` accumulates separately (host may render a collapsed "thinking"
 * affordance or drop it — it never reaches the message body).
 */
export function feedChannel(ch: TurnChannels, ev: AgentStreamEvent): TurnChannels {
  switch (ev.type) {
    case 'text_delta':
      if (ev.data.text) ch.text.push(ev.data.text);
      break;
    case 'reasoning_delta':
      if (ev.data.text) ch.reasoning.push(ev.data.text);
      break;
    default:
      break; // status/tool/progress/complete are host-side only
  }
  return ch;
}

/** The message body a user should see: ONLY the text channel, fenced of injections. */
export function visibleMessage(ch: TurnChannels): string {
  return ch.text.join('');
}

/**
 * Heuristic leak guard (belt over suspenders): if the text channel itself carries
 * first-person English reasoning-style lines (the failure observed 09-06: "The user
 * says... I should respond in Chinese..."), and the message also has a clean final
 * answer line, keep only from the last paragraph boundary. Conservative: only fires
 * when >80% of the text is ASCII AND matches reasoning openers on most lines.
 */
const REASONING_LINE = /^(?:the user|i should|i'll|i will|let me|okay,? so|first,|next,|now )/i;
export function stripLeakedReasoning(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 3) return text;
  const asciiChars = text.replace(/[^\x00-\x7f]/g, '').length;
  if (asciiChars / Math.max(1, text.length) < 0.8) return text; // mostly CJK = real reply
  const hits = lines.filter((l) => REASONING_LINE.test(l.trim())).length;
  if (hits / lines.length < 0.6) return text; // not reasoning-shaped
  // last non-empty paragraph that does NOT start like reasoning = the answer
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l && !REASONING_LINE.test(l)) return l;
  }
  return text; // fully reasoning-shaped: leave as-is (host should show something)
}
