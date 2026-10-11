import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './src/lib/sentry-scrub';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  // 🔧 R592: 隐私政策断言「PII 清洗」的实现支撑 — 清洗 message/exception/extra 里的邮箱与电话
  beforeSend: scrubSentryEvent,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  ignoreErrors: [
    'Invalid Refresh Token',
    'JWT expired',
    'aborted',
    'AbortError',
  ],
  environment: process.env.NODE_ENV,
});
