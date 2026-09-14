/**
 * Tests for GET /api/cron/push-weekly-guardian (batch27-c)
 *
 * 覆盖:
 * - 鉴权: 无/错 CRON_SECRET → 401
 * - 聚合正确性: guard transfers mock → payload 笔数/小时数正确 (自设/默认时薪两态)
 * - 零战报不推 (荣誉框架非羞辱); 一周内已推过不重复推 (updated_at 冷却)
 * - 文案: zh/en 两态 title/body; payload 全串零金额字符 (¥|$|￥|元|美元)
 */

/* eslint-disable require-await -- test mocks use async for API consistency */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.CRON_SECRET = 'test-cron-secret';

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/push/web-push-config', () => ({
  isWebPushConfigured: vi.fn(() => true),
  configureWebPush: vi.fn(),
  sendPushNotification: vi.fn(),
}));
vi.mock('@/lib/push/push-sender', () => ({
  sendPushToUsers: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));
vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: vi.fn(async () => 20),
}));

// CRON_SECRET 在 route 模块顶层读取 — 必须先设 env 再动态 import
const { GET, buildWeeklyGuardianCopy } = await import('../route');
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/push/push-sender';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';

type Result = { data: unknown; error: unknown };

/** 链式 thenable builder — supabase 查询 fake (终端 await 走 then) */
function makeBuilder(result: Result = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

/** 一条守护转存审计记录 (snake_case health_events 行形状) */
function guardEvent(userId: string, amount: number, offsetHours = 24) {
  return {
    id: `evt-${userId}-${amount}-${offsetHours}`,
    user_id: userId,
    event_type: 'challenge_reward',
    trigger_source: 'deposit_api',
    trigger_id: `deposit:${userId}:ch:${amount}:${offsetHours}`,
    metadata: { source: 'deposit', fundId: 'savings', fundName: 'Savings', amount },
    created_at: new Date(Date.now() - offsetHours * 3_600_000).toISOString(),
  };
}

function subscription(userId: string) {
  return { user_id: userId, updated_at: new Date(Date.now() - 8 * 24 * 3_600_000).toISOString() };
}

function setupRoute(opts: { subs?: unknown[]; events?: unknown[]; profiles?: unknown[]; rate?: number } = {}) {
  const subBuilder = makeBuilder({ data: opts.subs ?? [], error: null });
  const eventsBuilder = makeBuilder({ data: opts.events ?? [], error: null });
  const profilesBuilder = makeBuilder({ data: opts.profiles ?? [], error: null });
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'push_subscriptions') return subBuilder;
      if (table === 'health_events') return eventsBuilder;
      return profilesBuilder;
    }),
  };
  // createAdminClient 是同步函数 (返回 {supabase, error} 而非 Promise) — 用 mockReturnValue
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ supabase: fakeSupabase, error: null });
  (getUserHourlyRate as ReturnType<typeof vi.fn>).mockResolvedValue(opts.rate ?? 20);
  return { subBuilder, eventsBuilder, profilesBuilder };
}

function makeRequest(auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/push-weekly-guardian', {
    method: 'GET',
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  });
}

function sentPayloads(): Array<Record<string, unknown>> {
  return (sendPushToUsers as ReturnType<typeof vi.fn>).mock.calls.map(
    (call: unknown[]) => call[1] as Record<string, unknown>,
  );
}

/** 推送面零金额红线: payload 全串不含金额字符 */
function expectNoMoneyChars(payloads: Array<Record<string, unknown>>) {
  for (const payload of payloads) {
    const serialized = JSON.stringify(payload);
    expect(serialized, `payload contains money characters: ${serialized}`).not.toMatch(/[¥$￥]|元|美元/);
  }
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/push-weekly-guardian — auth', () => {
  it('returns 401 without authorization header', async () => {
    setupRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    setupRoute();
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});

describe('GET /api/cron/push-weekly-guardian — aggregation & copy', () => {
  it('aggregates weekly guard transfers and interpolates zh copy (custom rate)', async () => {
    setupRoute({
      subs: [subscription('u1')],
      events: [guardEvent('u1', 30, 48), guardEvent('u1', 40, 24)],
      profiles: [{ id: 'u1', locale: 'zh' }],
      rate: 35, // 自设时薪: 70 ÷ 35 = 2 小时
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, notified: 1, sent: 1, failed: 0, removed: 0 });

    const payloads = sentPayloads();
    expect(payloads).toEqual([
      {
        title: '本周守护 2 笔 · 赢回 2 小时',
        body: '这 2 笔守护为你换回 2 小时自由人生，点开看完整守护周报',
        url: '/zh',
      },
    ]);
    expectNoMoneyChars(payloads);
  });

  it('uses the default hourly rate when user has no custom rate (default-rate state)', async () => {
    setupRoute({
      subs: [subscription('u2')],
      events: [guardEvent('u2', 60, 12)],
      profiles: [{ id: 'u2', locale: null }], // locale 读不到 → 默认 zh
      rate: 20, // DEFAULT_HOURLY_RATE: 60 ÷ 20 = 3 小时
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    expect(sentPayloads()).toEqual([
      {
        title: '本周守护 1 笔 · 赢回 3 小时',
        body: '这 1 笔守护为你换回 3 小时自由人生，点开看完整守护周报',
        url: '/zh',
      },
    ]);
  });

  it('renders en copy for en-locale users', async () => {
    setupRoute({
      subs: [subscription('u3')],
      events: [guardEvent('u3', 30, 48), guardEvent('u3', 40, 24)],
      profiles: [{ id: 'u3', locale: 'en' }],
      rate: 35,
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    const payloads = sentPayloads();
    expect(payloads).toEqual([
      {
        title: '2 guards this week · 2 hours won back',
        body: 'Those 2 guards won you 2 hours of freedom — tap for your weekly guard report',
        url: '/en',
      },
    ]);
    expectNoMoneyChars(payloads);
  });

  it('switches to the minutes form below one hour (never shows "0 小时")', async () => {
    setupRoute({
      subs: [subscription('u4')],
      events: [guardEvent('u4', 10, 6)],
      profiles: [{ id: 'u4', locale: 'zh' }],
      rate: 20, // 10 ÷ 20 = 0.5 小时 → 30 分钟
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);

    const payloads = sentPayloads();
    expect(payloads[0].title).toBe('本周守护 1 笔 · 赢回 30 分钟');
    expect(payloads[0].body).toBe('这 1 笔守护为你换回 0.5 小时自由人生，点开看完整守护周报');
  });

  it('only derives deposit_api challenge_reward events (foreign audits do not inflate the report)', async () => {
    setupRoute({
      subs: [subscription('u5')],
      events: [
        guardEvent('u5', 30),
        { ...guardEvent('u5', 99), trigger_source: 'admin', metadata: { source: 'deposit', fundId: 'savings', amount: 99 } },
      ],
      profiles: [{ id: 'u5', locale: 'zh' }],
      rate: 30,
    });

    await GET(makeRequest('test-cron-secret'));

    // 非 deposit_api 审计被 derive 过滤: 只算 1 笔 30 → 1 小时
    expect(sentPayloads()[0].title).toBe('本周守护 1 笔 · 赢回 1 小时');
  });
});

describe('GET /api/cron/push-weekly-guardian — silent periods & dedup', () => {
  it('skips users with zero guard reports this week (no shame pushes)', async () => {
    setupRoute({
      subs: [subscription('u6'), subscription('u7')],
      events: [guardEvent('u6', 50)], // u7 无守护台账
      profiles: [{ id: 'u6', locale: 'zh' }],
      rate: 25,
    });

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();

    expect(json.notified).toBe(1);
    const calls = (sendPushToUsers as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(['u6']);
  });

  it('notifies nobody when no user has guard activity (early return)', async () => {
    setupRoute({ subs: [subscription('u8')], events: [] });

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();

    expect(json).toEqual({ success: true, notified: 0 });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('applies the 7-day cooldown on push_subscriptions.updated_at', async () => {
    const { subBuilder } = setupRoute({ subs: [] }); // 全部 7 天内推过 → 空候选

    const res = await GET(makeRequest('test-cron-secret'));
    const json = await res.json();

    expect(json).toEqual({ success: true, notified: 0 });
    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(subBuilder.lt).toHaveBeenCalledWith('updated_at', expect.any(String));
  });

  it('bumps push_subscriptions.updated_at after sending (cooldown proxy)', async () => {
    const { subBuilder } = setupRoute({
      subs: [subscription('u9')],
      events: [guardEvent('u9', 40)],
      profiles: [{ id: 'u9', locale: 'zh' }],
      rate: 20,
    });

    await GET(makeRequest('test-cron-secret'));

    expect(subBuilder.update).toHaveBeenCalledWith({ updated_at: expect.any(String) });
    expect(subBuilder.eq).toHaveBeenCalledWith('user_id', 'u9');
  });
});

describe('GET /api/cron/push-weekly-guardian — preference gating (batch60-b)', () => {
  function subWithPrefs(userId: string, preferences: unknown) {
    return { ...subscription(userId), preferences };
  }

  it('stays silent at frequency off (off 只停提醒, 台账不动)', async () => {
    setupRoute({
      subs: [subWithPrefs('u1', { frequency: 'off' })],
      events: [guardEvent('u1', 40)],
      profiles: [{ id: 'u1', locale: 'zh' }],
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect(await res.json()).toEqual({ success: true, notified: 0 });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('sends at frequency weekly and keeps legacy default rows receiving the report', async () => {
    for (const [userId, preferences] of [['u-weekly', { frequency: 'weekly' }], ['u-legacy', {}]] as const) {
      setupRoute({
        subs: [subWithPrefs(userId, preferences)],
        events: [guardEvent(userId, 40)],
        profiles: [{ id: userId, locale: 'zh' }],
      });

      const res = await GET(makeRequest('test-cron-secret'));
      expect((await res.json()).notified).toBe(1);
    }
  });

  it('any enabled device row keeps the user eligible (multi-device dedupe)', async () => {
    setupRoute({
      subs: [subWithPrefs('u1', { frequency: 'off' }), subWithPrefs('u1', { frequency: 'weekly' })],
      events: [guardEvent('u1', 40)],
      profiles: [{ id: 'u1', locale: 'zh' }],
    });

    const res = await GET(makeRequest('test-cron-secret'));
    expect((await res.json()).notified).toBe(1);
  });
});

describe('buildWeeklyGuardianCopy — report forms', () => {
  it('uses the hours form at exactly one hour and above (integer display, no trailing .0)', () => {
    expect(buildWeeklyGuardianCopy('zh', 6, 12).title).toBe('本周守护 6 笔 · 赢回 12 小时');
    expect(buildWeeklyGuardianCopy('zh', 1, 1).title).toBe('本周守护 1 笔 · 赢回 1 小时');
    expect(buildWeeklyGuardianCopy('zh', 2, 1.5).title).toBe('本周守护 2 笔 · 赢回 1.5 小时');
  });

  it('uses the minutes form below one hour, rounding up to at least one minute', () => {
    expect(buildWeeklyGuardianCopy('zh', 1, 0.5).title).toBe('本周守护 1 笔 · 赢回 30 分钟');
    expect(buildWeeklyGuardianCopy('zh', 1, 0.001).title).toBe('本周守护 1 笔 · 赢回 1 分钟');
    expect(buildWeeklyGuardianCopy('en', 3, 0.25).title).toBe('3 guards this week · 15 minutes won back');
  });

  it('never emits money characters in either locale or form', () => {
    for (const locale of ['zh', 'en'] as const) {
      for (const hours of [0.001, 0.5, 1, 3.5, 12, 40]) {
        const { title, body } = buildWeeklyGuardianCopy(locale, 6, hours);
        expect(`${title} ${body}`).not.toMatch(/[¥$￥]|元|美元/);
      }
    }
  });
});
