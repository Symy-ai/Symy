// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetCooldownStoreForTest,
  getDueCooldown,
  pruneStalePendingCooldown,
  resolvePendingCooldown,
  savePendingCooldown,
} from '../cooldown-store';

const DAY = 86400000;

function rec(over: Record<string, unknown> = {}) {
  return {
    category: 'electronics' as const,
    askedAt: Date.now() - DAY,
    dueAt: Date.now() + DAY, // 默认未到期
    userChoseBuy: false,
    ...over,
  };
}

/**
 * cooldown-store.ts (96行) — 冷静卡回访 localStorage 持久化 (零 DDL)。
 *
 * 锁定:
 * - save/get 往返; 未到期 null / 到期返回
 * - 坏数据三态静默当无 (非 JSON/非对象/字段缺失/坏 category)
 * - resolve 清除
 * - 7 天僵尸 prune 边界
 */
describe('cooldown-store 冷静卡回访', () => {
  beforeEach(() => {
    _resetCooldownStoreForTest();
    window.localStorage.clear();
  });
  afterEach(() => window.localStorage.clear());

  it('往返: save 后未到期 → null; 到期 → 返回记录', () => {
    savePendingCooldown(rec());
    expect(getDueCooldown()).toBeNull(); // dueAt 未来
    savePendingCooldown(rec({ dueAt: Date.now() - 1000 }));
    const due = getDueCooldown();
    expect(due).toMatchObject({ category: 'electronics', userChoseBuy: false });
  });

  it('category null 合法 (不限品类冷静)', () => {
    savePendingCooldown(rec({ category: null, dueAt: Date.now() - 1 }));
    const due = getDueCooldown();
    expect(due?.category).toBeNull();
  });

  it('坏数据静默当无: 非 JSON / 字段缺失 / 坏 category', () => {
    window.localStorage.setItem('symy-cooldown-pending', '{oops');
    expect(getDueCooldown()).toBeNull();
    window.localStorage.setItem('symy-cooldown-pending', JSON.stringify({ category: 'electronics' }));
    expect(getDueCooldown()).toBeNull(); // askedAt/dueAt/userChoseBuy 缺
    window.localStorage.setItem(
      'symy-cooldown-pending',
      JSON.stringify(rec({ category: 'cars', dueAt: Date.now() - 1 })),
    );
    expect(getDueCooldown()).toBeNull(); // 非法 category
  });

  it('resolve → 清除 (getDue 回 null)', () => {
    savePendingCooldown(rec({ dueAt: Date.now() - 1 }));
    resolvePendingCooldown();
    expect(getDueCooldown()).toBeNull();
  });

  it('7 天僵尸 prune (基准=dueAt): 到期 6d23h 保留 / 到期 7d01m 清除', () => {
    savePendingCooldown(rec({ dueAt: Date.now() - (7 * DAY - 3600000) }));
    pruneStalePendingCooldown();
    expect(getDueCooldown()).not.toBeNull(); // due 后未满 7 天
    savePendingCooldown(rec({ dueAt: Date.now() - (7 * DAY + 60000) }));
    pruneStalePendingCooldown();
    expect(getDueCooldown()).toBeNull(); // due 后超 7 天清
  });
});
