/**
 * Next.js client instrumentation — client-side Sentry initialization
 *
 * 🔧 2026-07-15: @sentry/nextjs v10 recommends this file instead of sentry.client.config.ts
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

import * as Sentry from '@sentry/nextjs';
import { warnMissingEnvOnce } from '@/lib/env-consumers';
import { scrubSentryEvent } from '@/lib/sentry-scrub';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (!SENTRY_DSN) warnMissingEnvOnce('Sentry error monitoring');

Sentry.init({
  dsn: SENTRY_DSN,

  // 🔧 R592: 隐私政策断言「PII 清洗」的实现支撑 — 清洗 message/exception/extra 里的邮箱与电话
  beforeSend: scrubSentryEvent,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    'Failed to fetch',
    'Load failed',
    'Non-Error promise rejection captured',
  ],

  environment: process.env.NODE_ENV,
});

// 🔧 Required by @sentry/nextjs v10 for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
