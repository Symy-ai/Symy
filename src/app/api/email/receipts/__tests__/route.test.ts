/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * PATCH /api/email/receipts 幂等与响应诚实性契约 (batch91-c E1)
 *
 * 覆盖:
 *  - refunded→ignored→refunded 来回切换: refund_boost 触发恒用稳定幂等键
 *    `refund_boost:<receipt_id>` — 配合 health_events UNIQUE
 *    (user_id, trigger_source, trigger_id) (migration 008) + RPC ON CONFLICT
 *    DO NOTHING (migration 052/065/067) 管道, 重复事件恰建一次, 不可刷奖励。
 *    测试用 mock 复刻该 DB 去重语义 (同键二次 → deduplicated)。
 *  - no-op PATCH: healthImpactApplied 如实 false (旧代码恒 true 谎报), 零事件。
 *  - 首次真实变更: healthImpactApplied true + 幂等键前缀格式。
 *  - ignored: impulse≥60 → mindful_recovery 同样前缀键; impulse<60 → 零事件。
 *  - createHealthEvent 返回 success:false → 响应如实 false
 *    (前端 use-receipt-actions 按 === false 显示次要 toast)。
 *  - DELETE 单收据: health_events 清理同时匹配新前缀键与历史裸 receiptId。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  userId: 'user-123',
  userSupabase: { current: null as unknown },
  adminSupabase: { current: null as unknown },
  appliedKeys: new Set<string>(),
  createHealthEventCalls: [] as Array<Record<string, unknown>>,
  forceHealthFailure: { current: false },
}));

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      if (!mocks.userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: { id: mocks.userId }, supabase: mocks.userSupabase.current });
    };
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: mocks.adminSupabase.current }),
}));

// 复刻 DB 幂等语义: UNIQUE (user_id, trigger_source, trigger_id) — 同键二次 → deduplicated
vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: async (input: { userId: string; triggerSource: string; triggerId: string }) => {
    mocks.createHealthEventCalls.push(input as Record<string, unknown>);
    if (mocks.forceHealthFailure.current) {
      return { success: false, error: 'simulated failure' };
    }
    const key = `${input.userId}|${input.triggerSource}|${input.triggerId}`;
    if (mocks.appliedKeys.has(key)) {
      return { success: true, deduplicated: true };
    }
    mocks.appliedKeys.add(key);
    return { success: true, deduplicated: false };
  },
}));

vi.mock('@/lib/mcp-tools/handlers/_shared', () => ({
  getUserLocale: async () => 'en',
}));

vi.mock('@/lib/mcp-tools/handlers/descriptions', () => ({
  refundBoostDesc: () => 'refund boost desc',
  mindfulRecoveryDesc: () => 'mindful recovery desc',
}));

vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: async () => 25,
}));

import { PATCH, DELETE } from '../route';

type ChainCalls = Record<string, unknown[][]>;

/** 链式 supabase mock: 每方法记录调用参数; maybeSingle / then 共用同一终值 */
function makeChain(table: string, final: () => { data: unknown; error: unknown }, registry: Array<{ table: string; calls: ChainCalls }>) {
  const calls: ChainCalls = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'update', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(final());
  chain.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(final()).then(res, rej);
  registry.push({ table, calls });
  return chain;
}

function makeSupabase(final: () => { data: unknown; error: unknown }) {
  const chains: Array<{ table: string; calls: ChainCalls }> = [];
  const supabase = {
    from: (table: string) => makeChain(table, final, chains),
  };
  return { supabase, chains };
}

const RECEIPT = { platform: 'amazon', amount: 49.99, impulse_score: 70, item_name: 'Headphones' };

function patchRequest(receiptId: string, status: string) {
  return new NextRequest(`http://localhost/api/email/receipts?id=${receiptId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

beforeEach(() => {
  mocks.appliedKeys.clear();
  mocks.createHealthEventCalls.length = 0;
  mocks.forceHealthFailure.current = false;
});

describe('PATCH /api/email/receipts — refund_boost 幂等 (E1)', () => {
  it('refunded→ignored→refunded 来回切换: 两次 refund_boost 尝试同幂等键 refund_boost:<rid>, 事件恰建一次', async () => {
    // 每次 PATCH 都模拟真实状态变更 (admin UPDATE 命中行) — 旧缺陷面: 每次都新建事件
    const admin = makeSupabase(() => ({ data: { ...RECEIPT }, error: null }));
    mocks.adminSupabase.current = admin.supabase;
    mocks.userSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;

    const res1 = await PATCH(patchRequest('r-1', 'refunded'));
    const res2 = await PATCH(patchRequest('r-1', 'ignored'));
    const res3 = await PATCH(patchRequest('r-1', 'refunded'));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    const refundAttempts = mocks.createHealthEventCalls.filter((c) => c.eventType === 'refund_boost');
    expect(refundAttempts).toHaveLength(2);
    // 稳定幂等键: 两次尝试 triggerId 完全一致 — DB UNIQUE + ON CONFLICT 将其折叠为一次
    expect(refundAttempts[0]!.triggerId).toBe('refund_boost:r-1');
    expect(refundAttempts[1]!.triggerId).toBe('refund_boost:r-1');
    expect(refundAttempts[0]!.triggerSource).toBe('email_refund');

    // 恰一次: mock 复刻的 DB 去重语义下, 落库键只有 refund_boost 与 mindful_recovery 各一个
    expect([...mocks.appliedKeys].sort()).toEqual([
      'user-123|email_ignore|mindful_recovery:r-1',
      'user-123|email_refund|refund_boost:r-1',
    ]);
  });

  it('首次真实变更: 响应 healthImpactApplied=true 且携带前缀幂等键', async () => {
    mocks.adminSupabase.current = makeSupabase(() => ({ data: { ...RECEIPT }, error: null })).supabase;
    mocks.userSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;

    const res = await PATCH(patchRequest('r-2', 'refunded'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: 'refunded', healthImpactApplied: true });
    expect(mocks.createHealthEventCalls[0]!.triggerId).toBe('refund_boost:r-2');
  });

  it('no-op PATCH (状态未变): healthImpactApplied 如实 false + 零事件 (旧代码恒 true 谎报)', async () => {
    const admin = makeSupabase(() => ({ data: null, error: null })); // .neq(status) 未命中行
    mocks.adminSupabase.current = admin.supabase;
    const user = makeSupabase(() => ({ data: { status: 'refunded' }, error: null })); // 复读确认存在
    mocks.userSupabase.current = user.supabase;

    const res = await PATCH(patchRequest('r-3', 'refunded'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, status: 'refunded', noOp: true, healthImpactApplied: false });
    expect(mocks.createHealthEventCalls).toHaveLength(0);
  });

  it('createHealthEvent 返回 success:false → 响应如实 false (前端次要 toast 契约)', async () => {
    mocks.adminSupabase.current = makeSupabase(() => ({ data: { ...RECEIPT }, error: null })).supabase;
    mocks.userSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;
    mocks.forceHealthFailure.current = true;

    const res = await PATCH(patchRequest('r-4', 'refunded'));
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: 'refunded', healthImpactApplied: false });
  });
});

describe('PATCH /api/email/receipts — mindful_recovery 幂等 (E1)', () => {
  it('ignored + impulse_score≥60: 幂等键 mindful_recovery:<rid>', async () => {
    mocks.adminSupabase.current = makeSupabase(() => ({ data: { ...RECEIPT, impulse_score: 80 }, error: null })).supabase;
    mocks.userSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;

    const res = await PATCH(patchRequest('r-5', 'ignored'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: 'ignored', healthImpactApplied: true });
    expect(mocks.createHealthEventCalls[0]!.triggerId).toBe('mindful_recovery:r-5');
    expect(mocks.createHealthEventCalls[0]!.triggerSource).toBe('email_ignore');
  });

  it('ignored + impulse_score<60: 零事件 (现状: 响应仍 healthImpactApplied=true, 无管道可应用)', async () => {
    mocks.adminSupabase.current = makeSupabase(() => ({ data: { ...RECEIPT, impulse_score: 10 }, error: null })).supabase;
    mocks.userSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;

    const res = await PATCH(patchRequest('r-6', 'ignored'));
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: 'ignored', healthImpactApplied: true });
    expect(mocks.createHealthEventCalls).toHaveLength(0);
  });
});

describe('DELETE /api/email/receipts — 孤儿 health_events 清理兼容新旧幂等键 (E1)', () => {
  it('删除单收据: trigger_id 过滤同时匹配裸 rid 与 refund_boost:/mindful_recovery: 前缀', async () => {
    const user = makeSupabase(() => ({ data: null, error: null })); // message_id null → 跳过 email_receipt 分支
    mocks.userSupabase.current = user.supabase;
    mocks.adminSupabase.current = makeSupabase(() => ({ data: null, error: null })).supabase;

    const res = await DELETE(new NextRequest('http://localhost/api/email/receipts?id=r-7', { method: 'DELETE' }));
    expect(res.status).toBe(200);

    const healthChains = user.chains.filter((c) => c.table === 'health_events');
    expect(healthChains).toHaveLength(1);
    const inArgs = healthChains[0]!.calls.in;
    expect(inArgs).toContainEqual(['trigger_source', ['email_refund', 'email_ignore']]);
    expect(inArgs).toContainEqual(['trigger_id', ['r-7', 'refund_boost:r-7', 'mindful_recovery:r-7']]);
  });
});
