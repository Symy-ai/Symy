// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  _resetMicroChallengeStoreForTest,
  getDueMicroChallenge,
  pruneStalePendingMicroChallenge,
  readMicroChallengeHistory,
  recordMicroChallengeOffered,
  resolvePendingMicroChallenge,
  savePendingMicroChallenge,
} from '../micro-challenge-store';

/**
 * micro-challenge-store.ts (143行) — 微挑战 localStorage 持久化 (零 DDL)。
 *
 * 锁定:
 * - history: 形状校验坏数据当空 + 20 条上限裁剪
 * - pending: 五字段校验 + dueAt 到期门 + resolve 清除
 * - 7 天僵尸清理
 * - localStorage 不可用 → 全链静默降级
 */
describe('micro-challenge-store', () => {
  beforeEach(() => {
    _resetMicroChallengeStoreForTest();
    vi.clearAllMocks();
  });
  afterEach(() => _resetMicroChallengeStoreForTest());

  it('record + read 往返 (category+initiatedAt)', () => {
    expect(readMicroChallengeHistory()).toEqual([]);
    recordMicroChallengeOffered('electronics');
    recordMicroChallengeOffered('clothing');
    const h = readMicroChallengeHistory();
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ category: 'electronics' });
    expect(typeof h[0].initiatedAt).toBe('number');
  });

  it('history 20 条上限: 超出裁掉最老', () => {
    for (let i = 0; i < 25; i++) recordMicroChallengeOffered('food');
    expect(readMicroChallengeHistory()).toHaveLength(20);
  });

  it('坏数据当空: 非数组 JSON / 缺字段条目过滤', () => {
    localStorage.setItem('symy-micro-challenge-history', '{"not":"array"}');
    expect(readMicroChallengeHistory()).toEqual([]);
    localStorage.setItem(
      'symy-micro-challenge-history',
      JSON.stringify([{ category: 'bogus', initiatedAt: 1 }, { category: 'food', initiatedAt: 2 }, { category: 'food', initiatedAt: 'x' }, null]),
    );
    const h = readMicroChallengeHistory();
    expect(h).toHaveLength(1);
    expect(h[0].initiatedAt).toBe(2);
  });

  it('非法 JSON → 空数组静默', () => {
    localStorage.setItem('symy-micro-challenge-history', '{broken');
    expect(readMicroChallengeHistory()).toEqual([]);
  });

  it('pending 往返 + 到期门: 未到期 null / 到期返回', () => {
    const now = Date.now();
    savePendingMicroChallenge({ challengeId: 'c1', category: 'beauty', itemName: '口红', amount: 99, dueAt: now + 1000 });
    expect(getDueMicroChallenge()).toBeNull(); // 未到期
    expect(getDueMicroChallenge(now + 2000)).toMatchObject({ challengeId: 'c1', itemName: '口红', amount: 99 });
  });

  it('resolve 后回访不再出现', () => {
    const now = Date.now();
    savePendingMicroChallenge({ challengeId: 'c1', category: 'home', itemName: '台灯', amount: 50, dueAt: now - 1 });
    expect(getDueMicroChallenge()).toBeTruthy();
    resolvePendingMicroChallenge();
    expect(getDueMicroChallenge()).toBeNull();
  });

  it('7 天僵尸清理: 超 7 天 pruned + 日志', () => {
    const now = Date.now();
    savePendingMicroChallenge({ challengeId: 'old', category: 'food', itemName: 'x', amount: 1, dueAt: now - 8 * 24 * 3600 * 1000 });
    pruneStalePendingMicroChallenge();
    expect(getDueMicroChallenge()).toBeNull();
  });

  it('3 天内 pending 不被清理', () => {
    const now = Date.now();
    savePendingMicroChallenge({ challengeId: 'fresh', category: 'food', itemName: 'x', amount: 1, dueAt: now - 3 * 24 * 3600 * 1000 });
    pruneStalePendingMicroChallenge();
    expect(getDueMicroChallenge()).toMatchObject({ challengeId: 'fresh' });
  });

  it('pending 坏数据 (缺字段/非法 category) → null', () => {
    localStorage.setItem('symy-micro-challenge-pending', JSON.stringify({ challengeId: 'c', category: 'nope', itemName: 'x', amount: 1, dueAt: 1 }));
    expect(getDueMicroChallenge(9999999999999)).toBeNull();
  });
});
