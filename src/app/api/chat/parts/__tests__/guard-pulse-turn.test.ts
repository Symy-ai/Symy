/**
 * guard-pulse-turn 测试 (batch68-c)
 *
 * 覆盖验收:
 * 1. 命中脉搏问句 → 卡数字与 aggregateGuardPulse 直算相等; 话术来自
 *    guard_pulse_welcome/empty 场景; timezone 透传聚合层
 * 2. 样本不足 → insufficient 引导态, 不造伪规律
 * 3. 红线: 卡上只有小时/次数/天数 — 零金额零碳数值; 非脉搏问句 → null
 * 4. SSE 流: guard_pulse_card 事件在前, token 分块 + done 收尾
 * 5. context loader 契约: 事件/时区双查、缺参降级、失败降级 (stub store)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildGuardPulseTurn,
  buildGuardPulseSseStream,
} from '../guard-pulse-turn';
import { aggregateGuardPulse } from '@/lib/guard-pulse';
import {
  loadGuardPulseQueryData,
  GUARD_PULSE_EVENT_TYPES,
  type GuardPulseEvent,
} from '../guard-pulse-context';

/** 锚点: 2026-09-10T12:00Z */
const NOW = new Date(2026, 8, 10, 12, 0, 0);

function ev(partial: Partial<GuardPulseEvent> & { createdAt: string }): GuardPulseEvent {
  return { eventType: 'challenge_completed', metadata: null, ...partial };
}

/** 8 条样本 (4 天): 深夜 hour23 4 条 + 午休 hour12 4 条 (两条绿色采纳) */
function enoughEvents(): GuardPulseEvent[] {
  return [
    ev({ createdAt: '2026-09-08T23:00:00Z' }),
    ev({ createdAt: '2026-09-05T23:10:00Z' }),
    ev({ createdAt: '2026-09-01T23:20:00Z' }),
    ev({ createdAt: '2026-08-28T23:30:00Z' }),
    ev({ createdAt: '2026-09-09T12:00:00Z' }),
    ev({ createdAt: '2026-09-08T12:10:00Z', eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption' } }),
    ev({ createdAt: '2026-09-07T12:20:00Z' }),
    ev({ createdAt: '2026-09-04T12:30:00Z', eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption' } }),
  ];
}

describe('buildGuardPulseTurn — 命中', () => {
  it('zh: "我什么时候最容易冲动" → 卡与 aggregateGuardPulse 直算逐字段相等', () => {
    const turn = buildGuardPulseTurn({
      userContent: '我什么时候最容易冲动',
      locale: 'zh',
      events: enoughEvents(),
      now: NOW,
      timezone: 'UTC',
      rng: () => 0,
    });
    expect(turn).not.toBeNull();
    const card = turn!.guardPulseCard;
    expect(card).toEqual(aggregateGuardPulse(enoughEvents(), NOW, 'UTC'));
    expect(card.status).toBe('ok');
    expect(card.totalSample).toBe(8);
    expect(card.hours[23].intercepts).toBe(4);
    expect(card.hours[12].adoptions).toBe(2);
    expect(turn!.reply.length).toBeGreaterThan(0);
  });

  it('en: "my weakest shopping hour" → ok 态, timezone 透传聚合层', () => {
    const turn = buildGuardPulseTurn({
      userContent: 'my weakest shopping hour',
      locale: 'en',
      events: enoughEvents(),
      now: NOW,
      timezone: 'Asia/Kathmandu',
      rng: () => 0,
    });
    expect(turn!.guardPulseCard.status).toBe('ok');
    expect(turn!.guardPulseCard.resolvedTimezone).toBe('Asia/Kathmandu');
  });
});

describe('buildGuardPulseTurn — 引导态与红线', () => {
  it('样本不足 → insufficient 引导态 (guard_pulse_empty 场景), 卡恒 24 行', () => {
    const few = enoughEvents().slice(0, 3);
    const turn = buildGuardPulseTurn({
      userContent: '我什么时候最容易冲动', locale: 'zh', events: few, now: NOW, timezone: 'UTC', rng: () => 0,
    });
    expect(turn).not.toBeNull();
    expect(turn!.guardPulseCard.status).toBe('insufficient');
    expect(turn!.guardPulseCard.hours).toHaveLength(24);
    expect(turn!.guardPulseCard.windows).toEqual([]);
    expect(turn!.reply).toContain('节奏');
  });

  it('空事件 → insufficient', () => {
    const turn = buildGuardPulseTurn({
      userContent: 'my weakest shopping hour', locale: 'en', events: [], now: NOW, timezone: 'UTC', rng: () => 0,
    });
    expect(turn!.guardPulseCard.status).toBe('insufficient');
  });

  it('卡结构零金额零碳数值 (小时/次数/天数 only)', () => {
    const turn = buildGuardPulseTurn({
      userContent: '我什么时候最容易冲动', locale: 'zh', events: enoughEvents(), now: NOW, timezone: 'UTC', rng: () => 0,
    });
    const s = JSON.stringify(turn!.guardPulseCard);
    expect(s).not.toMatch(/\$|¥|€|£|amount|estSaved|percent|%|carbon|kg/i);
  });

  it('非脉搏问句 → null (不抢路由)', () => {
    expect(buildGuardPulseTurn({ userContent: '今天天气不错', locale: 'zh', events: enoughEvents(), now: NOW })).toBeNull();
    expect(buildGuardPulseTurn({ userContent: '这个月省了多少', locale: 'zh', events: enoughEvents(), now: NOW })).toBeNull();
    expect(buildGuardPulseTurn({ userContent: '我晚上冲动买的多吗', locale: 'zh', events: enoughEvents(), now: NOW })).toBeNull();
  });
});

describe('guard-pulse SSE', () => {
  it('canned 流先发卡事件再发 token + done (绝不经过 Letta)', async () => {
    const turn = buildGuardPulseTurn({
      userContent: '我什么时候最容易冲动', locale: 'zh', events: enoughEvents(), now: NOW, timezone: 'UTC', rng: () => 0,
    })!;
    const text = await new Response(buildGuardPulseSseStream(turn)).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('guard_pulse_card');
    expect(events[0].guardPulseCard.totalSample).toBe(8);
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});

describe('loadGuardPulseQueryData — 装载契约 (stub store)', () => {
  /** 最小结构面 stub: 按 (table, select) 记录查询形状, 返回预置数据 */
  function stubStore(rows: unknown, profile: unknown) {
    const calls: Array<{ table: string; select: string }> = [];
    const build = (table: string, select: string) => {
      calls.push({ table, select });
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: profile }),
        then: (onFulfilled: (res: { data: unknown }) => unknown) => onFulfilled({ data: rows }),
      };
      return builder;
    };
    return {
      calls,
      store: {
        from: (table: 'health_events' | 'profiles') => build(table, table === 'profiles' ? 'timezone' : 'event_type, metadata, created_at'),
      },
    };
  }

  it('双表只读: health_events 三类事件 + profiles.timezone', async () => {
    const { store, calls } = stubStore(
      [{ event_type: 'challenge_completed', metadata: null, created_at: '2026-09-08T12:00:00Z' }],
      { timezone: 'Asia/Kathmandu' },
    );
    const { events, timezone } = await loadGuardPulseQueryData({ userId: 'u1', store });
    expect(events).toEqual([{ eventType: 'challenge_completed', metadata: null, createdAt: '2026-09-08T12:00:00Z' }]);
    expect(timezone).toBe('Asia/Kathmandu');
    expect(calls.map((c) => c.table).sort()).toEqual(['health_events', 'profiles']);
  });

  it('事件类型白名单 = 拦截轮次 + 采纳轨道 (零 DDL, 复用既有表)', () => {
    expect([...GUARD_PULSE_EVENT_TYPES].sort()).toEqual(['challenge_completed', 'challenge_failed', 'mindful_recovery']);
  });

  it('未登录 / store 缺失 → 空事件 + undefined 时区', async () => {
    expect(await loadGuardPulseQueryData({ userId: undefined, store: null })).toEqual({ events: [], timezone: undefined });
    expect(await loadGuardPulseQueryData({ userId: 'u1', store: undefined })).toEqual({ events: [], timezone: undefined });
  });

  it('查询失败 → 空数组降级, 绝不抛错阻塞聊天', async () => {
    const badStore = {
      from: () => {
        throw new Error('boom');
      },
    };
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { events, timezone } = await loadGuardPulseQueryData({
      userId: 'u1',
      store: badStore as unknown as Parameters<typeof loadGuardPulseQueryData>[0]['store'],
    });
    expect(events).toEqual([]);
    expect(timezone).toBeUndefined();
    spy.mockRestore();
  });

  it('profile 无 timezone / 非字符串 → undefined (聚合层回退运行时本地)', async () => {
    const { store } = stubStore([], { timezone: 42 });
    const { timezone } = await loadGuardPulseQueryData({ userId: 'u1', store });
    expect(timezone).toBeUndefined();
  });
});
