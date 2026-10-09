import { describe, expect, it } from 'vitest';

import type { BuddyTabProps } from '../buddy-tab-props';

/**
 * buddy-tab-props.ts (34行) — BuddyTab 对外契约 (纯类型, 第十三用)。
 *
 * 锁定:
 * - 必填三件 (buddyState/onNavigateChat/onRevive/onAddTokens)
 * - 梦想基金 CRUD 四回调 (BUG-014 拖拽排序)
 * - 修复锚: Round 3 C4 healing-kit/Round 33 userId/Bug 17 isLoading/
 *   P0 hourlyRateProp/PM3-P2-1 双件/Round 105 gacha
 */
describe('buddy-tab-props 纯类型件第十三用', () => {
  it('十九键全集 satisfies (含六修复锚)', () => {
    const probe = {
      buddyState: { health: 'healthy', tokens: 10 } as never,
      onNavigateChat: (_c?: { type: 'challenge' | 'healing' | 'default'; message?: string }) => {},
      onRevive: () => {},
      onAddTokens: (_a: number, _r: 'survival' | 'growth' | 'pleasure') => {},
      onUseHealingKit: () => Promise.resolve('success' as const), // Round 3 C4
      onBuddyStateRefresh: () => {},
      onToast: (_m: string, _t?: 'success' | 'info') => {},
      isDemo: false,
      userId: 'u1', // Round 33
      isLoading: false, // Bug 17
      onCreateDreamFund: (_f: object) => 'id',
      onUpdateDreamFund: (_id: string, _u: object) => {},
      onDeleteDreamFund: (_id: string) => {},
      onReorderDreamFunds: (_o: string[]) => {}, // BUG-014
      hourlyRateProp: 50, // P0
      onSeeIt: () => {}, // PM3-P2-1
      onGacha: () => {}, // Round 105
      onSetRate: () => {},
      dailyTasks: undefined,
      dailyTasksCompleted: 0,
    } satisfies BuddyTabProps;
    expect(Object.keys(probe)).toHaveLength(20);
  });

  it('最小挂载: 仅必填四件合法', () => {
    const minimal = {
      buddyState: {} as never,
      onNavigateChat: () => {},
      onRevive: () => {},
      onAddTokens: () => {},
    } satisfies BuddyTabProps;
    expect(Object.keys(minimal)).toHaveLength(4);
  });
});
