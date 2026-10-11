import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './src/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  // 🔧 R592: 隐私政策断言「PII 清洗」的实现支撑 — 与 instrumentation-client 同口径
  beforeSend: scrubSentryEvent,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  ignoreErrors: [
    'Invalid Refresh Token',
    'JWT expired',
    'aborted',
    'AbortError',
  ],
  environment: process.env.NODE_ENV,
});
