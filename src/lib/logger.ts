/* eslint-disable no-console -- logger module is the legitimate place to use console.log */
/**
 * Structured Logger for Symy
 *
 * Replaces raw console.log with level-aware logging:
 * - In production (Vercel): only warn/error
 * - In development: all levels
 * - Error level also sends to Sentry (if configured)
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('[Component] message', data);
 *   logger.warn('[Component] warning');
 *   logger.error('[Component] error', err);
 */

const isDev = process.env.NODE_ENV === 'development';

// 🔧 2026-07-15 (ARCH-7 #20): Lazy-load Sentry to avoid client bundle bloat
// on server. If Sentry isn't configured, captureException is a no-op.
let sentryCapture: ((err: unknown) => void) | null = null;
async function getSentryCapture() {
  if (sentryCapture !== null) return sentryCapture;
  try {
    const Sentry = await import('@sentry/nextjs');
    sentryCapture = (err: unknown) => Sentry.captureException(err);
  } catch {
    sentryCapture = () => {}; // Sentry not available — no-op
  }
  return sentryCapture;
}

function formatMessage(prefix: string, message: string): string {
  const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
  return `${timestamp} ${prefix} ${message}`;
}

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (isDev) {
      console.log(formatMessage('DEBUG', message), ...args);
    }
  },

  info(message: string, ...args: unknown[]) {
    if (isDev) {
      console.log(formatMessage('INFO ', message), ...args);
    }
  },

  warn(message: string, ...args: unknown[]) {
    console.warn(formatMessage('WARN ', message), ...args);
  },

  async error(message: string, ...args: unknown[]) {
    console.error(formatMessage('ERROR', message), ...args);
    // 🔧 2026-07-15: Send errors to Sentry (if configured)
    // If first arg is an Error object, capture it; otherwise create a new Error
    const errorObj = args.find(a => a instanceof Error) || new Error(message);
    const capture = await getSentryCapture();
    capture(errorObj);
  },

  /** Always log regardless of environment (for critical ops like agent creation) */
  async critical(message: string, ...args: unknown[]) {
    console.log(formatMessage('CRIT ', message), ...args);
    // 🔧 2026-07-15: Also send critical events to Sentry
    const errorObj = args.find(a => a instanceof Error) || new Error(message);
    const capture = await getSentryCapture();
    capture(errorObj);
  },
};
