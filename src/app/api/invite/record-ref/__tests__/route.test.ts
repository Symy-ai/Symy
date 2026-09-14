/**
 * Integration tests for POST /api/invite/record-ref
 *
 * testgap v5 §十一.2 V4: 用户输入 (refCode) 经 validateBody 后写库；Round 74 已迁
 * withAuth、Round 75 不吞 DB 错误、migration 111 后服务端 INSERT（referrerId 来自
 * 查询、referee 来自 auth，不被 body 污染）。Critical paths:
 *   - 未登录被 withAuth 拒 → 401
 *   - refCode 空白/超长 → 400（zod trim + min/max）
 *   - ref_code 列不存在 / invitations 表不存在 → 200 + degraded:true，零写库
 *   - refCode 不存在 / 已有 invitation / 自邀 / 并发 23505 → recorded:false，零写库
 *   - 合法路径 INSERT 字段全部服务端派生，额外 body 字段不污染
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({ createAuthenticatedClient: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';

const REFEREE = { id: 'referee-user-1', email: 'referee@test.com' };
const REFERRER = { id: 'referrer-user-1' };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/invite/record-ref', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface RlsOpts {
  referrerData?: { id: string } | null;
  referrerErr?: unknown;
  existingData?: { id: string; status: string } | null;
  existingErr?: unknown;
}

/** RLS client（withAuth 注入）— 查 profiles.ref_code 与 invitations.existing */
function mockAuthed(opts: RlsOpts = {}) {
  const rlsInsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.referrerData ?? null, error: opts.referrerErr ?? null }),
          }),
        }),
      };
    }
    if (table === 'invitations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.existingData ?? null, error: opts.existingErr ?? null }),
          }),
        }),
        // 仅 admin client 不可用时兜底走 RLS insert（migration 111 前的旧路径）
        insert: rlsInsert,
      };
    }
    return {};
  });
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: { from } as never,
    user: REFEREE,
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  } as never);
  return { from, rlsInsert };
}

/** migration 111 后 INSERT 走 admin client（防伪造 referrer） */
let lastAdminInsert: ReturnType<typeof vi.fn> | undefined;
function mockAdminInsert(result: { error: unknown } | null = { error: null }) {
  lastAdminInsert = vi.fn(async () => result ?? { error: null });
  const adminFrom = vi.fn(() => ({ insert: lastAdminInsert }));
  vi.mocked(createAdminClient).mockReturnValue({
    supabase: { from: adminFrom } as never,
    error: null,
  } as never);
  return { adminInsert: lastAdminInsert, adminFrom };
}

function mockAuthFail() {
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  } as never);
}

describe('POST /api/invite/record-ref — auth & validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated (withAuth)', async () => {
    mockAuthFail();
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty / whitespace-only / oversized refCode', async () => {
    mockAuthed();
    mockAdminInsert();
    for (const refCode of ['', '   ', 'x'.repeat(101)]) {
      const res = await POST(makeRequest({ refCode }));
      expect(res.status).toBe(400);
    }
  });
});

describe('POST /api/invite/record-ref — recorded:false 族（零写库）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthed();
    mockAdminInsert();
  });

  it('ref_code column missing → degraded:true, no insert (graceful degradation)', async () => {
    mockAuthed({ referrerErr: { message: 'Could not find the column', code: '42703' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false, degraded: true });
    expect(lastInsert()).not.toHaveBeenCalled();
  });

  it('refCode not found → recorded:false, no insert', async () => {
    mockAuthed({ referrerData: null });
    const res = await POST(makeRequest({ refCode: 'GHOST-CODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false });
    expect(lastInsert()).not.toHaveBeenCalled();
  });

  it('self-invitation (referrer == referee) → recorded:false, no insert', async () => {
    mockAuthed({ referrerData: { id: REFEREE.id } });
    const res = await POST(makeRequest({ refCode: 'OWN-CODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false });
    expect(lastInsert()).not.toHaveBeenCalled();
  });

  it('referee already has invitation → recorded:false, no insert (one-invite-per-user guard)', async () => {
    mockAuthed({ referrerData: REFERRER, existingData: { id: 'inv-1', status: 'pending' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false });
    expect(lastInsert()).not.toHaveBeenCalled();
  });

  it('invitations table missing → degraded:true, no insert (migration 086 not applied)', async () => {
    mockAuthed({ referrerData: REFERRER, existingErr: { message: 'Could not find the table', code: '42P01' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false, degraded: true });
    expect(lastInsert()).not.toHaveBeenCalled();
  });

  it('concurrent insert race (23505) → recorded:false, not an error', async () => {
    mockAuthed({ referrerData: REFERRER });
    mockAdminInsert({ error: { message: 'duplicate key', code: '23505' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: false });
  });
});

// helper: 最近一次 mockAdminInsert 的 insert vi.fn（beforeEach 重建后仍指向最新实例）
function lastInsert() {
  return lastAdminInsert;
}

describe('POST /api/invite/record-ref — real failure paths (Round 75: not swallowed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthed();
  });

  it('existing-invitation query error (non-missing-table) → 500 DB_ERROR', async () => {
    mockAuthed({ referrerData: REFERRER, existingErr: { message: 'connection reset', code: '08000' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('DB_ERROR');
  });

  it('insert error (non-23505) → 500 DB_ERROR', async () => {
    mockAuthed({ referrerData: REFERRER });
    mockAdminInsert({ error: { message: 'insert exploded', code: '08000' } });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('DB_ERROR');
  });
});

describe('POST /api/invite/record-ref — happy path (migration 111 server-side INSERT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthed({ referrerData: REFERRER });
  });

  it('inserts pending invitation with server-derived fields; extra body fields are ignored', async () => {
    const { adminInsert } = mockAdminInsert();
    // 尝试用 body 污染 referrer/referee/reward —— zod schema 只收 refCode，其余字段必须被剥掉
    const res = await POST(makeRequest({
      refCode: 'SOMECODE',
      referrer_user_id: 'hacker-user',
      referee_user_id: 'hacker-user',
      reward_amount: 999999,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, recorded: true });
    expect(adminInsert).toHaveBeenCalledWith({
      referrer_user_id: REFERRER.id, // 来自 profiles 查询，非 body
      referee_user_id: REFEREE.id,   // 来自 auth，非 body
      referee_email: REFEREE.email,
      status: 'pending',
      reward_amount: 50,
    });
  });

  it('inserts via RLS client as fallback when admin client unavailable', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ supabase: null, error: 'no key' } as never);
    const rls = mockAuthed({ referrerData: REFERRER });
    const res = await POST(makeRequest({ refCode: 'SOMECODE' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recorded).toBe(true);
    expect(rls.rlsInsert).toHaveBeenCalledTimes(1);
  });
});
