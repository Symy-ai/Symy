/* eslint-disable require-await -- test mocks use async for API consistency */

/**
 * Tests for health-impact-legacy.ts — createHealthEventLegacy 非原子回退路径
 * (batch71-b, testgap v5 中危盲区补测)
 *
 * 报告出处: wool-report-testgap §六 观察名单摘录高危 + §八.2 金额红线
 * ("total_saved 累加应配守卫测试")。既有 health-impact.test.ts 只测纯函数,
 * 明确跳过 legacy 路径 — 本文件补上。
 *
 * 断言对齐现状:
 *   - INSERT-then-UPDATE 顺序 (UNIQUE 约束当分布式锁) — from() 调用顺序由脚本强制
 *   - refund_boost → total_saved 累加 (金额红线); metadata 缺失 → +0 不产生 NaN
 *   - 23505 + triggerId → 幂等去重: 0 delta + newVitality 回传当前值, 不再 UPDATE
 *   - buddy_state 缺行 → INSERT 默认态; INSERT 撞 race → re-read 单份 delta
 *   - update 失败但 event 已插入 → success:true (现状接受短暂不一致, 源码注释自认)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createHealthEventLegacy,
  checkAndAwardBadgesLegacy,
  type BuddyStateRow,
} from '@/lib/health-impact-legacy';
import { createAdminClient } from '@/lib/supabase-admin';
import { DEFAULT_VITALITY, DEFAULT_TOKENS } from '@/lib/buddy-defaults';
import { sanitizeHealthDescription } from '@/lib/display-sanitize';

const mockedCreateAdminClient = vi.mocked(createAdminClient);

type ChainResult = { data?: unknown; error: { message: string; code?: string } | null };
interface Step {
  table: string;
  result: ChainResult;
}

/** 链式 builder: select/eq/insert/update 返回自身; then/maybeSingle 都解析到 payload */
interface StepBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}

function makeStepBuilder(result: ChainResult): StepBuilder {
  const payload = { data: result.data ?? null, error: result.error };
  const builder = {} as StepBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => payload);
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(payload).then(onFulfilled, onRejected);
  return builder;
}

type Builder = ReturnType<typeof makeStepBuilder>;

/**
 * 按脚本顺序回放 from(table) 调用 — 表名不匹配或多余调用立即 throw,
 * 以此锁定 INSERT-then-UPDATE 顺序契约。
 */
function scriptLegacyHarness(steps: Step[]) {
  const calls: Array<{ table: string; builder: Builder }> = [];
  const from = vi.fn((table: string) => {
    const step = steps.shift();
    if (!step || step.table !== table) {
      const expected = step ? `from('${step.table}')` : 'no more DB calls';
      throw new Error(`unexpected from('${table}') — expected ${expected}`);
    }
    const builder = makeStepBuilder(step.result);
    calls.push({ table, builder });
    return builder;
  });
  mockedCreateAdminClient.mockReturnValue({ supabase: { from } as never, error: null });
  return calls;
}

const stateRow = (over: Partial<BuddyStateRow> = {}): BuddyStateRow => ({
  user_id: 'user-1',
  vitality: 72,
  tokens: 156,
  health: 'healthy',
  level: 1,
  xp: 0,
  xp_to_next: 100,
  streak: 0,
  dream_funds: null,
  badges: ['first_save'],
  total_saved: 100,
  challenges_completed: 0,
  last_drain_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
});

describe('createHealthEventLegacy — refund_boost 金额红线', () => {
  it('total_saved = 既有 100 + 退款 250 = 350, 单次 UPDATE 写入', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-1' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      triggerId: 'refund-1',
      description: 'refund processed',
      metadata: { amount: 250 },
    });

    expect(result.success).toBe(true);
    expect(result.vitalityChange).toBe(13); // 5 base + 8 (amount > 200)
    expect(result.newVitality).toBe(85); // 72 + 13
    expect(result.tokenChange).toBe(3);
    expect(result.newTokens).toBe(159);

    // badges 已含 first_save → 不触发 badge UPDATE, 恰好 3 次 from()
    expect(calls).toHaveLength(3);
    const updateArg = calls[2].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.total_saved).toBe(350);
    expect(updateArg.vitality).toBe(85);
    expect(updateArg.tokens).toBe(159);
    expect(updateArg.health).toBe('thriving'); // 85 > 75
  });

  it('metadata 缺 amount → total_saved 保持原值 (+0), 不产生 NaN', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-2' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'refund without amount',
      metadata: {},
    });

    const updateArg = calls[2].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.total_saved).toBe(100);
  });

  it('行内 total_saved 为 null → 从 0 起累加', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow({ total_saved: null as unknown as number }), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-3' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'first refund ever',
      metadata: { amount: 50 },
    });

    const updateArg = calls[2].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.total_saved).toBe(50);
  });
});

describe('createHealthEventLegacy — 幂等去重 (23505 分布式锁)', () => {
  it('23505 + triggerId → deduplicated:true, 0 delta, newVitality 回传当前值, 不再 UPDATE', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { error: { message: 'duplicate key', code: '23505' } } },
      // 去重 re-read: select id by (user, source, trigger_id)
      { table: 'health_events', result: { data: { id: 'evt-42' }, error: null } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'chat_mcp',
      triggerId: 'dup-1',
      description: 'concurrent duplicate',
      metadata: { impulseScore: 95, amount: 250 },
    });

    expect(result.success).toBe(true);
    expect(result.deduplicated).toBe(true);
    expect(result.vitalityChange).toBe(0);
    expect(result.tokenChange).toBe(0);
    expect(result.newVitality).toBe(72);
    expect(result.newTokens).toBe(156);
    expect(result.eventId).toBe('evt-42');
    // 恰好 3 次调用 — 若第 4 次 (buddy_state UPDATE) 发生, 脚本会 throw
    expect(calls).toHaveLength(3);
  });

  it('23505 但无 triggerId → 不走去重, 真失败且无 re-read', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { error: { message: 'duplicate key', code: '23505' } } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'chat_mcp',
      description: 'no trigger id',
      metadata: { impulseScore: 70, amount: 10 },
    });

    expect(result.success).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('health_events 非 23505 错误 → success:false, 不更新 buddy_state (无 event 不扣血)', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { error: { message: 'connection refused' } } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'db down',
      metadata: { impulseScore: 95, amount: 250 },
    });

    expect(result.success).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe('createHealthEventLegacy — buddy_state 缺行与 race', () => {
  it('缺行 → 先 INSERT 默认态 (72/156/streak 0), 再按该态计算扣血', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: null, error: null } },
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-5' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      triggerId: 'mail-9',
      description: 'impulse buy',
      metadata: { impulseScore: 95, amount: 250 },
    });

    expect(result.success).toBe(true);
    const insertArg = calls[1].builder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.user_id).toBe('user-1');
    expect(insertArg.vitality).toBe(DEFAULT_VITALITY); // 72
    expect(insertArg.tokens).toBe(DEFAULT_TOKENS); // 156
    expect(insertArg.streak).toBe(0);
    expect(insertArg.total_saved).toBe(0);

    // score 95 → -15, amount 250 → -5, 共 -20; 72-20=52
    const updateArg = calls[3].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.vitality).toBe(52);
    expect(updateArg.tokens).toBe(155); // 156 - 1
    expect(updateArg.health).toBe('healthy'); // 52 ≤ 75
    // impulse_damage 不碰 total_saved (仅 refund_boost 分支)
    expect(updateArg).not.toHaveProperty('total_saved');
  });

  it('INSERT 撞 race → re-read 现存行, 只应用一份 delta (不双写)', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: null, error: null } },
      { table: 'buddy_state', result: { error: { message: 'conflict' } } },
      { table: 'buddy_state', result: { data: stateRow({ total_saved: 500 }), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-6' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'refund_boost',
      triggerSource: 'email_refund',
      description: 'race retry',
      metadata: { amount: 100 },
    });

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(5);
    const updateArg = calls[4].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.total_saved).toBe(600); // 500 (re-read) + 100, 恰好一份
  });

  it('race 后 re-read 也失败 → success:false', async () => {
    scriptLegacyHarness([
      { table: 'buddy_state', result: { data: null, error: null } },
      { table: 'buddy_state', result: { error: { message: 'conflict' } } },
      { table: 'buddy_state', result: { error: { message: 'still down' } } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'total outage',
    });

    expect(result.success).toBe(false);
  });
});

describe('createHealthEventLegacy — 覆盖值与降级现状', () => {
  it('vitalityOverride 压过公式, event 落库记录 override 值', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-7' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'manual',
      description: 'manual override',
      metadata: { impulseScore: 95, amount: 250 },
      vitalityOverride: -5,
    });

    expect(result.vitalityChange).toBe(-5);
    expect(result.newVitality).toBe(67);
    const insertArg = calls[1].builder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.vitality_change).toBe(-5);
    expect(insertArg.new_vitality).toBe(67);
  });

  it('UPDATE 失败但 event 已插入 → success:true 带完整计算值 (现状: 接受短暂不一致)', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow(), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-8' }, error: null } },
      { table: 'buddy_state', result: { error: { message: 'update conflict' } } },
    ]);

    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'update failed',
      metadata: { impulseScore: 95, amount: 250 },
    });

    expect(result.success).toBe(true);
    expect(result.eventId).toBe('evt-8');
    expect(result.vitalityChange).toBe(-20);
    expect(result.newVitality).toBe(52);
    // 不触发 badge 检查 (update 失败短路)
    expect(calls).toHaveLength(3);
  });

  it('description 经 sanitizeHealthDescription 落库; trigger_id 缺省落 null', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow({ badges: ['first_save', 'impulse_shield'] }), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-9' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'mindful_recovery',
      triggerSource: 'chat_mcp',
      description: 'clean description stays',
      metadata: {},
    });

    const insertArg = calls[1].builder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.description).toBe(sanitizeHealthDescription('clean description stays'));
    expect(insertArg.trigger_id).toBeNull();
  });

  it('badge 授予: mindful_recovery 且无徽章 → 追加 UPDATE 写入 impulse_shield', async () => {
    const calls = scriptLegacyHarness([
      { table: 'buddy_state', result: { data: stateRow({ badges: [] }), error: null } },
      { table: 'health_events', result: { data: { id: 'evt-10' }, error: null } },
      { table: 'buddy_state', result: { error: null } },
      { table: 'buddy_state', result: { error: null } },
    ]);

    await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'mindful_recovery',
      triggerSource: 'chat_mcp',
      description: 'mindful moment',
      metadata: {},
    });

    expect(calls).toHaveLength(4);
    const badgeUpdateArg = calls[3].builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(badgeUpdateArg.badges).toEqual(['impulse_shield']);
  });
});

describe('createHealthEventLegacy / checkAndAwardBadgesLegacy — 前置守卫', () => {
  it('admin client 不可用 → success:false, 零 DB 调用', async () => {
    mockedCreateAdminClient.mockReturnValue({ supabase: null, error: 'no admin client' });
    const result = await createHealthEventLegacy({
      userId: 'user-1',
      eventType: 'impulse_damage',
      triggerSource: 'email_receipt',
      description: 'no client',
    });
    expect(result.success).toBe(false);
  });

  it('checkAndAwardBadgesLegacy: 已有徽章不重复授予', async () => {
    const supabase = { from: vi.fn(() => makeStepBuilder({ error: null })) };
    await checkAndAwardBadgesLegacy(
      supabase as never,
      'user-1',
      'refund_boost',
      stateRow({ badges: ['first_save'] }),
    );
    // 已含 first_save → 无 UPDATE 调用
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
