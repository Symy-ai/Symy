import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramChatAction, sendTelegramMessage } from '../client';

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];
const calls = () => vi.mocked(fetch).mock.calls as FetchCall[];
const body = (call: FetchCall) => JSON.parse(String(call[1]?.body));
const texts = () => calls().map((call) => body(call).text as string);
const ok = () => new Response('{}', { status: 200 });
const badRequest = () => new Response('{}', { status: 400 });

describe('sendTelegramMessage', () => {
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('sends exactly 4000 characters as one message', async () => {
    await sendTelegramMessage('1', 'x'.repeat(4000));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(texts()).toEqual(['x'.repeat(4000)]);
  });

  it('splits 4001 characters and drops whitespace-only tails', async () => {
    await sendTelegramMessage('1', `${'x'.repeat(4000)}y`);
    expect(fetch).toHaveBeenCalledTimes(2);
    await sendTelegramMessage('1', `${'x'.repeat(4000)}\n\n`);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('prefers paragraph boundaries while escaping HTML', async () => {
    await sendTelegramMessage('1', `**b** & <tag>\n\n${'x'.repeat(3998)}`);
    expect(body(calls()[0])).toMatchObject({
      parse_mode: 'HTML',
      text: '<b>b</b> &amp; &lt;tag&gt;',
    });
    expect(texts()).toHaveLength(2);
  });

  it('falls back to plain text after a 400 parse failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(badRequest()).mockResolvedValueOnce(ok());
    await expect(sendTelegramMessage('1', '**b**')).resolves.toEqual({ ok: true });
    expect(body(calls()[1]).text).toBe('b');
    expect(body(calls()[1])).not.toHaveProperty('parse_mode');
  });

  it('returns failure when the plain-text fallback also fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(badRequest()).mockResolvedValueOnce(badRequest());
    const result = await sendTelegramMessage('1', '**b**');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('retries the same chunk once after 429 retry_after', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockImplementationOnce(() => Promise.resolve(new Response('{"parameters":{"retry_after":1}}', { status: 429 })))
      .mockImplementationOnce(() => Promise.resolve(ok()));
    const pending = sendTelegramMessage('1', `${'x'.repeat(3998)} y`);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(calls()).toHaveLength(2);
    expect(body(calls()[0]).text).toBe(body(calls()[1]).text);
  });
});

describe('sendTelegramChatAction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not throw when Telegram rejects the action', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(sendTelegramChatAction('1')).resolves.toBeUndefined();
  });
});
