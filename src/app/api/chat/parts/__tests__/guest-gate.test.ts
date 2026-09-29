/**
 * guest-gate — 刀19 相位级单测
 *
 * mock 边界 = 该相位自己的依赖 (guest-rate-limiter 的 checkGuestLimit/getClientIP
 * + logger)，模式抄 rate-guard.test.ts / daily-limit-guard.test.ts (刀18 先例)。
 * 断言: 超限 401 body 含 guestLimitReached (简报指定) / 放行 null / hasAuth 跳过。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getClientIP = vi.fn();
const checkGuestLimit = vi.fn();

vi.mock('@/lib/guest-rate-limiter', () => ({
  getClientIP: (...args: unknown[]) => getClientIP(...args),
  checkGuestLimit: (...args: unknown[]) => checkGuestLimit(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { checkGuestChatLimit } from '../guest-gate';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers,
  });
}

describe('guest-gate', () => {
  beforeEach(() => {
    getClientIP.mockReset();
    checkGuestLimit.mockReset();
  });

  it('已登录用户 (hasAuth=true) 跳过限流，不查 IP', () => {
    expect(checkGuestChatLimit(request({ 'x-real-ip': 'ip' }), true)).toBeNull();
    expect(getClientIP).not.toHaveBeenCalled();
    expect(checkGuestLimit).not.toHaveBeenCalled();
  });

  it('guest 未超限时放行 (null) 并记 info 日志', () => {
    getClientIP.mockReturnValue('1.2.3.4');
    checkGuestLimit.mockReturnValue({ allowed: true, remaining: 1, limit: 2 });
    expect(checkGuestChatLimit(request({ 'x-real-ip': '1.2.3.4' }), false)).toBeNull();
    expect(getClientIP).toHaveBeenCalledWith(expect.any(NextRequest));
    expect(checkGuestLimit).toHaveBeenCalledWith('1.2.3.4');
  });

  it('guest 超限 → 401，body 含 guestLimitReached 与 limit (字节级契约)', async () => {
    getClientIP.mockReturnValue('1.2.3.4');
    checkGuestLimit.mockReturnValue({ allowed: false, remaining: 0, limit: 2 });
    const response = checkGuestChatLimit(request({ 'x-real-ip': '1.2.3.4' }), false);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: 'Guest limit reached. Sign up to continue chatting with Symy and save your conversations.',
      guestLimitReached: true,
      limit: 2,
    });
  });
});
