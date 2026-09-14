/**
 * Next.js instrumentation file — server-side Sentry initialization
 *
 * 🔧 2026-07-15: @sentry/nextjs v10 requires this file instead of sentry.server.config.ts
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
  // Client config (sentry.client.config.ts) is auto-loaded by the @sentry/nextjs
  // webpack plugin — no import needed here (a client import would break edge runtime).
}

// 🔧 Required by @sentry/nextjs v10 for server component error capture
export const onRequestError = Sentry.captureRequestError;
