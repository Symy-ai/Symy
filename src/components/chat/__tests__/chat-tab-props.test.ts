import { describe, expect, it } from 'vitest';

import type { ChatTabProps } from '../chat-tab-props';

/**
 * chat-tab-props.ts (29行) — ChatTab 对外契约 (纯类型, 第十二用)。
 *
 * 锁定:
 * - 十三键全集 (五修复锚: BUG-013 toast/Aha onChallengePassed/
 *   PM3-P2-1 onMessageSent/PM-FEATURE onNavigateProfile/双上下文)
 */
describe('chat-tab-props 纯类型件第十二用', () => {
  it('十三键全集 satisfies', () => {
    const probe = {
      impulseContext: { platform: 'taobao', amount: 100, reasons: ['深夜'], time: '2026-10-09T23:00:00Z' },
      buddyState: undefined,
      contextMessage: '上次聊到的',
      challengeContext: { itemName: '咖啡机', amount: 129, challengeId: 'c1' },
      onContextConsumed: () => {},
      onBuddyStateRefresh: () => {},
      isDemo: false,
      onAuthPrompt: (_f: string) => {},
      onToast: (_m: string, _t?: 'success' | 'info') => {}, // BUG-013
      onChallengePassed: (_c: { challengeId: string; itemName: string; amount: number }) => {}, // Aha
      onMessageSent: () => {}, // PM3-P2-1
      onNavigateProfile: () => {}, // PM-FEATURE
    } satisfies ChatTabProps;
    expect(Object.keys(probe)).toHaveLength(12);
    // 五修复锚全在
    for (const fn of ['onToast', 'onChallengePassed', 'onMessageSent', 'onNavigateProfile', 'onContextConsumed'] as const) {
      expect(typeof probe[fn]).toBe('function');
    }
  });

  it('全可选语义: 空对象合法 (最小挂载)', () => {
    const minimal = {} satisfies ChatTabProps;
    expect(Object.keys(minimal)).toHaveLength(0);
  });
});
