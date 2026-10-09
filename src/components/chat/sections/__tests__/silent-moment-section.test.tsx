// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const overlayCalls: Array<Record<string, unknown>> = [];
const completeFns: Array<() => void> = [];
vi.mock('../../silent-moment-overlay', () => ({
  SilentMomentOverlay: vi.fn((props: Record<string, unknown>) => {
    overlayCalls.push(props);
    completeFns.push(props.onComplete as () => void);
    return <div data-testid="smo" />;
  }),
}));

import { SilentMomentSection } from '../silent-moment-section';

const base = {
  outcome: 'saw' as const,
  amount: 88,
  itemName: '咖啡机',
  hoursOfLife: 3.5,
};

/**
 * silent-moment-section.tsx (38行) — 沉默时刻编排 (需求九+Round 74 Finding 4)。
 *
 * 锁定:
 * - 五 props 透传 overlay
 * - onComplete 顺序: pendingDeposit → onOpenDeposit; pendingAhaMoment →
 *   onChallengePassed (仪式后 — Round 74 防重叠); 最后 onComplete
 */
describe('SilentMomentSection 沉默时刻编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayCalls.length = 0;
    completeFns.length = 0;
  });
  afterEach(() => cleanup());

  it('五 props 透传', () => {
    render(<SilentMomentSection silentMoment={{ ...base }} onOpenDeposit={vi.fn()} onComplete={vi.fn()} />);
    const props = overlayCalls[0];
    expect(props.outcome).toBe('saw');
    expect(props.amount).toBe(88);
    expect(props.itemName).toBe('咖啡机');
    expect(props.hoursOfLife).toBe(3.5);
  });

  it('完成链: deposit→aha→onComplete 顺序 (Round 74)', () => {
    const order: string[] = [];
    render(
      <SilentMomentSection
        silentMoment={{
          ...base,
          pendingDeposit: { challengeId: 'c1', savedAmount: 88 },
          pendingAhaMoment: { challengeId: 'c1', itemName: '咖啡机', amount: 88 },
        }}
        onOpenDeposit={(d) => order.push(`deposit:${d.savedAmount}`)}
        onChallengePassed={(c) => order.push(`aha:${c.itemName}`)}
        onComplete={() => order.push('complete')}
      />,
    );
    completeFns[0]();
    expect(order).toEqual(['deposit:88', 'aha:咖啡机', 'complete']); // 顺序锚
  });

  it('无 pending → 仅 onComplete', () => {
    const onOpenDeposit = vi.fn();
    const onChallengePassed = vi.fn();
    const onComplete = vi.fn();
    render(<SilentMomentSection silentMoment={{ ...base }} onOpenDeposit={onOpenDeposit} onChallengePassed={onChallengePassed} onComplete={onComplete} />);
    completeFns[0]();
    expect(onOpenDeposit).not.toHaveBeenCalled();
    expect(onChallengePassed).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
