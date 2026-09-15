/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * batch76-b — GET/PUT /api/buddy/spending-cap 现状固化
 * （testgap v6 Top20 #7 / v8 Top20 #11 — batch74 新文件，出生即盲区）
 *
 * 四组断言点：
 *   1. PUT zod 校验边界（capCents/warningPct/未认证）+ 200 Cache-Control；
 *   2. periodStart 隐蔽语义：GET 读路径经 normalize 恒重置为本月初；
 *      PUT 同月锁（L98-100）覆盖 resetPeriod —— 同月 reset 是 no-op，跨月才滚动；
 *   3. loadPayload 聚合：savedAmount→cents 取整、脏值行跳过、refund platform 缺失回退 'refund'；
 *   4. upsert onConflict 幂等键 + 失败 500 不泄栈。
 *
 * 只 mock @/lib/with-auth（auth 边界），zod 校验、lib/spending-cap、spending-cap-tracker
 * 全部走真实实现 —— 聚合/钳制/周期口径由假 supabase 喂真实数据驱动。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockState = {
  user: { id: 'user-123' } as { id: string } | null,
  supabase: null as unknown,
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: mockState.supabase });
    };
  },
}));

import { GET, PUT } from '../route';

interface GuardEventRow { metadata: Record<string, unknown> | null; created_at: string }
interface RefundRow { amount: number | null; platform: string | null; received_at: string | null }

interface SupabaseFixture {
  settingValue?: string | null;
  guardRows?: GuardEventRow[];
  refundRows?: RefundRow[];
  upsertError?: { message: string } | null;
}

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    // thenable: loadPayload 直接 await .gte().lte() 链
    then: (onFulfilled: (r: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => result);
  chain.single = vi.fn(async () => result);
  return chain;
}

function authedSupabase(fixture: SupabaseFixture) {
  const upsertCalls: Array<{ payload: { value: string }; options: unknown }> = [];
  let currentValue = fixture.settingValue ?? null; // upsert 后生效，模拟真实存储
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'shopping_facts') {
        return {
          select: vi.fn(() => chainResult({ data: currentValue != null ? { value: currentValue } : null, error: null })),
          upsert: vi.fn(async (payload: { value: string }, options: unknown) => {
            upsertCalls.push({ payload, options });
            currentValue = payload.value;
            return { error: fixture.upsertError ?? null };
          }),
        };
      }
      if (table === 'health_events') {
        return chainResult({ data: fixture.guardRows ?? [], error: null });
      }
      if (table === 'email_receipts') {
        return chainResult({ data: fixture.refundRows ?? [], error: null });
      }
      return chainResult({ data: null, error: null });
    }),
  };
  return { supabase, upsertCalls };
}

function authed(fixture: SupabaseFixture) {
  const { supabase, upsertCalls } = authedSupabase(fixture);
  mockState.user = { id: 'user-123' };
  mockState.supabase = supabase;
  return upsertCalls;
}

function unauthed() {
  mockState.user = null;
  mockState.supabase = null;
}

function makeGet(): NextRequest {
  return new NextRequest('http://localhost/api/buddy/spending-cap', { method: 'GET' });
}

function makePut(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/buddy/spending-cap', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// 月内相对时间构造（任意日期运行都落在本月内，hours 保证排序确定）
const now = new Date();
const monthDay = (dayOffset: number, hour: number) =>
  new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - dayOffset), hour, 0, 0, 0).toISOString();
const monthStartIso = () => new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
const prevMonthStartIso = () => new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

describe('GET /api/buddy/spending-cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    unauthed();
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('returns 200 with private max-age=300 cache header on empty state', async () => {
    authed({});
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    const json = await res.json();
    expect(json.state).toBeNull(); // capCents 0 → computeSpendingCapState null
    expect(json.setting.capCents).toBe(0);
  });

  it('v6 #7.3: aggregates savedAmount→cents, skips dirty rows, refund platform fallback', async () => {
    authed({
      settingValue: JSON.stringify({ capCents: 10000, periodStart: monthStartIso(), warningPct: 80 }),
      guardRows: [
        { metadata: { savedAmount: 89.456 }, created_at: monthDay(2, 10) },  // → 8946 cents
        { metadata: { savedAmount: '25' }, created_at: monthDay(3, 9) },     // 字符串金额强转 → 2500
        { metadata: null, created_at: monthDay(3, 8) },                      // 无 metadata → 跳过
        { metadata: { savedAmount: 0 }, created_at: monthDay(3, 7) },        // ≤0 → 跳过
        { metadata: { savedAmount: -5 }, created_at: monthDay(3, 6) },       // ≤0 → 跳过
        { metadata: { savedAmount: 'abc' }, created_at: monthDay(3, 5) },    // NaN → 跳过
      ],
      refundRows: [
        { amount: 12.5, platform: 'amazon', received_at: monthDay(1, 12) },  // → 1250 'amazon'
        { amount: 8, platform: null, received_at: monthDay(0, 14) },         // → 800 'refund'（回退）
        { amount: null, platform: 'x', received_at: monthDay(0, 15) },       // 脏值 → 跳过
      ],
    });
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.state).toEqual({
      usedCents: 13496, // 8946 + 2500 + 1250 + 800
      capCents: 10000,
      pctUsed: 135,
      status: 'exceeded',
      remainingCents: 0,
    });
    // events 按 timestamp 降序
    expect(json.events.map((e: { amountCents: number }) => e.amountCents)).toEqual([800, 1250, 8946, 2500]);
    // categories 按 guardRows→refundRows 首次出现顺序聚合
    expect(json.categories).toEqual([
      { category: 'challenge', amountCents: 11446 },
      { category: 'amazon', amountCents: 1250 },
      { category: 'refund', amountCents: 800 },
    ]);
    expect(json.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it('v6 #7.2 (GET 侧): stored periodStart 被丢弃, GET 恒返回本月 1 号', async () => {
    authed({
      settingValue: JSON.stringify({ capCents: 10000, periodStart: prevMonthStartIso(), warningPct: 80 }),
    });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.setting.periodStart).toBe(monthStartIso()); // 跨月后 GET 返回本月 1 号而非存储值
  });
});

describe('PUT /api/buddy/spending-cap — validation (v6 #7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed({});
  });

  it.each([
    ['capCents negative', { capCents: -1, warningPct: 80 }],
    ['capCents decimal', { capCents: 1.5, warningPct: 80 }],
    ['capCents over max', { capCents: 100_000_001, warningPct: 80 }],
    ['capCents string', { capCents: 'abc', warningPct: 80 }],
    ['capCents missing', { warningPct: 80 }],
    ['warningPct below 50', { capCents: 5000, warningPct: 49 }],
    ['warningPct over 95', { capCents: 5000, warningPct: 96 }],
    ['warningPct decimal', { capCents: 5000, warningPct: 70.5 }],
  ])('rejects %s with 400, zero DB writes', async (_label, body) => {
    const upsertCalls = authed({});
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect(upsertCalls).toHaveLength(0);
  });

  it('rejects non-JSON body with 400', async () => {
    const res = await PUT(makePut('not json'));
    expect(res.status).toBe(400);
  });

  it('accepts zod boundaries: capCents 0 and 100000000, warningPct 50 and 95', async () => {
    for (const body of [
      { capCents: 0, warningPct: 50 },
      { capCents: 100_000_000, warningPct: 95 },
    ]) {
      const upsertCalls = authed({});
      const res = await PUT(makePut(body));
      expect(res.status).toBe(200);
      expect(upsertCalls).toHaveLength(1);
    }
  });

  it('returns 401 when not authenticated', async () => {
    unauthed();
    const res = await PUT(makePut({ capCents: 5000, warningPct: 80 }));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/buddy/spending-cap — periodStart semantics (v6 #7.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function storedPeriodStartOf(upsertCalls: Array<{ payload: { value: string } }>): string {
    expect(upsertCalls).toHaveLength(1);
    return JSON.parse(upsertCalls[0].payload.value).periodStart;
  }

  it('fresh user (no stored row): periodStart = startOfMonth(now)', async () => {
    const upsertCalls = authed({ settingValue: null });
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70 }));
    expect(res.status).toBe(200);
    expect(storedPeriodStartOf(upsertCalls)).toBe(monthStartIso());
  });

  it('v6 #7.2 (PUT 侧): 同月 PUT 即使 resetPeriod=true, 存储的 periodStart 不变（L98-100 同月锁覆盖 reset）', async () => {
    const stored = monthStartIso();
    const upsertCalls = authed({
      settingValue: JSON.stringify({ capCents: 10000, periodStart: stored, warningPct: 80 }),
    });
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70, resetPeriod: true }));
    expect(res.status).toBe(200);
    expect(storedPeriodStartOf(upsertCalls)).toBe(stored); // 逐字节不变 — 同月 reset 是 no-op
  });

  it('跨月首个 PUT: periodStart 滚动到本月 1 号', async () => {
    const upsertCalls = authed({
      settingValue: JSON.stringify({ capCents: 10000, periodStart: prevMonthStartIso(), warningPct: 80 }),
    });
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70 }));
    expect(res.status).toBe(200);
    expect(storedPeriodStartOf(upsertCalls)).toBe(monthStartIso());
  });

  it('upsert payload 走零 DDL 契约键且 onConflict 为三元组（v6 #7.4 幂等）', async () => {
    const upsertCalls = authed({});
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70 }));
    expect(res.status).toBe(200);
    expect(upsertCalls[0].payload).toMatchObject({
      user_id: 'user-123',
      category: 'budget',
      key: 'spending_cap',
    });
    expect(upsertCalls[0].options).toEqual({ onConflict: 'user_id,category,key' });
    const stored = JSON.parse(upsertCalls[0].payload.value);
    expect(stored).toEqual({ capCents: 20000, periodStart: monthStartIso(), warningPct: 70 });
  });
});

describe('PUT /api/buddy/spending-cap — success & failure (v6 #7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success returns loadPayload with Cache-Control header', async () => {
    authed({
      settingValue: JSON.stringify({ capCents: 10000, periodStart: monthStartIso(), warningPct: 80 }),
      refundRows: [{ amount: 30, platform: 'amazon', received_at: monthDay(1, 12) }],
    });
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70 }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    const json = await res.json();
    expect(json.setting.capCents).toBe(20000);
    expect(json.setting.warningPct).toBe(70);
    expect(json.state).toEqual({
      usedCents: 3000,
      capCents: 20000,
      pctUsed: 15,
      status: 'ok',
      remainingCents: 17000,
    });
  });

  it('upsert error → 500 {"error":"Failed to save spending cap"}, 不泄堆栈', async () => {
    authed({ upsertError: { message: 'duplicate key value violates unique constraint "shopping_facts_user_id_category_key_key"' } });
    const res = await PUT(makePut({ capCents: 20000, warningPct: 70 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to save spending cap' });
  });
});
