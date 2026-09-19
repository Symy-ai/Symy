// @vitest-environment happy-dom
/**
 * duplicate-precheck 三件套联动契约 (batch90-c, 纯测试)
 *
 * b85-c 已钉 store 本体函数级分支, card / followup 各有单组件用例;
 * 本文件只钉跨组件链路 — card 决策 → store 上报/落盘 → hook 到期拾取 → followup 消解:
 * - reuse 建库闭环真通 (决策先上报, inventory POST 紧随, pending.decisionId 与事件 triggerId 同源)
 * - 'it' 兜底: 决策照报 + 零建库 POST, 追问 pending 仍落且 followup 用泛称
 * - wait: 零建库 POST + pending 不落 + hook 不出卡
 * - 24h 到期链: hook 拾取 pending → 答 avoided → conclusion 回链同 decisionId + pending 消解
 * - hook 门禁: isDemo / history 未就绪时到期 pending 不弹
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => ({
      'chat.duplicatePrecheck.genericItem': 'that item',
      'chat.duplicatePrecheck.title': 'Precheck',
      'chat.duplicatePrecheck.pause': `Pause ${vars?.item ?? ''}`,
      'chat.duplicatePrecheck.places.home': 'at home',
      'chat.duplicatePrecheck.places.food': 'in the kitchen',
      'chat.duplicatePrecheck.places.electronics': 'in the drawer',
      'chat.duplicatePrecheck.places.other': 'somewhere',
      'chat.duplicatePrecheck.reuseButton': 'Use it',
      'chat.duplicatePrecheck.waitButton': 'Wait',
      'chat.duplicatePrecheck.reuseNote': 'reuse note',
      'chat.duplicatePrecheck.waitNote': 'wait note',
      'chat.duplicatePrecheck.followupQuestion': `Did you skip ${vars?.item ?? ''}?`,
      'chat.duplicatePrecheck.followupAvoidedButton': 'avoided',
      'chat.duplicatePrecheck.followupBoughtButton': 'bought',
      'chat.duplicatePrecheck.followupAvoided': 'avoided note',
      'chat.duplicatePrecheck.followupBought': 'bought note',
    })[key] || key,
  }),
}));

import { DuplicatePrecheckCard } from '../duplicate-purchase-card';
import { DuplicateReuseFollowup } from '../duplicate-reuse-followup';
import { getDueReuseConfirmation, savePendingReuseConfirmation } from '../duplicate-purchase-store';
import { useDuplicateReuseFollowup } from '../../hooks/use-duplicate-reuse-followup';

const PENDING_KEY = 'symy-duplicate-precheck-reuse-pending';
const DAY_MS = 24 * 60 * 60 * 1000;

function pendingEntry(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, unknown>;
}

/** 把 pending 老化为「已过 24h 窗口」— 只改时间戳保留决策 ID, 模拟真实到期 */
function agePendingPastDue(): void {
  const entry = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, unknown>;
  window.localStorage.setItem(PENDING_KEY, JSON.stringify({
    ...entry,
    askedAt: Date.now() - DAY_MS - 60 * 60 * 1000,
    dueAt: Date.now() - 60 * 60 * 1000,
  }));
}

function inventoryCalls(): unknown[][] {
  return apiFetchMock.mock.calls.filter((call: unknown[]) => call[0] === '/api/inventory');
}

describe('duplicate-precheck 三件套联动 (batch90-c)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('reuse 建库闭环真通: 决策先上报, inventory POST 紧随, pending 与事件同 decisionId', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'storage box', category: 'home' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const [decisionCall, inventoryCall] = apiFetchMock.mock.calls;
    expect(decisionCall[0]).toBe('/api/buddy/health-events');
    expect(decisionCall[1].body.metadata.decision).toBe('reuse');
    // 时序契约: 决策事件先落, 建库 POST 紧随
    expect(inventoryCall[0]).toBe('/api/inventory');
    expect(inventoryCall[1]).toEqual({ method: 'POST', body: { item_name: 'storage box', category: 'home', source: 'chat' } });

    // 跨组件契约: localStorage pending 的 decisionId = 已报事件的 triggerId,
    // 24h 后的 conclusion 才能回链到这条原始决策
    const entry = pendingEntry();
    expect(entry.decisionId).toBe(decisionCall[1].body.triggerId);
    expect(getDueReuseConfirmation(Number(entry.dueAt) + 1)?.card).toEqual({ itemTitle: 'storage box', category: 'home' });
  });

  it('抽取失败兜底 "it": 决策照报, 零建库 POST, 追问 pending 仍落', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'it', category: 'other' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/buddy/health-events');
    expect(apiFetchMock.mock.calls[0][1].body.metadata).toEqual({ source: 'duplicate_precheck', item: 'it', category: 'other', decision: 'reuse' });
    expect(inventoryCalls()).toHaveLength(0);
    // 追问链不断: 兜底标题只是不建库, 24h 回访照常排上
    expect(pendingEntry().itemTitle).toBe('it');
  });

  it('"it" 到期追问用泛称渲染, 答 avoided 后 conclusion 回链并清 pending', () => {
    savePendingReuseConfirmation({ itemTitle: 'it', category: 'other' });
    const decisionId = String(pendingEntry().decisionId);
    agePendingPastDue();

    const due = getDueReuseConfirmation();
    if (!due) throw new Error('aged pending should be due');
    render(<DuplicateReuseFollowup card={due.card} decisionId={due.decisionId} />);

    // 泛称兜底: 裸 'it' 不直出, 问句走 genericItem 文案 (反例是 "Did you skip it?")
    expect(screen.getByTestId('duplicate-reuse-followup').textContent).toContain('Did you skip that item?');

    fireEvent.click(screen.getByTestId('duplicate-reuse-avoided'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.triggerId).toBe(`${decisionId}:conclusion`);
    expect(body.metadata.followUpAvoidedPurchase).toBe(true);
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('wait: 只报决策, 零建库 POST, pending 不落, hook 到期也不出卡', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'soy sauce', category: 'food' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-wait'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/buddy/health-events');
    expect(apiFetchMock.mock.calls[0][1].body.metadata.decision).toBe('wait');
    expect(inventoryCalls()).toHaveLength(0);
    // 实现契约: 仅 reuse 落 pending (b90-c 简报写的「wait 落 localStorage」与实现相反, 记 defects P3)
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();

    const { result } = renderHook(() => useDuplicateReuseFollowup({ isDemo: false, historyReady: true }));
    expect(result.current.due).toBeNull();
  });

  it('24h 到期链: hook 拾取 pending → followup 答 avoided → conclusion 回链 + pending 消解 + onResolved', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'cable', category: 'electronics' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));
    const decisionTriggerId = apiFetchMock.mock.calls[0][1].body.triggerId as string;
    apiFetchMock.mockClear();

    agePendingPastDue();

    const hook = renderHook(() => useDuplicateReuseFollowup({ isDemo: false, historyReady: true }));
    const due = hook.result.current.due;
    if (!due) throw new Error('aged pending should surface through the hook');
    expect(due.card).toEqual({ itemTitle: 'cable', category: 'electronics' });
    expect(due.decisionId).toBe(decisionTriggerId);

    const onResolved = vi.fn();
    render(<DuplicateReuseFollowup card={due.card} decisionId={due.decisionId} onResolved={onResolved} />);
    fireEvent.click(screen.getByTestId('duplicate-reuse-avoided'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.triggerId).toBe(`${decisionTriggerId}:conclusion`);
    expect(body.metadata).toEqual({ source: 'duplicate_precheck', decision: 'reuse', followUpAvoidedPurchase: true });
    // pending 已消解: 到期查询不再命中 (永不再问)
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(getDueReuseConfirmation(Date.now() + DAY_MS + 60_000)).toBeNull();
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('duplicate-reuse-followup-answered').textContent).toContain('avoided');
  });

  it('hook 门禁: isDemo 或 history 未就绪时到期 pending 不弹, 就绪后同一 pending 可拾取', () => {
    savePendingReuseConfirmation({ itemTitle: 'kettle', category: 'home' });
    agePendingPastDue();

    const demo = renderHook(() => useDuplicateReuseFollowup({ isDemo: true, historyReady: true }));
    expect(demo.result.current.due).toBeNull();

    const notReady = renderHook(() => useDuplicateReuseFollowup({ isDemo: false, historyReady: false }));
    expect(notReady.result.current.due).toBeNull();

    const ready = renderHook(() => useDuplicateReuseFollowup({ isDemo: false, historyReady: true }));
    expect(ready.result.current.due?.card).toEqual({ itemTitle: 'kettle', category: 'home' });
  });
});
