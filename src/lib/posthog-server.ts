/**
 * PostHog server-side client for GenAI/LLM observability.
 *
 * Uses posthog-node (serverless-safe) to capture $ai_generation events.
 * These events power PostHog's "AI Observability" dashboard (token/cost/latency monitoring).
 */

import { PostHog } from 'posthog-node';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

let client: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (client) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    warnMissingEnvOnce('Product analytics');
    return null;
  }

  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

interface LLMGenerationParams {
  distinctId: string;
  input: string;
  output: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  isError?: boolean;
  errorMessage?: string;
  properties?: Record<string, unknown>;
}

/**
 * Capture an LLM generation event for PostHog GenAI observability.
 * Fire-and-forget — never blocks or fails the chat request.
 * Uses fireAndForgetSafely pattern to survive Vercel serverless lifecycle.
 */
export async function captureLLMGeneration(params: LLMGenerationParams): Promise<void> {
  const ph = getPostHogServer();
  if (!ph) return;

  try {
    ph.capture({
      distinctId: params.distinctId,
      event: '$ai_generation',
      properties: {
        $ai_model: params.model,
        $ai_input: params.input,
        $ai_output: params.output,
        $ai_latency_ms: params.latencyMs,
        $ai_input_tokens: params.promptTokens,
        $ai_output_tokens: params.completionTokens,
        $ai_total_tokens: params.totalTokens,
        $ai_provider: 'letta',
        ...params.properties,
        ...(params.isError ? { $ai_error: params.errorMessage } : {}),
      },
    });
    await ph.flush();
  } catch {
    // safe to ignore: analytics is non-critical, must never break chat
  }
}
