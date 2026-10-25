import { describe, expect, it, vi } from 'vitest';
import { verifyTelegramWebhook } from '../verify';

function createRequest(secret?: string): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set('X-Telegram-Bot-Api-Secret-Token', secret);
  return new Request('https://symy.example/api/channels/telegram/webhook', { headers });
}

describe('verifyTelegramWebhook', () => {
  it('accepts the configured secret', () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'a'.repeat(32));
    expect(verifyTelegramWebhook(createRequest('a'.repeat(32)), '')).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });

  it('rejects an incorrect secret', () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'a'.repeat(32));
    expect(verifyTelegramWebhook(createRequest('b'.repeat(32)), '')).toEqual({ ok: false, reason: 'bad_signature' });
    vi.unstubAllEnvs();
  });

  it('rejects a missing header', () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'a'.repeat(32));
    expect(verifyTelegramWebhook(createRequest(), '')).toEqual({ ok: false, reason: 'missing_header' });
    vi.unstubAllEnvs();
  });

  it('rejects a different-length secret', () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'a'.repeat(32));
    expect(verifyTelegramWebhook(createRequest('short'), '')).toEqual({ ok: false, reason: 'bad_signature' });
    vi.unstubAllEnvs();
  });
});
