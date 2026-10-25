import { logger } from '@/lib/logger';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import type { VerifyResult } from '../types';

export function verifyTelegramWebhook(req: { headers: Headers }, _rawBody: string): VerifyResult {
  const provided = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (provided === null) {
    logger.warn('[Channel] sig_fail platform=telegram reason=missing_header');
    return { ok: false, reason: 'missing_header' };
  }
  if (!timingSafeCompare(provided, expected)) {
    logger.warn('[Channel] sig_fail platform=telegram reason=bad_signature');
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
