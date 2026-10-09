// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { n?: number }) => {
  const map: Record<string, string> = {
    'onboarding.firstGateTitle': '先从这里开始',
    'onboarding.firstGateHint': '简单的三步',
    'onboarding.firstGateItemGoal': '目标 {n}',
  };
  let v = map[key] ?? key;
  if (opts && opts.n !== undefined) v = v.replace('{n}', String(opts.n));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { FIRST_GATE_CHALLENGES, FirstGateList } from '../first-gate-list';

/**
 * first-gate-list.tsx (50行) — 新手首关三挑战 (starter 过滤+period 排序+slice 3)。
 *
 * 锁定:
 * - FIRST_GATE_CHALLENGES: 全 starter 档, ≤3 条, period 排序 (daily<weekly<all_time)
 * - 渲染: 标题+hint+每条 title/desc/goal
 */
describe('FirstGateList 新手首关', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('FIRST_GATE_CHALLENGES: 全 starter, ≤3, period 有序', () => {
    expect(FIRST_GATE_CHALLENGES.length).toBeLessThanOrEqual(3);
    expect(FIRST_GATE_CHALLENGES.length).toBeGreaterThan(0);
    const pri = { daily: 0, weekly: 1, all_time: 2 } as const;
    for (let i = 1; i < FIRST_GATE_CHALLENGES.length; i++) {
      expect(pri[FIRST_GATE_CHALLENGES[i - 1].period]).toBeLessThanOrEqual(pri[FIRST_GATE_CHALLENGES[i].period]);
    }
    for (const c of FIRST_GATE_CHALLENGES) {
      expect(c.tier).toBe('starter'); // 只选新手档
    }
  });

  it('渲染: 标题+hint+每条三件', () => {
    render(<FirstGateList />);
    expect(screen.getByText('先从这里开始')).toBeTruthy();
    expect(screen.getByText('简单的三步')).toBeTruthy();
    const items = document.querySelectorAll('ul > li');
    expect(items.length).toBe(FIRST_GATE_CHALLENGES.length);
    // goal 徽章含 target 插值 (同 target 多条时 getAll)
    const first = FIRST_GATE_CHALLENGES[0];
    expect(screen.getAllByText(`目标 ${first.target}`).length).toBeGreaterThanOrEqual(1);
  });
});
