import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.fn();

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { checkDailyChatLimit } from '../daily-limit-guard';

function supabase(plan?: string | Error) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(() => {
            if (plan instanceof Error) return Promise.reject(plan);
            return Promise.resolve({ data: plan ? { plan } : null });
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof checkDailyChatLimit>[2];
}

describe('daily-limit-guard', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
  });

  it('skips premium users', async () => {
    const client = supabase('premium');
    expect(await checkDailyChatLimit(true, 'user-id', client)).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('returns the daily limit response for free users', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const response = await checkDailyChatLimit(true, 'user-id', supabase('free'));
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({
      error: 'Daily chat limit reached. Maximum 50 messages per day. Upgrade to Premium for unlimited chatting, or come back tomorrow.',
      dailyLimitReached: true,
      limit: 50,
    });
    expect(checkRateLimit).toHaveBeenCalledWith('chat:daily:user-id', 50, 24 * 60 * 60 * 1000);
  });

  it('fails open when profile lookup throws', async () => {
    expect(await checkDailyChatLimit(true, 'user-id', supabase(new Error('boom')))).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('skips anonymous requests without querying profiles', async () => {
    const client = supabase('free');
    expect(await checkDailyChatLimit(false, undefined, client)).toBeNull();
    expect(client?.from).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
