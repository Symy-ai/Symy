// @vitest-environment happy-dom
/**
 * Tests for duplicate-purchase-store (batch85-c testgap)
 *
 * 组件测试 (duplicate-purchase-card / duplicate-reuse-followup) 只走 happy path,
 * 本文件直接压 store 本体的盲区分支:
 * - slug 规范化边界 (空白/标点/中文保留/32 截断/纯标点兜底 'item')
 * - getDueReuseConfirmation: 未到期 / 坏 JSON / 字段类型不符 / SSR
 * - savePendingReuseConfirmation: localStorage 抛异常吞掉 / SSR 不落盘
 * - 全部 apiFetch 失败路径: 只 warn 不上抛 (best-effort 红线)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { logger } from '@/lib/logger';
import {
  clearPendingReuseConfirmation,
  getDueReuseConfirmation,
  reportDuplicateDecision,
  reportReuseConclusion,
  saveInventoryItemFromChat,
  savePendingReuseConfirmation,
} from '../duplicate-purchase-store';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 与 store 同款本地日期键 — 断言 triggerId 的日期段用 (格式钉死, 不吃时区) */
function expectedDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function savedEntry(): Record<string, unknown> {
  const raw = window.localStorage.getItem('symy-duplicate-precheck-reuse-pending');
  return JSON.parse(raw ?? '{}') as Record<string, unknown>;
}

describe('saveInventoryItemFromChat', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    vi.mocked(logger.warn).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('posts to /api/inventory with chat source', () => {
    saveInventoryItemFromChat({ itemTitle: 'storage box', category: 'home' });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith('/api/inventory', {
      method: 'POST',
      body: { item_name: 'storage box', category: 'home', source: 'chat' },
    });
  });

  it('skips the fallback title "it" (would pollute the inventory)', () => {
    saveInventoryItemFromChat({ itemTitle: 'it', category: 'other' });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('swallows apiFetch rejection with a warn (best-effort write)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('503 table missing'));
    saveInventoryItemFromChat({ itemTitle: 'lamp', category: 'home' });
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(logger.warn).toHaveBeenCalledWith('[duplicate-precheck] inventory save failed:', '503 table missing');
  });
});

describe('reportDuplicateDecision', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    vi.mocked(logger.warn).mockClear();
  });

  it('reuse reports one event then writes inventory (exactly two calls)', () => {
    reportDuplicateDecision({ itemTitle: 'Storage  Box!', category: 'home' }, 'reuse');
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/buddy/health-events');
    const event = apiFetchMock.mock.calls[0][1].body;
    expect(event.eventType).toBe('manual_adjustment');
    expect(event.triggerSource).toBe('manual');
    // slug 规范化: 多空白/标点折叠为单连字符, 小写
    expect(event.triggerId).toBe(`duplicate-precheck:${expectedDateKey()}:storage-box:reuse`);
    expect(event.metadata).toEqual({ source: 'duplicate_precheck', item: 'Storage  Box!', category: 'home', decision: 'reuse' });
    expect(apiFetchMock.mock.calls[1][0]).toBe('/api/inventory');
  });

  it('wait reports only the event — no inventory write, no pending entry', () => {
    reportDuplicateDecision({ itemTitle: 'soy sauce', category: 'food' }, 'wait');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][1].body.metadata.decision).toBe('wait');
    expect(window.localStorage.getItem('symy-duplicate-precheck-reuse-pending')).toBeNull();
  });

  it('keeps CJK titles in the trigger id slug', () => {
    reportDuplicateDecision({ itemTitle: '投影仪', category: 'electronics' }, 'wait');
    expect(apiFetchMock.mock.calls[0][1].body.triggerId).toBe(`duplicate-precheck:${expectedDateKey()}:投影仪:wait`);
  });

  it('truncates slug at 32 chars and falls back to "item" when nothing survives', () => {
    const long = 'a'.repeat(40);
    reportDuplicateDecision({ itemTitle: long, category: 'other' }, 'wait');
    expect(apiFetchMock.mock.calls[0][1].body.triggerId).toBe(`duplicate-precheck:${expectedDateKey()}:${'a'.repeat(32)}:wait`);

    apiFetchMock.mockClear();
    reportDuplicateDecision({ itemTitle: '!!!???', category: 'other' }, 'wait');
    expect(apiFetchMock.mock.calls[0][1].body.triggerId).toBe(`duplicate-precheck:${expectedDateKey()}:item:wait`);
  });

  it('event-report failure only warns and still triggers the reuse inventory write', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    reportDuplicateDecision({ itemTitle: 'kettle', category: 'home' }, 'reuse');
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith('[duplicate-precheck] decision report failed:', 'network down'));
    expect(apiFetchMock.mock.calls[1][0]).toBe('/api/inventory');
  });
});

describe('savePendingReuseConfirmation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    vi.mocked(logger.warn).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('persists a 24h follow-up window with a reuse decision id', () => {
    const before = Date.now();
    savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' });
    const entry = savedEntry();
    expect(entry.itemTitle).toBe('cable');
    expect(entry.category).toBe('electronics');
    expect(entry.decisionId).toBe(`duplicate-precheck:${expectedDateKey(new Date(before))}:cable:reuse`);
    expect(entry.askedAt).toBeGreaterThanOrEqual(before);
    expect(Number(entry.dueAt) - Number(entry.askedAt)).toBe(DAY_MS);
  });

  it('swallows localStorage write failures (quota / privacy mode)', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' })).not.toThrow();
    setItem.mockRestore();
  });

  it('does nothing when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' })).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getDueReuseConfirmation', () => {
  const CARD = { itemTitle: 'cable', category: 'electronics' } as const;
  const DECISION_ID = `duplicate-precheck:${expectedDateKey()}:cable:reuse`;

  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns null with no pending entry', () => {
    expect(getDueReuseConfirmation()).toBeNull();
  });

  it('returns null while the 24h window is still open, then the card once due', () => {
    savePendingReuseConfirmation(CARD);
    const entry = savedEntry();
    expect(getDueReuseConfirmation(Number(entry.askedAt) + 60_000)).toBeNull(); // 未到期不追问

    const due = getDueReuseConfirmation(Number(entry.dueAt) + 1);
    expect(due).not.toBeNull();
    expect(due?.card).toEqual(CARD);
    expect(due?.decisionId).toBe(DECISION_ID);
  });

  it('treats a corrupted entry as no pending confirmation', () => {
    window.localStorage.setItem('symy-duplicate-precheck-reuse-pending', '{not json');
    expect(getDueReuseConfirmation()).toBeNull();
  });

  it('rejects entries whose fields have the wrong types', () => {
    window.localStorage.setItem(
      'symy-duplicate-precheck-reuse-pending',
      JSON.stringify({ itemTitle: 7, category: 'electronics', decisionId: 'x', dueAt: 1 }),
    );
    expect(getDueReuseConfirmation()).toBeNull();

    window.localStorage.setItem(
      'symy-duplicate-precheck-reuse-pending',
      JSON.stringify({ itemTitle: 'cable', category: 'electronics', decisionId: 'x', dueAt: 'tomorrow' }),
    );
    expect(getDueReuseConfirmation()).toBeNull();
  });

  it('returns null on SSR', () => {
    window.localStorage.setItem(
      'symy-duplicate-precheck-reuse-pending',
      JSON.stringify({ itemTitle: 'cable', category: 'electronics', decisionId: 'x', dueAt: 1 }),
    );
    vi.stubGlobal('window', undefined);
    try {
      expect(getDueReuseConfirmation()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('clearPendingReuseConfirmation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('removes the pending entry so it is never asked twice', () => {
    savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' });
    clearPendingReuseConfirmation();
    expect(window.localStorage.getItem('symy-duplicate-precheck-reuse-pending')).toBeNull();
    expect(getDueReuseConfirmation(Date.now() + 2 * DAY_MS)).toBeNull();
  });

  it('does nothing when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => clearPendingReuseConfirmation()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('reportReuseConclusion', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    vi.mocked(logger.warn).mockClear();
  });

  it('reports the conclusion keyed to the pending decision id', () => {
    reportReuseConclusion('duplicate-precheck:2026-09-19:cable:reuse', true);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith('/api/buddy/health-events', {
      method: 'POST',
      body: expect.objectContaining({
        eventType: 'manual_adjustment',
        triggerId: 'duplicate-precheck:2026-09-19:cable:reuse:conclusion',
        metadata: { source: 'duplicate_precheck', decision: 'reuse', followUpAvoidedPurchase: true },
      }),
    });
  });

  it('swallows apiFetch rejection with a warn', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(() => reportReuseConclusion('some-id', false)).not.toThrow();
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith('[duplicate-precheck] conclusion report failed:', 'offline'));
  });
});
