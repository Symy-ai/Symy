// @vitest-environment happy-dom
/**
 * batch76-b — components/chat/sections/deposit-dialog-section.tsx 现状固化
 * （batch75 第一段未落地遗留；testgap v3 §五 快速可补条目）
 *
 * 核心断言：存钱目标基金预选回退链（batch6-b + PM-P0-1）
 *   getGuardTargetFundId() 且未满 → 第一个未满 → id=SAVINGS_FUND_ID（无论满否）
 *   → funds[0]；dreamFunds 缺失 → 全 undefined。props 透传与回调接线一并钉住。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import type { DreamFund } from '@/types/buddy-state';

const mocks = vi.hoisted(() => ({
  guardTargetId: 'df-travel',
  depositProps: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/guard-ledger', () => ({
  getGuardTargetFundId: () => mocks.guardTargetId,
}));

vi.mock('../../deposit-dialog', () => ({
  // props 捕获桩：不渲染真实 DepositDialog（其行为由 batch75-b 专属测试覆盖）
  DepositDialog: (props: Record<string, unknown>) => {
    mocks.depositProps = props;
    return createElement('div', { 'data-testid': 'deposit-dialog-stub' });
  },
}));

import { DepositDialogSection } from '../deposit-dialog-section';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';

function fund(overrides: Partial<DreamFund>): DreamFund {
  return { id: 'f1', name: 'Fund', target: 1000, current: 0, emoji: '🏦', ...overrides };
}

describe('DepositDialogSection — 预选回退链', () => {
  beforeEach(() => {
    mocks.depositProps = null;
    mocks.guardTargetId = 'df-travel';
  });
  afterEach(() => {
    cleanup();
  });

  const funds: DreamFund[] = [
    fund({ id: 'df-savings', name: 'Savings', emoji: '🏦', target: 1000, current: 1000 }), // 满
    fund({ id: 'df-travel', name: 'Travel', emoji: '✈️', target: 500, current: 100 }),     // 守护目标，未满
    fund({ id: 'df-emergency', name: 'Emergency', emoji: '🛟', target: 800, current: 10 }), // 第一个未满
  ];

  it('守护目标基金存在且未满 → 预选它（batch6-b 主路径）', () => {
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      dreamFunds: funds,
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBe('df-travel');
    expect(mocks.depositProps?.fundName).toBe('Travel');
    expect(mocks.depositProps?.fundEmoji).toBe('✈️');
  });

  it('守护目标不存在 → 回退第一个未满基金', () => {
    mocks.guardTargetId = 'df-nonexistent';
    // travel 也置满，验证回退越过它命中 emergency
    const travelFull = funds.map((f) => (f.id === 'df-travel' ? { ...f, current: 500 } : f));
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      dreamFunds: travelFull,
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBe('df-emergency');
  });

  it('守护目标已满 → 跳过它，回退第一个未满基金', () => {
    mocks.guardTargetId = 'df-savings'; // 列表里唯一已满的
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      dreamFunds: funds,
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBe('df-travel'); // 排除已满的 savings → Travel
  });

  it('全部已满 → 第三优先级命中 id=SAVINGS_FUND_ID（该层不检查是否已满 — 现状固化）', () => {
    mocks.guardTargetId = 'df-nonexistent';
    const allFull: DreamFund[] = [
      fund({ id: 'df-travel', name: 'Travel', target: 100, current: 100 }),
      fund({ id: SAVINGS_FUND_ID, name: 'Savings', target: 100, current: 100 }),
    ];
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      dreamFunds: allFull,
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBe(SAVINGS_FUND_ID);
  });

  it('全满且列表无 Savings → 兜底 funds[0]', () => {
    mocks.guardTargetId = 'df-nonexistent';
    const allFull: DreamFund[] = [
      fund({ id: 'df-a', name: 'A', target: 100, current: 100 }),
      fund({ id: 'df-b', name: 'B', target: 100, current: 100 }),
    ];
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      dreamFunds: allFull,
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBe('df-a');
  });

  it('dreamFunds 缺失 → fund* props 为 undefined，弹窗仍渲染', () => {
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-1', savedAmount: 25 },
      onClose: () => {},
      onDeposited: () => {},
    }));
    expect(mocks.depositProps?.fundId).toBeUndefined();
    expect(mocks.depositProps?.fundName).toBeUndefined();
    expect(mocks.depositProps?.fundEmoji).toBeUndefined();
  });

  it('challengeId/savedAmount 透传，onClose/onDeposited 接线到弹窗回调', () => {
    const onClose = vi.fn();
    const onDeposited = vi.fn();
    render(createElement(DepositDialogSection, {
      depositDialog: { challengeId: 'ch-42', savedAmount: 33.5 },
      dreamFunds: funds,
      onClose,
      onDeposited,
    }));
    expect(mocks.depositProps?.challengeId).toBe('ch-42');
    expect(mocks.depositProps?.savedAmount).toBe(33.5);
    expect(mocks.depositProps?.onClose).toBe(onClose);
    expect(mocks.depositProps?.onDeposited).toBe(onDeposited);
  });
});
