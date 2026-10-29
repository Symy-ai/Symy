import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  rate: vi.fn(),
}));

vi.mock('@/lib/supabase-api', () => ({ createAuthenticatedClient: (req: unknown) => h.auth(req) }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => h.admin() }));
vi.mock('@/lib/distributed-lock', () => ({ checkRateLimit: (...args: unknown[]) => h.rate(...(args as [string, number, number])) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST } from '../route';

function req(): NextRequest {
  return new NextRequest('http://localhost/api/channels/bind/code', { method: 'POST' });
}

beforeEach(() => {
  h.auth.mockReset().mockResolvedValue({
    user: { id: 'u-real' },
    error: null,
    mergeCookies: (response: Response) => response,
  });
  h.rate.mockReset().mockResolvedValue({ allowed: true });
  h.admin.mockReset().mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue({ data: 'ABCD2345', error: null }) } });
});

it('登录态发码 → 8位安全字符码 + 深链 + 1/min 键', async () => {
  process.env.TELEGRAM_BOT_USERNAME = 'symy_bot';
  const response = await POST(req());
  await expect(response.json()).resolves.toEqual({ ok: true, code: 'ABCD2345', deepLink: 'https://t.me/symy_bot?start=ABCD2345' });
  expect(h.rate).toHaveBeenCalledWith('bind:code:u-real', 1, 60_000);
  expect(h.admin().supabase.rpc).toHaveBeenCalledWith('issue_channel_bind_code', {
    p_user_id: 'u-real', p_code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/), p_platform: 'telegram',
  });
  delete process.env.TELEGRAM_BOT_USERNAME;
});

it('未登录 → 401；同用户限频 → 429', async () => {
  h.auth.mockResolvedValueOnce({ user: null, error: 'Not authenticated', mergeCookies: (response: Response) => response });
  await expect(POST(req())).resolves.toHaveProperty('status', 401);
  h.rate.mockResolvedValueOnce({ allowed: false });
  await expect(POST(req())).resolves.toHaveProperty('status', 429);
});

it('admin 配置缺失 → 503；发码失败 → 500', async () => {
  h.admin.mockReturnValueOnce({ supabase: null, error: 'missing' });
  await expect(POST(req())).resolves.toHaveProperty('status', 503);
  h.admin.mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db' } }) } });
  await expect(POST(req())).resolves.toHaveProperty('status', 500);
});
