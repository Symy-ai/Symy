/**
 * Tests for green-alt-preference-context (batch62-b)
 *
 * - loader: 读 manual_adjustment + trigger 前缀过滤; 解析为偏好状态 + 单行摘要
 * - 降级: 无 userId / 无 store / 查询失败 / 无有效偏好 → 空状态 + line undefined
 * - 注入行隐私面: 无金额符号 / 含少量规则说明 (直接问起仍答 / prefer_buy 不说教)
 * - zh/en 标签随 locale
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGreenAltPreferenceLine,
  loadGreenAltPreferenceContext,
} from '../green-alt-preference-context';
import { GREEN_ALT_REJECTION_SOURCE, resolveGreenAltPreference } from '@/lib/green-alt-preference';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const NOW = new Date('2026-09-09T12:00:00.000Z');
const DAY_MS = 86400000;

function rejectionRow(entryId: string, reason: string, daysAgo: number) {
  return {
    trigger_id: `green-alt-rejection:${entryId}:${reason}:2026-09-0${Math.max(1, 9 - daysAgo)}`,
    metadata: { source: GREEN_ALT_REJECTION_SOURCE, entryId, reason, category: 'wear' },
    created_at: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  };
}

/** 纯函数 (resolve/buildLine) 直测用: GreenAltRejectionEventInput 形状 */
function rejectionEvent(entryId: string, reason: string, daysAgo: number) {
  return {
    metadata: { source: GREEN_ALT_REJECTION_SOURCE, entryId, reason },
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  };
}

function makeStore(rows: unknown[], opts: { fail?: boolean } = {}) {
  const calls: Record<string, unknown> = {};
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => { calls[col] = val; return chain; },
    like: (col: string, val: string) => { calls[col] = val; return chain; },
    order: () => chain,
    limit: () => chain,
    then: (onFulfilled: (res: { data: unknown }) => unknown) =>
      Promise.resolve().then(() => {
        const res: { data: unknown } = opts.fail ? { data: null } : { data: rows };
        return onFulfilled(res);
      }),
  };
  return { store: { from: () => chain }, calls };
}

describe('loadGreenAltPreferenceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无 userId / 无 store → 空状态静默降级', async () => {
    const { store } = makeStore([]);
    const noUser = await loadGreenAltPreferenceContext({ userId: undefined, store, locale: 'zh', now: NOW });
    expect(noUser.line).toBeUndefined();
    expect(noUser.state.byEntry.size).toBe(0);
    const noStore = await loadGreenAltPreferenceContext({ userId: 'user-1', store: null, locale: 'zh', now: NOW });
    expect(noStore.line).toBeUndefined();
  });

  it('查询失败 → 空状态静默降级 (绝不阻塞聊天)', async () => {
    const { store } = makeStore([], { fail: true });
    const result = await loadGreenAltPreferenceContext({ userId: 'user-1', store, locale: 'zh', now: NOW });
    expect(result.line).toBeUndefined();
    expect(result.state.byEntry.size).toBe(0);
  });

  it('读 manual_adjustment + trigger 前缀, 有效偏好 → 状态 + 摘要', async () => {
    const { store, calls } = makeStore([rejectionRow('fur', 'not_now', 1)]);
    const result = await loadGreenAltPreferenceContext({ userId: 'user-1', store, locale: 'zh', now: NOW });
    expect(calls.event_type).toBe('manual_adjustment');
    expect(String(calls.trigger_id).startsWith('green-alt-rejection:')).toBe(true);
    expect(result.state.byEntry.get('fur')?.reason).toBe('not_now');
    expect(result.line).toContain('symy_green_alt_prefs');
    expect(result.line).toContain('皮草');
    expect(result.line).toContain('not now');
  });

  it('全部过期 → 状态空 + line undefined (历史行不删但不注入)', async () => {
    const { store } = makeStore([rejectionRow('fur', 'not_now', 30)]);
    const result = await loadGreenAltPreferenceContext({ userId: 'user-1', store, locale: 'zh', now: NOW });
    expect(result.line).toBeUndefined();
    expect(result.state.byEntry.size).toBe(0);
  });
});

describe('buildGreenAltPreferenceLine', () => {
  it('无有效偏好 → undefined', () => {
    expect(buildGreenAltPreferenceLine(resolveGreenAltPreference([], NOW), 'zh', NOW)).toBeUndefined();
  });

  it('摘要含词条标签 + 原因 + 剩余天数; 规则说明含不说教口径', () => {
    // 同词条两次拒绝取最近一次 (prefer_buy 覆盖 already_have)
    const state = resolveGreenAltPreference([
      rejectionEvent('fur', 'already_have', 2),
      rejectionEvent('fur', 'prefer_buy', 0),
    ], NOW);
    const line = buildGreenAltPreferenceLine(state, 'zh', NOW)!;
    expect(line).toContain("'皮草': wants to buy this time (2d left)");
    expect(line).toContain('never guilt-trip');
    expect(line).toContain('unless the user asks directly');
    // 隐私面: 无金额 / 无位置语义
    expect(line).not.toContain('$');
  });

  it('zh/en 标签随 locale', () => {
    const state = resolveGreenAltPreference([rejectionEvent('fur', 'not_now', 0)], NOW);
    expect(buildGreenAltPreferenceLine(state, 'zh', NOW)).toContain("'皮草'");
    expect(buildGreenAltPreferenceLine(state, 'en', NOW)).toContain("'fur coat'");
  });
});
