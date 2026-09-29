import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const checkRateLimit = vi.fn();

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

import { checkChatRateLimit } from '../rate-guard';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers,
  });
}

describe('rate-guard', () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
  });

  it('rejects unidentifiable anonymous clients', async () => {
    const response = await checkChatRateLimit(request(), undefined);
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unable to identify client. Please sign in to chat.' });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rate limits authenticated users by user id', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    expect(await checkChatRateLimit(request({ 'x-real-ip': 'ip' }), 'user-id')).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith('chat:user:user-id', 30, 60 * 60 * 1000);
  });

  it('uses the last trimmed Vercel-forwarded IP', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    expect(await checkChatRateLimit(request({ 'x-vercel-forwarded-for': 'a, b' }), undefined)).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith('chat:ip:b', 30, 60 * 60 * 1000);
  });

  it('falls back to x-forwarded-for', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    expect(await checkChatRateLimit(request({ 'x-forwarded-for': 'c' }), undefined)).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith('chat:ip:c', 30, 60 * 60 * 1000);
  });

  it('returns 429 when disallowed', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const response = await checkChatRateLimit(request({ 'x-real-ip': 'ip' }), undefined);
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({ error: 'Rate limit exceeded. Maximum 30 messages per hour. Please try again later.' });
  });

  it('passes when allowed', async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    expect(await checkChatRateLimit(request({ 'x-real-ip': 'ip' }), undefined)).toBeNull();
  });
});
