/**
 * POST /api/buddy/health-events/reset 测试 (batch59-b)
 *
 * 覆盖: 401 未登录 / 400 非法 lane / 三轨道删除过滤正确性
 * (challenge → event_type=challenge_completed; alt_reuse → mindful_recovery +
 * metadata->>kind 过滤; all → 两者) / 对账行 manual_adjustment source=data_reset /
 * 删除失败 500。
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const createHealthEvent = vi.fn().mockResolvedValue({ success: true, eventId: 'audit-1' });
vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: (...args: unknown[]) => createHealthEvent(...args),
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/health-events/reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** thenable fake supabase — 任意 delete 链 await 后返回 { data, error } */
function authedMock(deleted: unknown[] = [], queryError: unknown = null) {
  const fakeSupabase: Record<string, unknown> = {
    from: vi.fn(() => fakeSupabase),
    delete: vi.fn(() => fakeSupabase),
    select: vi.fn(() => fakeSupabase),
    eq: vi.fn(() => fakeSupabase),
    in: vi.fn(() => fakeSupabase),
    then: (resolve: (v: { data: unknown[]; error: unknown }) => void) =>
      resolve({ data: deleted, error: queryError }),
  };

  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: fakeSupabase,
    user: { id: 'user-123' },
    error: null,
    mergeCookies: (resp: Response) => resp,
    mergeCookiesOnResponse: (resp: Response) => resp,
  });

  return fakeSupabase;
}

function unauthedMock() {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: (resp: Response) => resp,
    mergeCookiesOnResponse: (resp: Response) => resp,
  });
}

function eqArgs(db: Record<string, unknown>): string[][] {
  return (db.eq as ReturnType<typeof vi.fn>).mock.calls;
}

describe('POST /api/buddy/health-events/reset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    unauthedMock();
    const res = await POST(makeRequest({ lane: 'all' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid lane', async () => {
    authedMock();
    for (const lane of [undefined, 'nonsense']) {
      const res = await POST(makeRequest(lane === undefined ? {} : { lane }));
      expect(res.status).toBe(400);
    }
  });

  it('lane=challenge deletes only challenge_completed rows', async () => {
    const db = authedMock([{ id: 'e1' }]);
    const res = await POST(makeRequest({ lane: 'challenge' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedCount).toBe(1);
    const types = eqArgs(db).filter((a) => a[0] === 'event_type').map((a) => a[1]);
    expect(types).toEqual(['challenge_completed']);
    expect((db.in as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventType: 'manual_adjustment',
        metadata: expect.objectContaining({ source: 'data_reset', lane: 'challenge' }),
      }),
    );
  });

  it('lane=alt_reuse deletes mindful_recovery rows filtered by metadata kind', async () => {
    const db = authedMock([{ id: 'e2' }]);
    const res = await POST(makeRequest({ lane: 'alt_reuse' }));
    expect(res.status).toBe(200);
    const types = eqArgs(db).filter((a) => a[0] === 'event_type').map((a) => a[1]);
    expect(types).toEqual(['mindful_recovery']);
    expect((db.in as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
      'metadata->>kind',
      ['green_alt_adoption', 'reuse_adoption'],
    ]);
  });

  it('lane=all deletes both tracks', async () => {
    const db = authedMock([{ id: 'e1' }, { id: 'e2' }]);
    const res = await POST(makeRequest({ lane: 'all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedCount).toBe(4); // 两次链各返回 2 行
    const types = eqArgs(db).filter((a) => a[0] === 'event_type').map((a) => a[1]);
    expect(types).toEqual(['challenge_completed', 'mindful_recovery']);
  });

  it('returns 500 when delete errors', async () => {
    authedMock([], { message: 'fk violation' });
    const res = await POST(makeRequest({ lane: 'challenge' }));
    expect(res.status).toBe(500);
    expect(createHealthEvent).not.toHaveBeenCalled();
  });
});
