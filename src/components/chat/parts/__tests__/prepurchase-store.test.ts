// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import {
  _resetPrepurchaseStoreForTest,
  getActivePendingPrepurchase,
  getDuePrepurchase,
  getWeeklyGuardedAmount,
  pruneStalePendingPrepurchase,
  recordPrepurchaseDecision,
  recordPrepurchaseLetGo,
  resolvePendingPrepurchase,
  savePendingPrepurchase,
} from '../prepurchase-store';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * prepurchase-store.ts (182行) — 买前三问 localStorage store (零 DDL)。
 *
 * 红线: 金额只存在用户私域; buy 恒不计入周累计。
 *
 * 锁定:
 * - 周累计只计放弃: have_alt 或 cooldown+letGo
 * - pending: 24h 到期→due; 未到期 null; resolve 清
 * - 7 天僵尸线: 内 prune/active 双向
 * - 坏 JSON/坏记录 → 静默降级
 */
describe('prepurchase-store', () => {
  beforeEach(() => {
    _resetPrepurchaseStoreForTest();
  });

  it('周累计只计放弃: have_alt 与 letGo 计, buy 恒不计', () => {
    recordPrepurchaseDecision({ decision: 'buy', amount: 999 });
    recordPrepurchaseDecision({ decision: 'have_alt', amount: 120 });
    recordPrepurchaseLetGo(80); // cooldown + followupLetGo
    recordPrepurchaseDecision({ decision: 'cooldown_24h', amount: 50 }); // 未回访改判 → 不计
    expect(getWeeklyGuardedAmount()).toBe(200);
  });

  it('amount 非法值 (0/负/NaN) → 不计入', () => {
    recordPrepurchaseDecision({ decision: 'have_alt', amount: 0 });
    recordPrepurchaseDecision({ decision: 'have_alt', amount: -5 });
    recordPrepurchaseDecision({ decision: 'have_alt', amount: Number.NaN });
    expect(getWeeklyGuardedAmount()).toBe(0);
  });

  it('pending 生命周期: 未到期 null → 到期 due → resolve 清', () => {
    const now = Date.now();
    savePendingPrepurchase({ subject: '耳机', askedAt: now, dueAt: now + 24 * HOUR, amount: 300 });
    expect(getDuePrepurchase(now + 23 * HOUR)).toBeNull(); // 未到期
    expect(getDuePrepurchase(now + 25 * HOUR)).toMatchObject({ subject: '耳机', amount: 300 });
    resolvePendingPrepurchase();
    expect(getDuePrepurchase(now + 48 * HOUR)).toBeNull();
  });

  it('7 天僵尸线: 内仍 active, 超线 prune 丢弃', () => {
    const now = Date.now();
    savePendingPrepurchase({ subject: '旧物', askedAt: now, dueAt: now - 6 * DAY, amount: 10 });
    expect(getActivePendingPrepurchase(now)).toMatchObject({ subject: '旧物' }); // 6 天仍算进行中
    pruneStalePendingPrepurchase(now); // 未超 7 天不剪
    expect(getActivePendingPrepurchase(now)).not.toBeNull();
    savePendingPrepurchase({ subject: '僵尸', askedAt: now, dueAt: now - 8 * DAY, amount: 10 });
    expect(getActivePendingPrepurchase(now)).toBeNull(); // 超线不算 active
    pruneStalePendingPrepurchase(now);
    expect(getDuePrepurchase(now)).toBeNull(); // 已剪
  });

  it('坏 JSON → 静默降级零 crash', () => {
    localStorage.setItem('symy-prepurchase-decisions', '{broken');
    localStorage.setItem('symy-prepurchase-pending', 'not json');
    expect(getWeeklyGuardedAmount()).toBe(0);
    expect(getDuePrepurchase()).toBeNull();
  });

  it('决策日志 60 天过期清理', () => {
    // 手写老记录 (61 天前)
    const old = JSON.stringify([{ decision: 'have_alt', followupLetGo: false, amount: 500, decidedAt: Date.now() - 61 * DAY }]);
    localStorage.setItem('symy-prepurchase-decisions', old);
    recordPrepurchaseDecision({ decision: 'have_alt', amount: 30 }); // 追加时清老
    expect(getWeeklyGuardedAmount()).toBe(30); // 老的不计
  });
});
