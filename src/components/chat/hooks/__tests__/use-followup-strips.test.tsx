// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// 七个子 hook 全 mock (聚合层测试: 模块级常量返回 → 引用稳定, useMemo deps 不变)
const M = vi.hoisted(() => ({
  recap: { recap: { id: 'recap' }, dismiss: () => {} },
  mc: { dueRecord: { id: 'mc' }, clear: () => {} },
  cool: { dueRecord: { id: 'cool' } },
  pre: { dueRecord: { id: 'pre' }, clear: () => {} },
  dup: { due: { id: 'dup' }, clear: () => {} },
  emo: { dueRecord: { id: 'emo' } },
  rev: { dueReview: { id: 'rev' }, reviewSummary: null, recordReview: () => {} },
}));
vi.mock('../use-chat-recap', () => ({ useChatRecap: vi.fn(() => M.recap) }));
vi.mock('../use-micro-challenge-followup', () => ({ useMicroChallengeFollowup: vi.fn(() => M.mc) }));
vi.mock('../use-cooldown-followup', () => ({ useCooldownFollowup: vi.fn(() => M.cool) }));
vi.mock('../use-prepurchase-followup', () => ({ usePrepurchaseFollowup: vi.fn(() => M.pre) }));
vi.mock('../use-duplicate-reuse-followup', () => ({ useDuplicateReuseFollowup: vi.fn(() => M.dup) }));
vi.mock('../use-emotion-guard-followup', () => ({ useEmotionGuardFollowup: vi.fn(() => M.emo) }));
vi.mock('@/hooks/use-post-purchase-review', () => ({ usePostPurchaseReview: vi.fn(() => M.rev) }));

import { useFollowupStrips } from '../use-followup-strips';

const box: { current: ReturnType<typeof useFollowupStrips> | null } = { current: null };
function Probe() {
  box.current = useFollowupStrips({ messages: [], isDemo: false, historyReady: true });
  return null;
}

/**
 * use-followup-strips.ts (61行) — 七路回访条聚合层 (b138 R5 useMemo)。
 *
 * 锁定:
 * - 七路全键聚合 (recap/mc/cool/pre/dup/emo/rev)
 * - 返回引用跨渲染稳定 (useMemo b138 R5)
 */
describe('useFollowupStrips 聚合层', () => {
  it('七路全键聚合', () => {
    const { unmount } = render(<Probe />);
    const r = box.current as Record<string, unknown>;
    expect(r.recap).toEqual({ id: 'recap' });
    expect(typeof r.dismissRecap).toBe('function');
    expect(r.dueMicroChallenge).toEqual({ id: 'mc' });
    expect(r.dueCooldown).toEqual({ id: 'cool' });
    expect(r.duePrepurchase).toEqual({ id: 'pre' });
    expect(r.dueDuplicateReuse).toEqual({ id: 'dup' });
    expect(r.dueEmotionWait).toEqual({ id: 'emo' });
    expect(r.dueReview).toEqual({ id: 'rev' });
    expect(typeof r.recordReview).toBe('function');
    unmount();
  });

  it('返回引用跨渲染稳定 (useMemo)', () => {
    const { rerender, unmount } = render(<Probe />);
    const first = box.current;
    rerender(<Probe />);
    expect(box.current).toBe(first); // 同引用 (b138 R5 防引用陷阱)
    unmount();
  });
});
