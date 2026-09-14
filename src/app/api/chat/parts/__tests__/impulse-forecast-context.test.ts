/**
 * impulse-forecast-context 测试 (batch62-c)
 *
 * 覆盖验收:
 * 1. 装载器: 三类可读事件 .in 查询 (manual_adjustment 在列, reward 不在);
 *    未登录/store 缺失/查询失败 → 空数组降级, 绝不抛错
 * 2. 摘要: ok 态含 status/high/medium 计数 + watch day (Monday=0) + 固定枚举;
 *    样本不足 → 明确降级行 (insufficient + 禁止编造), 不含编造规律
 * 3. 摘要无金额无百分比; 失败 → undefined (字段省略)
 */

import { describe, expect, it } from 'vitest';
import {
  buildImpulseForecastLine,
  loadImpulseForecastEvents,
  loadImpulseForecastContextLine,
  IMPULSE_FORECAST_EVENT_TYPES,
  type ImpulseForecastStore,
} from '../impulse-forecast-context';
import { forecastImpulseRisk } from '@/lib/impulse-forecast';

const NOW = new Date(2026, 8, 9, 12, 0, 0);

function daysAgo(n: number, hour = 12): string {
  return new Date(2026, 8, 9 - n, hour, 0, 0).toISOString();
}

/** 最小 thenable 桩 — 记录调用链, 返回注入数据 */
function stubStore(rows: unknown[], opts: { fail?: boolean } = {}): { store: ImpulseForecastStore; calls: string[][] } {
  const calls: string[][] = [];
  const chain: Record<string, unknown> = {};
  const record = (method: string, args: string[][] = []) => {
    calls.push([method, ...args.flat()]);
    return chain;
  };
  Object.assign(chain, {
    select: (cols: string) => record('select', [[cols]]),
    eq: (col: string, val: string) => record('eq', [[col, val]]),
    in: (col: string, vals: readonly string[]) => record('in', [[col, vals.join(',')]]),
    order: (col: string, o: { ascending: boolean }) => record('order', [[col, String(o.ascending)]]),
    limit: (n: number) => record('limit', [[String(n)]]),
    then: (onFulfilled: (res: { data: unknown }) => unknown, onRejected: (err: unknown) => unknown) => {
      if (opts.fail) return Promise.reject(new Error('boom')).then(onFulfilled, onRejected);
      return Promise.resolve(onFulfilled({ data: rows }));
    },
  });
  return { store: { from: () => chain as never }, calls };
}

describe('loadImpulseForecastEvents — 装载契约', () => {
  it('in 查询锁定三类可读事件: manual_adjustment 在列, challenge_reward 不在', async () => {
    const { store, calls } = stubStore([]);
    await loadImpulseForecastEvents({ userId: 'u1', store });
    const inCall = calls.find(([m]) => m === 'in');
    expect(inCall).toBeDefined();
    const [, , vals] = inCall!;
    expect(vals.split(',')).toEqual([...IMPULSE_FORECAST_EVENT_TYPES]);
    expect(vals).toContain('manual_adjustment');
    expect(vals).not.toContain('challenge_reward');
    expect(vals).not.toContain('mindful_recovery');
  });

  it('行 → camelCase 映射; 未登录/store 缺失/异常 → 空数组', async () => {
    const { store } = stubStore([
      { event_type: 'challenge_completed', metadata: { category: 'beauty' }, created_at: daysAgo(1) },
      { event_type: null, metadata: null, created_at: daysAgo(2) },
    ]);
    const events = await loadImpulseForecastEvents({ userId: 'u1', store });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ eventType: 'challenge_completed', metadata: { category: 'beauty' }, createdAt: daysAgo(1) });
    expect(events[1].eventType).toBe('');

    await expect(loadImpulseForecastEvents({ userId: undefined, store })).resolves.toEqual([]);
    await expect(loadImpulseForecastEvents({ userId: 'u1', store: null })).resolves.toEqual([]);

    const failing = stubStore([], { fail: true });
    await expect(loadImpulseForecastEvents({ userId: 'u1', store: failing.store })).resolves.toEqual([]);
  });
});

describe('buildImpulseForecastLine — 摘要', () => {
  it('ok 态: 单行 symy_impulse_forecast, 含计数/星期/窗口/固定枚举, 无金额无百分比', () => {
    const events = [
      { eventType: 'challenge_completed', metadata: { category: 'beauty' }, createdAt: daysAgo(0, 23) },
      { eventType: 'challenge_failed', metadata: { category: 'beauty' }, createdAt: daysAgo(7, 23) },
      { eventType: 'manual_adjustment', metadata: null, createdAt: daysAgo(14, 23) },
      { eventType: 'challenge_completed', metadata: { category: 'beauty' }, createdAt: daysAgo(21, 23) },
      { eventType: 'challenge_completed', metadata: null, createdAt: daysAgo(34, 19) },
      { eventType: 'challenge_completed', metadata: null, createdAt: daysAgo(41, 19) },
      { eventType: 'challenge_completed', metadata: null, createdAt: daysAgo(48, 19) },
      { eventType: 'challenge_completed', metadata: null, createdAt: daysAgo(55, 19) },
    ];
    const line = buildImpulseForecastLine(forecastImpulseRisk(events, NOW));
    expect(line.startsWith('symy_impulse_forecast:')).toBe(true);
    expect(line).toContain('high-risk days 1, medium 1');
    expect(line).toContain('most triggered category beauty');
    expect(line).toContain('day-2'); // 周三 Monday=0 → 2
    expect(line).toContain('lateNight');
    expect(line).toContain('NOT predictions');
    expect(line).not.toMatch(/\$|¥|%|carbon|kg/i);
  });

  it('样本不足 → 明确降级行: insufficient + 禁止编造规律 (不输出任何规律断言)', () => {
    const line = buildImpulseForecastLine(forecastImpulseRisk([], NOW));
    expect(line).toContain('symy_impulse_forecast:');
    expect(line).toContain('insufficient sample (0');
    expect(line).toContain('do NOT invent patterns');
    expect(line).not.toContain('category');
    expect(line).not.toMatch(/high-risk days [1-7]/);
  });
});

describe('loadImpulseForecastContextLine — 注入点', () => {
  it('ok 态返回摘要行; 样本不足返回降级行 (明确降级, 不是 undefined)', async () => {
    const okStore = stubStore(
      Array.from({ length: 8 }, (_, i) => ({
        event_type: 'challenge_completed',
        metadata: null,
        created_at: daysAgo(i * 2 + 1),
      })),
    ).store;
    const okLine = await loadImpulseForecastContextLine({ userId: 'u1', store: okStore });
    expect(okLine).toBeDefined();
    expect(okLine).toContain('symy_impulse_forecast:');
    expect(okLine).not.toContain('insufficient sample');

    const emptyLine = await loadImpulseForecastContextLine({ userId: 'u1', store: stubStore([]).store });
    expect(emptyLine).toContain('do NOT invent patterns');
  });

  it('查询失败与空样本同路径 → 明确降级行; 未登录/store 缺失 → undefined', async () => {
    const failing = stubStore([], { fail: true });
    await expect(loadImpulseForecastContextLine({ userId: 'u1', store: failing.store })).resolves.toContain('do NOT invent patterns');
    await expect(loadImpulseForecastContextLine({ userId: undefined, store: stubStore([]).store })).resolves.toBeUndefined();
    await expect(loadImpulseForecastContextLine({ userId: 'u1', store: undefined })).resolves.toBeUndefined();
  });
});
