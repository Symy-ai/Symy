<<<<<<< HEAD
import 'server-only';

=======
/* eslint-disable-next-line */
import 'server-only';
>>>>>>> e6cc23d (fix: env-consumers.ts server-only import fix)
import { logger } from '@/lib/logger';

export type EnvFailureBehavior = 'default' | 'disabled' | 'explicit-failure';

interface EnvConsumerSpec {
  feature: string;
  requirements: string[][];
  behavior: EnvFailureBehavior;
  impact: string;
}

export const ENV_CONSUMERS = [
  { feature: 'Supabase authenticated client', requirements: [['NEXT_PUBLIC_SUPABASE_URL'], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']], behavior: 'disabled', impact: 'Authentication-dependent browser/server requests are unavailable.' },
  { feature: 'Supabase admin client', requirements: [['NEXT_PUBLIC_SUPABASE_URL'], ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']], behavior: 'explicit-failure', impact: 'Database-backed server operations and cron jobs fail closed.' },
  { feature: 'Letta conversation and agent management', requirements: [['LETTA_API_KEY']], behavior: 'explicit-failure', impact: 'AI conversations and agent provisioning are unavailable.' },
  { feature: 'Sentry error monitoring', requirements: [['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN']], behavior: 'disabled', impact: 'Errors and performance traces are not exported.' },
  { feature: 'Gmail OAuth connection', requirements: [['GOOGLE_CLIENT_ID'], ['GOOGLE_CLIENT_SECRET']], behavior: 'disabled', impact: 'Users cannot connect Gmail or monitor Gmail receipts.' },
  { feature: 'Web Push delivery', requirements: [['VAPID_PUBLIC_KEY'], ['VAPID_PRIVATE_KEY']], behavior: 'disabled', impact: 'Push subscriptions and scheduled notifications are not sent.' },
  { feature: 'Email credential encryption', requirements: [['IMAP_ENCRYPTION_KEY', 'ENCRYPTION_MASTER_KEY']], behavior: 'explicit-failure', impact: 'Email credential storage is rejected rather than stored insecurely.' },
  { feature: 'OpenAI-compatible LLM proxy', requirements: [['UPSTREAM_LLM_API_KEY']], behavior: 'explicit-failure', impact: 'Proxy chat completion requests return upstream-not-configured.' },
  { feature: 'LLM gateway', requirements: [['LLM_GATEWAY_URL'], ['LLM_GATEWAY_KEY']], behavior: 'disabled', impact: 'Healing and butterfly LLM calls fall back to the local SDK path.' },
  { feature: 'Butterfly illustration generation', requirements: [['OPENAI_IMAGE_API_KEY']], behavior: 'disabled', impact: 'Generated illustrations use the non-image layout.' },
  { feature: 'Product analytics', requirements: [['NEXT_PUBLIC_POSTHOG_KEY']], behavior: 'disabled', impact: 'Client and server analytics events are discarded.' },
  { feature: 'MCP and LLM proxy authentication', requirements: [['PROXY_API_SECRET', 'MCP_API_SECRET']], behavior: 'explicit-failure', impact: 'Protected MCP/proxy requests return unauthorized.' },
  { feature: 'Vercel cron authentication', requirements: [['CRON_SECRET']], behavior: 'explicit-failure', impact: 'All cron invocations return unauthorized.' },
  { feature: 'Hands cart proxy', requirements: [['SYMY_HANDS_SECRET']], behavior: 'explicit-failure', impact: 'Cart requests return cart service unavailable.' },
  { feature: 'Public application URL', requirements: [['NEXT_PUBLIC_APP_URL', 'VERCEL_URL']], behavior: 'default', impact: 'MCP and invite links fall back to localhost or production defaults.' },
  { feature: 'Letta MCP URL', requirements: [['NEXT_PUBLIC_APP_URL', 'VERCEL_URL']], behavior: 'explicit-failure', impact: 'Per-user MCP registration fails because no public URL is known.' },
  { feature: 'Admin API authentication', requirements: [['ADMIN_API_KEY']], behavior: 'explicit-failure', impact: 'Admin API requests are rejected.' },
  { feature: 'Email-whitelisted admin fallback', requirements: [['ADMIN_EMAILS']], behavior: 'explicit-failure', impact: 'Fallback admin routes return service unavailable.' },
  { feature: 'Z.AI browser configuration fallback', requirements: [['ZAI_BASE_URL']], behavior: 'explicit-failure', impact: 'The z-ai configuration endpoint returns service unavailable when no local config exists.' },
  { feature: 'Symy external shopping context', requirements: [['SYMY_SUPABASE_URL'], ['SYMY_SUPABASE_KEY']], behavior: 'disabled', impact: 'Cart totals and impulse context are omitted from chat prompts.' },
] satisfies EnvConsumerSpec[];

const warnedFeatures = new Set<string>();
const warnedPartialConfigurations = new Set<string>();

function findConsumer(feature: string): EnvConsumerSpec | undefined {
  return ENV_CONSUMERS.find((consumer) => consumer.feature === feature);
}

export function getEnvConsumerStatus(feature: string): {
  feature: string;
  configured: boolean;
  behavior: EnvFailureBehavior;
  impact: string;
} | null {
  const spec = findConsumer(feature);
  if (!spec) return null;

  return {
    feature,
    configured: spec.requirements.every((alternatives) => alternatives.some((key) => !!process.env[key])),
    behavior: spec.behavior,
    impact: spec.impact,
  };
}

export function warnMissingEnvOnce(feature: string): boolean {
  const status = getEnvConsumerStatus(feature);
  if (!status || status.configured || warnedFeatures.has(feature)) return false;

  const spec = findConsumer(feature);
  warnedFeatures.add(feature);
  logger.warn(
    `[Env] ${feature} is unconfigured. Required environment variables: ${spec?.requirements.map((keys) => keys.join('/')).join(' + ')}. ${status.impact}`,
  );
  return true;
}

export function warnPartialEnvOnce(feature: string): boolean {
  const spec = findConsumer(feature);
  const status = getEnvConsumerStatus(feature);
  if (!spec || !status || status.configured || warnedPartialConfigurations.has(feature)) return false;

  const missingRequirements = spec.requirements
    .filter((alternatives) => !alternatives.some((key) => !!process.env[key]))
    .map((alternatives) => alternatives.join('/'));
  const dedupeKey = `${feature}:${missingRequirements.join(' + ')}`;
  if (warnedPartialConfigurations.has(dedupeKey)) return false;

  warnedPartialConfigurations.add(dedupeKey);
  logger.warn(
    `[Env] ${feature} has partial configuration. Missing environment requirements: ${missingRequirements.join(' + ')}. ${status.impact}`,
  );
  return true;
}

export function resetEnvWarningStateForTests(): void {
  warnedFeatures.clear();
  warnedPartialConfigurations.clear();
}
