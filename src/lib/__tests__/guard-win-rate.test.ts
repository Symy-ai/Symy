/**
 * deriveGuardWinRate 纯函数测试 (batch49-c)
 * 漏斗三数 + streak + 去重 + 空/不足样本分支; 日期用本地固定时刻, 无 UTC 炸弹。
 */

import { describe, it, expect } from 'vitest';
import { deriveGuardWinRate, MIN_SAMPLE_SIZE, type GuardWinRateEventInput } from '../guard-win-rate';

let seq = 0;
function completed(dayOffsetAgo = 0, triggerId?: string): GuardWinRateEventInput {
  seq += 1;
  const d = new Date(2026, 8, 8 - dayOffsetAgo, 12);
  return {
    id: `c${seq}`,
    eventType: 'challenge_completed',
    triggerSource: 'chat_mcp',
    triggerId: triggerId ?? `cc:u${seq}`,
    metadata: null,
    createdAt: d.toISOString(),
  };
}

function failed(dayOffsetAgo = 0, triggerId?: string): GuardWinRateEventInput {
  seq += 1;
  const d = new Date(2026, 8, 8 - dayOffsetAgo, 13);
  return {
    id: `f${seq}`,
    eventType: 'challenge_failed',
    triggerSource: 'chat_mcp',
    triggerId: triggerId ?? `cf:u${seq}`,
    metadata: null,
    createdAt: d.toISOString(),
  };
}

function deposit(amount: number, dayOffsetAgo = 0, triggerId?: string): GuardWinRateEventInput {
  seq += 1;
  const d = new Date(2026, 8, 8 - dayOffsetAgo, 14);
  return {
    id: `d${seq}`,
    eventType: 'challenge_reward',
    triggerSource: 'deposit_api',
    triggerId: triggerId ?? `dep:u${seq}`,
    metadata: { source: 'deposit', fundId: 'savings', amount },
    createdAt: d.toISOString(),
  };
}

describe('deriveGuardWinRate', () => {
  it('empty / null input → insufficient with zeros', () => {
    for (const input of [null, undefined, []]) {
      const s = deriveGuardWinRate(input);
      expect(s.status).toBe('insufficient');
      expect(s.settled).toBe(0);
      expect(s.passed).toBe(0);
      expect(s.abandoned).toBe(0);
      expect(s.deposited).toBe(0);
      expect(s.winRate).toBe(0);
      expect(s.streakDays).toBe(0);
      expect(s.guardedAmount).toBe(0);
    }
  });

  it('below MIN_SAMPLE_SIZE settled rounds → insufficient (no fake 0%)', () => {
    const s = deriveGuardWinRate([completed(), completed(), completed(), failed()]);
    expect(s.settled).toBe(4);
    expect(s.settled).toBeLessThan(MIN_SAMPLE_SIZE);
    expect(s.status).toBe('insufficient');
    expect(s.winRate).toBe(0);
  });

  it('funnel counts: passed / abandoned / deposited, winRate = passed / settled', () => {
    const s = deriveGuardWinRate([
      completed(), completed(), completed(), completed(), completed(1),
      failed(1), failed(2),
      deposit(120), deposit(80, 1),
      // 无关事件不计数
      { id: 'x1', eventType: 'impulse_confessed', triggerSource: 'chat_mcp', triggerId: 't', metadata: null, createdAt: new Date(2026, 8, 8).toISOString() },
      // challenge_reward 但非 deposit_api 管道不计数
      { id: 'x2', eventType: 'challenge_reward', triggerSource: 'chat_mcp', triggerId: 't2', metadata: { source: 'deposit', amount: 50 }, createdAt: new Date(2026, 8, 8).toISOString() },
    ]);
    expect(s.status).toBe('ok');
    expect(s.settled).toBe(7);
    expect(s.passed).toBe(5);
    expect(s.abandoned).toBe(2);
    expect(s.deposited).toBe(2);
    expect(s.winRate).toBeCloseTo(5 / 7);
    expect(s.guardedAmount).toBe(200);
  });

  it('dedups by triggerId across duplicate writes', () => {
    const s = deriveGuardWinRate([
      completed(0, 'cc:dup'), completed(0, 'cc:dup'),
      failed(0, 'cf:dup'), failed(0, 'cf:dup'),
      completed(1, 'cc:a'), completed(2, 'cc:b'), completed(3, 'cc:c'),
      deposit(30, 0, 'dep:dup'), deposit(30, 0, 'dep:dup'),
    ]);
    expect(s.passed).toBe(4);
    expect(s.abandoned).toBe(1);
    expect(s.settled).toBe(5);
    expect(s.deposited).toBe(1);
    expect(s.guardedAmount).toBe(30);
  });

  it('streak counts consecutive local days with ≥1 win and 0 losses, stops at a loss day', () => {
    // 今天 3 胜, 昨天 2 胜, 前天 1 胜 1 败, 大前天 1 胜 → streak = 2
    const s = deriveGuardWinRate([
      completed(0), completed(0), completed(0),
      completed(1), completed(1),
      completed(2), failed(2),
      completed(3),
      failed(5),
    ]);
    expect(s.streakDays).toBe(2);
  });

  it('streak = 0 when the latest outcome day has a loss', () => {
    const s = deriveGuardWinRate([
      completed(1), completed(2), completed(3), completed(4),
      failed(0),
    ]);
    expect(s.status).toBe('ok');
    expect(s.streakDays).toBe(0);
  });

  it('invalid createdAt entries are dropped, not counted as samples', () => {
    const bad = { ...completed(), createdAt: 'not-a-date' };
    const s = deriveGuardWinRate([bad]);
    expect(s.settled).toBe(0);
    expect(s.status).toBe('insufficient');
  });

  it('deposits alone (no settled rounds) stay insufficient with amount preserved', () => {
    const s = deriveGuardWinRate([deposit(99), deposit(1)]);
    expect(s.status).toBe('insufficient');
    expect(s.deposited).toBe(2);
    expect(s.guardedAmount).toBe(100);
  });
});
