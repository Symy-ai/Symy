import { describe, expect, it } from 'vitest';

import type { ProfileTabProps } from '../profile-tab-props';

/**
 * profile-tab-props.ts (21行) — ProfileTab 对外契约 (纯类型, 第十四用)。
 *
 * 锁定:
 * - 十七键全集 (全可选 — 最小挂载 {} 合法)
 * - 梦想基金 CRUD 四回调 + 数据双通道 (summary 投影+完整列表)
 */
describe('profile-tab-props 纯类型件第十四用', () => {
  it('十六键全集 satisfies', () => {
    const probe = {
      darkMode: true,
      onOpenInsights: () => {},
      onToggleDarkMode: () => {},
      onNavigateMonitor: () => {},
      isDemo: false,
      onAuthPrompt: (_f: string) => {},
      buddyStreak: 5,
      buddyTotalSaved: 1200,
      buddyChallengesCompleted: 8,
      buddyDreamFunds: [{ current: 50, target: 100 }],
      isActive: true,
      onCreateDreamFund: (_f: object) => 'id',
      onUpdateDreamFund: (_id: string, _u: object) => {},
      onDeleteDreamFund: (_id: string) => {},
      onReorderDreamFunds: (_o: string[]) => {},
      dreamFunds: [],
    } satisfies ProfileTabProps;
    expect(Object.keys(probe)).toHaveLength(16);
    // CRUD 四回调
    for (const fn of ['onCreateDreamFund', 'onUpdateDreamFund', 'onDeleteDreamFund', 'onReorderDreamFunds'] as const) {
      expect(typeof probe[fn]).toBe('function');
    }
  });

  it('全可选: {} 最小挂载合法', () => {
    const minimal = {} satisfies ProfileTabProps;
    expect(Object.keys(minimal)).toHaveLength(0);
  });
});
