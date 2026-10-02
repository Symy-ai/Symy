import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkRateLimit = vi.fn();

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() },
}));

const getChatProfileSnapshot = vi.fn();

vi.mock('../chat-profile-snapshot', () => ({
  getChatProfileSnapshot: (...args: unknown[]) => getChatProfileSnapshot(...args),
}));

import { checkDailyChatLimit } from '../daily-limit-guard';

function supabase() {
  // 🔧 apicache: plan 改由 chat-profile-snapshot 提供 — supabase 仅作为透传参数
  return {} as unknown as Parameters<typeof checkDailyChatLimit>[2];
}

describe('daily-limit-guard', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    getChatProfileSnapshot.mockReset();
  });

  it('skips premium users', async () => {
    getChatProfileSnapshot.mockResolvedValue({ plan: 'premium', timezone: null, hourlyRate: null });
    expect(await checkDailyChatLimit(true, 'user-id', supabase())).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('returns the daily limit response for free users', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    getChatProfileSnapshot.mockResolvedValue({ plan: 'free', timezone: null, hourlyRate: null });
    const response = await checkDailyChatLimit(true, 'user-id', supabase());
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({
      error: 'Daily chat limit reached. Maximum 50 messages per day. Upgrade to Premium for unlimited chatting, or come back tomorrow.',
      dailyLimitReached: true,
      limit: 50,
    });
    expect(checkRateLimit).toHaveBeenCalledWith('chat:daily:user-id', 50, 24 * 60 * 60 * 1000);
  });

  it('fails open when profile lookup throws', async () => {
    getChatProfileSnapshot.mockResolvedValue(null);
    expect(await checkDailyChatLimit(true, 'user-id', supabase())).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('skips anonymous requests without querying profiles', async () => {
    expect(await checkDailyChatLimit(false, undefined, supabase())).toBeNull();
    expect(getChatProfileSnapshot).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
