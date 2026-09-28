// @vitest-environment happy-dom
/**
 * 🔧 b138 批B 必补: 回访条编排层测试 — 6 条回访条的出现/不出现 + onResolved 触发
 * (b138 §4 步2: 现有测试只测单个 part, 编排顺序无回归网 — 本文件补缺口)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FollowupStrips } from '../followup-strips';

// mock 全部 7 个 part 组件（轻渲染, 只验证编排层的出现/传递）
vi.mock('../../parts/chat-recap', () => ({
  ChatRecap: ({ topic, onDismiss }: { topic: string; onDismiss: () => void }) => (
    <div data-testid="recap" data-topic={topic} onClick={onDismiss} />
  ),
}));
vi.mock('../../parts/micro-challenge-followup', () => ({
  MicroChallengeFollowup: ({ record, onResolved }: { record: { id: string }; onResolved: () => void }) => (
    <div data-testid="micro-followup" data-id={record.id} onClick={onResolved} />
  ),
}));
vi.mock('../../parts/cooldown-followup', () => ({
  CooldownFollowup: ({ record }: { record: { id: string } }) => <div data-testid="cooldown-followup" data-id={record.id} />,
}));
vi.mock('../../parts/prepurchase-followup', () => ({
  PrepurchaseFollowup: ({ record, onResolved }: { record: { id: string }; onResolved: () => void }) => (
    <div data-testid="prepurchase-followup" data-id={record.id} onClick={onResolved} />
  ),
}));
vi.mock('../../parts/duplicate-reuse-followup', () => ({
  DuplicateReuseFollowup: ({ decisionId, onResolved }: { decisionId: string; onResolved: () => void }) => (
    <div data-testid="duplicate-followup" data-id={decisionId} onClick={onResolved} />
  ),
}));
vi.mock('../../parts/emotion-guard-checkin', () => ({
  EmotionGuardCheckin: ({ record }: { record: { id: string } }) => <div data-testid="emotion-checkin" data-id={record.id} />,
}));
vi.mock('../../parts/post-purchase-review', () => ({
  PostPurchaseReview: ({ record, onAnswered }: { record: { id: string }; onAnswered: () => void }) => (
    <div data-testid="post-review" data-id={record.id} onClick={onAnswered} />
  ),
}));

function makeStrips(overrides: Partial<ReturnType<typeof import('../../hooks/use-followup-strips')['useFollowupStrips']>> = {}) {
  return {
    recap: null, dismissRecap: vi.fn(),
    dueMicroChallenge: null, clearMicroChallengeFollowup: vi.fn(),
    dueCooldown: null,
    duePrepurchase: null, clearPrepurchaseFollowup: vi.fn(),
    dueDuplicateReuse: null, clearDuplicateReuseFollowup: vi.fn(),
    dueEmotionWait: null,
    dueReview: null, reviewSummary: { rating: 'worth_it', itemCount: 0 } as never, recordReview: vi.fn(),
    ...overrides,
  };
}

describe('FollowupStrips 编排层（b138 批B 回归网）', () => {
  beforeEach(() => cleanup());

  it('全空 strips → 7 个回访条都不渲染', () => {
    render(<FollowupStrips strips={makeStrips()} onRecapContinue={() => {}} />);
    expect(screen.queryByTestId('recap')).toBeNull();
    expect(screen.queryByTestId('micro-followup')).toBeNull();
    expect(screen.queryByTestId('cooldown-followup')).toBeNull();
    expect(screen.queryByTestId('prepurchase-followup')).toBeNull();
    expect(screen.queryByTestId('duplicate-followup')).toBeNull();
    expect(screen.queryByTestId('emotion-checkin')).toBeNull();
    expect(screen.queryByTestId('post-review')).toBeNull();
  });

  it('recap 命中 → 只渲染 recap 条, onContinue/onDismiss 透传', () => {
    const dismiss = vi.fn();
    render(<FollowupStrips strips={makeStrips({ recap: '「耳机」的绿色替代' as never, dismissRecap: dismiss })} onRecapContinue={() => {}} />);
    expect(screen.getByTestId('recap').getAttribute('data-topic')).toBe('「耳机」的绿色替代');
    expect(screen.queryByTestId('micro-followup')).toBeNull();
    screen.getByTestId('recap').click();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('6 条 followup 全命中 → 全部渲染且 onResolved 透传', () => {
    const clearMicro = vi.fn();
    const clearPre = vi.fn();
    const clearDup = vi.fn();
    const recordRev = vi.fn();
    render(
      <FollowupStrips
        strips={makeStrips({
          dueMicroChallenge: { id: 'm1' } as never, clearMicroChallengeFollowup: clearMicro,
          dueCooldown: { id: 'c1' } as never,
          duePrepurchase: { id: 'p1' } as never, clearPrepurchaseFollowup: clearPre,
          dueDuplicateReuse: { card: {}, decisionId: 'd1' } as never, clearDuplicateReuseFollowup: clearDup,
          dueEmotionWait: { id: 'e1' } as never,
          dueReview: { id: 'r1' } as never, recordReview: recordRev,
        })}
        onRecapContinue={() => {}}
      />,
    );
    expect(screen.getByTestId('micro-followup').getAttribute('data-id')).toBe('m1');
    expect(screen.getByTestId('cooldown-followup').getAttribute('data-id')).toBe('c1');
    expect(screen.getByTestId('prepurchase-followup').getAttribute('data-id')).toBe('p1');
    expect(screen.getByTestId('duplicate-followup').getAttribute('data-id')).toBe('d1');
    expect(screen.getByTestId('emotion-checkin').getAttribute('data-id')).toBe('e1');
    expect(screen.getByTestId('post-review').getAttribute('data-id')).toBe('r1');
    // onResolved 三路透传
    screen.getByTestId('micro-followup').click();
    expect(clearMicro).toHaveBeenCalledTimes(1);
    screen.getByTestId('prepurchase-followup').click();
    expect(clearPre).toHaveBeenCalledTimes(1);
    screen.getByTestId('duplicate-followup').click();
    expect(clearDup).toHaveBeenCalledTimes(1);
    screen.getByTestId('post-review').click();
    expect(recordRev).toHaveBeenCalledTimes(1);
  });

  it('只命中 cooldown → 其余 6 条不渲染（互不串扰）', () => {
    render(<FollowupStrips strips={makeStrips({ dueCooldown: { id: 'c9' } as never })} onRecapContinue={() => {}} />);
    expect(screen.getByTestId('cooldown-followup')).toBeTruthy();
    expect(screen.queryByTestId('recap')).toBeNull();
    expect(screen.queryByTestId('post-review')).toBeNull();
  });
});
