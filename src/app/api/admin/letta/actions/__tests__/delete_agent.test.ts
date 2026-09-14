/**
 * Tests for handleDeleteAgent (admin letta action) + _shared auth gate
 *
 * testgap v5 §十一.2 V3: 破坏性管理操作 + 孤儿清理。Round 15 H4 已修 bug 落点
 * （只删 Letta agent 不清 profiles.letta_agent_id → 用户永久无法聊天），回归代价极高。
 * Critical paths:
 *   - agent_id 空串/缺失被 zod min(1) 拒 → 400
 *   - 删除成功后 UPDATE profiles SET letta_agent_id = NULL（孤儿清理）
 *   - Letta 删除成功但 profiles 更新失败 → agent 已删不可回滚，200 + warn（半失败语义）
 *   - admin client 不可用 / profiles 无对应行 → 幂等不抛
 *   - Letta 删除失败 → 500 'Delete failed' 不泄露内部错误（BUG-268）
 *   - 非 admin 被 _shared buildAdminCtx 拒 → 401
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: vi.fn() }));
vi.mock('@/lib/admin-audit', () => ({ logUnauthorizedAdminAttempt: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleDeleteAgent } from '../delete_agent';
import { buildAdminCtx, type AdminCtx } from '../_shared';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

const AGENT_ID = 'agent-to-delete';

function makeCtx(opts: { deleteImpl?: () => Promise<unknown>; body?: Record<string, unknown> } = {}): AdminCtx {
  const agentsDelete = vi.fn(opts.deleteImpl ?? (async () => ({})));
  return {
    client: { agents: { delete: agentsDelete } } as unknown as AdminCtx['client'],
    body: opts.body ?? { action: 'delete_agent', agent_id: AGENT_ID },
    action: 'delete_agent',
  };
}

/** profiles 清理链 mock：.from('profiles').update(...).eq(...) → { error } */
function mockProfileCleanup(result: { error: unknown } | null, adminAvailable = true) {
  const eq = vi.fn(async () => result ?? { error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  vi.mocked(createAdminClient).mockReturnValue(
    adminAvailable
      ? { supabase: { from } as never, error: null }
      : { supabase: null, error: 'SUPABASE_SERVICE_ROLE_KEY missing' },
  );
  return { from, update, eq };
}

describe('handleDeleteAgent — zod body validation (Round 73 Finding 3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileCleanup({ error: null });
  });

  it('rejects empty agent_id with 400 (zod min(1))', async () => {
    const res = await handleDeleteAgent(makeCtx({ body: { agent_id: '' } }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid body');
    expect(json.details).toContain('agent_id');
  });

  it('rejects missing agent_id with 400', async () => {
    const res = await handleDeleteAgent(makeCtx({ body: { action: 'delete_agent' } }));
    expect(res.status).toBe(400);
  });

  it('does not call Letta delete when validation fails', async () => {
    const ctx = makeCtx({ body: { agent_id: '' } });
    await handleDeleteAgent(ctx);
    expect(ctx.client.agents.delete).not.toHaveBeenCalled();
  });
});

describe('handleDeleteAgent — delete + orphan cleanup (Round 15 H4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes agent then clears profiles.letta_agent_id', async () => {
    const cleanup = mockProfileCleanup({ error: null });
    const res = await handleDeleteAgent(makeCtx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, deleted: AGENT_ID });
    expect(cleanup.update).toHaveBeenCalledWith({ letta_agent_id: null });
    expect(cleanup.eq).toHaveBeenCalledWith('letta_agent_id', AGENT_ID);
  });

  it('profiles update failing is a logged half-failure — agent stays deleted, 200 success', async () => {
    mockProfileCleanup({ error: { message: 'update boom' } });
    const res = await handleDeleteAgent(makeCtx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain('letta_agent_id');
  });

  it('skips profile cleanup without error when admin client unavailable (idempotent)', async () => {
    mockProfileCleanup(null, false);
    const res = await handleDeleteAgent(makeCtx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('Letta delete throwing → 500 with generic message, no internal detail leaked (BUG-268)', async () => {
    mockProfileCleanup({ error: null });
    const res = await handleDeleteAgent(makeCtx({
      deleteImpl: async () => { throw new Error('internal letta stack detail'); },
    }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Delete failed');
    expect(JSON.stringify(json)).not.toContain('internal letta stack detail');
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

describe('buildAdminCtx — 非 admin 拒绝 (_shared auth gate)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 error response when verifyAdminAuth rejects', async () => {
    vi.mocked(verifyAdminAuth).mockReturnValue({
      authorized: false,
      error: 'Invalid admin API key in Authorization header.',
    });
    const request = new NextRequest('http://localhost/api/admin/letta', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_agent' }),
    });
    const result = await buildAdminCtx(request);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
      const json = await result.error.json();
      expect(json.error).toContain('Invalid admin API key');
    }
    const { logUnauthorizedAdminAttempt } = await import('@/lib/admin-audit');
    expect(logUnauthorizedAdminAttempt).toHaveBeenCalled();
  });
});
