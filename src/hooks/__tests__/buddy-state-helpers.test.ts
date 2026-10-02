import { describe, expect, it } from 'vitest';
import * as sharedDefaults from '@/lib/buddy-defaults';
import {
  DEFAULT_STATE,
  getHealthFromVitality,
  mergeServerStateIntoReact,
} from '../../hooks/buddy-state-helpers';

describe('buddy-state-helpers — 默认状态与健康转换', () => {
  it('DEFAULT_STATE 使用共享默认值且隔离可变嵌套结构', () => {
    expect(DEFAULT_STATE).toMatchObject({
      vitality: 72,
      health: 'healthy',
      level: 1,
      streak: 0,
      dreamFunds: [{ id: 'df-savings', name: 'Savings', target: 2147483647, current: 0 }],
      lastHealingKitAt: null,
      version: 0,
      proactiveMessages: [],
    });
    // 隔离: DEFAULT_STATE 的嵌套结构是共享常量的副本 — 改一边不串另一边
    expect(DEFAULT_STATE.badges).not.toBe(sharedDefaults.DEFAULT_BADGES);
    expect(DEFAULT_STATE.dailyNeeds).not.toBe(sharedDefaults.DEFAULT_DAILY_NEEDS);
  });

  it.each([
    [101, 'thriving'],
    [76, 'thriving'],
    [75, 'healthy'],
    [46, 'healthy'],
    [45, 'weak'],
    [21, 'weak'],
    [20, 'critical'],
    [1, 'critical'],
    [0, 'dormant'],
    [-1, 'dormant'],
    [Number.NaN, 'dormant'],
    [Number.POSITIVE_INFINITY, 'dormant'],
  ])('vitality %s → %s', (vitality, health) => {
    expect(getHealthFromVitality(vitality)).toBe(health);
  });
});

describe('mergeServerStateIntoReact — 服务端状态合并', () => {
  it('以服务端状态为主体并保留本地较高 streak', () => {
    const previous = { streak: 7, localOnly: 'previous', vitality: 50 };
    const server = { streak: 3, localOnly: 'server', vitality: 80 };

    expect(mergeServerStateIntoReact(previous, server)).toEqual({
      streak: 7,
      localOnly: 'server',
      vitality: 80,
    });
  });

  it('服务端 streak 较高时采用服务端值', () => {
    expect(mergeServerStateIntoReact({ streak: 2 }, { streak: 9 })).toEqual({ streak: 9 });
  });

  it('streak 相等时结果稳定', () => {
    expect(mergeServerStateIntoReact({ streak: 4 }, { streak: 4 })).toEqual({ streak: 4 });
  });

  it('完整 BuddyState 合并不修改输入对象', () => {
    const previous = { ...DEFAULT_STATE, streak: 8, vitality: 30 };
    const server = { ...DEFAULT_STATE, streak: 2, vitality: 90, tokens: 500 };
    const previousSnapshot = structuredClone(previous);
    const serverSnapshot = structuredClone(server);

    const merged = mergeServerStateIntoReact(previous, server);

    expect(merged.streak).toBe(8);
    expect(merged.vitality).toBe(90);
    expect(merged.tokens).toBe(500);
    expect(previous).toEqual(previousSnapshot);
    expect(server).toEqual(serverSnapshot);
  });

  it('合并时替换可变嵌套字段引用', () => {
    const previous = { ...DEFAULT_STATE, streak: 1, badges: ['old'], proactiveMessages: [] };
    const server = { ...DEFAULT_STATE, streak: 0, badges: ['new'], proactiveMessages: [] };

    const merged = mergeServerStateIntoReact(previous, server);

    expect(merged.badges).toBe(server.badges);
    expect(merged.proactiveMessages).toBe(server.proactiveMessages);
  });
});
