import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: true })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: {}, error: null })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '../route';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase-admin';

function makeRequest(body: string): NextRequest {
  return new NextRequest('http://localhost/api/admin/vip', { method: 'POST', body });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/vip');
}

const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';

describe('POST /api/admin/vip — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(makeRequest('{'));
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid userIds and action', async () => {
    const response = await POST(makeRequest(JSON.stringify({ userIds: ['not-a-uuid'], action: 'reset' })));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Validation failed');
  });

  it.each(['GET', 'POST'])('returns 401 when admin auth fails (%s)', async (method) => {
    vi.mocked(verifyAdminAuth).mockReturnValueOnce({ authorized: false } as never);
    const response = method === 'GET'
      ? await GET(makeGetRequest())
      : await POST(makeRequest(JSON.stringify({ userIds: [VALID_UUID_A], action: 'activate' })));
    expect(response.status).toBe(401);
  });

  it('POST activate → plan=premium + affected 计数', async () => {
    const update = vi.fn(() => ({ in: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: VALID_UUID_A }, { id: VALID_UUID_B }], error: null }) })) }));
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: { from: vi.fn(() => ({ update })) , error: null } } as never);
    const response = await POST(makeRequest(JSON.stringify({ userIds: [VALID_UUID_A, VALID_UUID_B], action: 'activate' })));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ success: true, action: 'activate', affected: 2 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'premium' }));
  });

  it('POST deactivate → plan=free', async () => {
    const update = vi.fn(() => ({ in: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [{ id: VALID_UUID_A }], error: null }) })) }));
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: { from: vi.fn(() => ({ update })) , error: null } } as never);
    const response = await POST(makeRequest(JSON.stringify({ userIds: [VALID_UUID_A], action: 'deactivate' })));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free' }));
  });

  it('POST supabase update error → 500 + 不泄露内部细节', async () => {
    const update = vi.fn(() => ({ in: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } }) })) }));
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: { from: vi.fn(() => ({ update })) , error: null } } as never);
    const response = await POST(makeRequest(JSON.stringify({ userIds: [VALID_UUID_A], action: 'activate' })));
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to update plans');
    expect(JSON.stringify(json)).not.toContain('rls denied');
  });

  it('GET → waitlist/premium 合并 + stats 四计数 + isActivated 标注', async () => {
    const waitlistData = [
      { user_id: VALID_UUID_A, email: 'a@x.com', created_at: '2026-09-01' },
      { user_id: VALID_UUID_B, email: 'b@x.com', created_at: '2026-09-02' },
    ];
    const premiumData = [{ id: VALID_UUID_A, email: 'a@x.com', display_name: 'A', plan: 'premium', created_at: '2026-09-01' }];
    const from = vi.fn((table: string) => {
      const limit = vi.fn().mockResolvedValue(table === 'premium_waitlist'
        ? { data: waitlistData, error: null }
        : { data: premiumData, error: null });
      const order = vi.fn().mockReturnValue({ limit });
      const eq = vi.fn().mockReturnValue({ order });
      return { select: vi.fn().mockReturnValue({ order, eq }) };
    });
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: { from }, error: null } as never);
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.stats).toEqual({ waitlistTotal: 2, activatedCount: 1, pendingCount: 1, premiumTotal: 1 });
    expect(json.waitlist[0].isActivated).toBe(true);  // A 在 premium
    expect(json.waitlist[1].isActivated).toBe(false); // B 不在
  });
});
