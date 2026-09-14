/**
 * Guard Ledger tests (batch6-b) — 守护转存纯函数 + 口径一致性 + 偏好 + 域红线
 *
 * 覆盖:
 *  - deriveGuardTransfers: 只认 deposit 审计记录 / 金额与结算额同源 / 去重 / 时间序
 *  - 按基金分组恒等式: Σ(按 fund) === Σ(条目) — 禁止两套数
 *  - 口径一致性: 守护转存总额能对回 totalSaved (是它的子集)
 *  - 守护目标偏好: 默认 SAVINGS_FUND_ID + localStorage 读写往返
 *  - 域红线: dream-fund-editor 无残留硬编码英文句子; share/ 域不引入守护账目
 *  - i18n: buddy.dreamFund.* / buddy.ledger.guard.* en/zh 齐全
 */
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveGuardTransfers,
  guardTransfersTotal,
  guardSavedByFund,
  fundGuardSaved,
  guardTotalWithinTotalSaved,
  getGuardTargetFundId,
  setGuardTargetFundId,
  GUARD_TARGET_STORAGE_KEY,
  type GuardEventLite,
} from '../guard-ledger';
import { SAVINGS_FUND_ID } from '../buddy-defaults';
import en from '../../i18n/messages/en.json';
import zh from '../../i18n/messages/zh.json';

/** 造一条 deposit 审计记录 (与 /api/buddy/deposit 落库的形状一致) */
function depositEvent(overrides: Partial<GuardEventLite> & { amount?: number; fundId?: string } = {}): GuardEventLite {
  const amount = overrides.amount ?? 46.8;
  const fundId = overrides.fundId ?? 'df-1';
  const { amount: _a, fundId: _f, ...rest } = overrides;
  return {
    id: `evt-${fundId}-${amount}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: 'challenge_reward',
    triggerSource: 'deposit_api',
    triggerId: `deposit:user-1:ch-1:${fundId}:${amount}`,
    metadata: { source: 'deposit', fundId, fundName: 'Credit Card Payoff', amount },
    createdAt: '2026-09-01T10:00:00.000Z',
    ...rest,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

const repoRoot = join(__dirname, '..', '..', '..');
const readSrc = (...p: string[]) => readFileSync(join(repoRoot, ...p), 'utf8');

describe('deriveGuardTransfers — 从既有审计管道派生守护转存条目', () => {
  it('拦截结算后 ledger 出现守护转存进项, 金额等于结算额', () => {
    const entries = deriveGuardTransfers([depositEvent({ amount: 46.8 })]);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(46.8);
    expect(entries[0].fundId).toBe('df-1');
  });

  it('只认 deposit_api 落的 challenge_reward + metadata.source=deposit', () => {
    const entries = deriveGuardTransfers([
      depositEvent({ eventType: 'challenge_reward', triggerSource: 'chat_ai', triggerId: null }), // 非 deposit 管道
      depositEvent({ eventType: 'refund_boost' }), // 退款找回 — total_saved 来源但非拦截转存
      depositEvent({ eventType: 'challenge_failed' }), // 用户买了 — 无钱可转
      depositEvent(), // 唯一合法
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].fundId).toBe('df-1');
  });

  it('跳过脏数据 (缺 fundId / 金额非正), 按 triggerId 去重, 按 createdAt 升序', () => {
    const events: GuardEventLite[] = [
      depositEvent({ createdAt: '2026-09-03T10:00:00.000Z', amount: 10, fundId: 'df-2' }),
      depositEvent({ metadata: { source: 'deposit', amount: 5 } }), // 缺 fundId
      depositEvent({ amount: 0 }), // 金额非正
      depositEvent({ amount: -3 }), // 负数
      depositEvent({ createdAt: '2026-09-02T10:00:00.000Z', amount: 20, fundId: 'df-2' }), // 与下一条 triggerId 相同 → 去重
      depositEvent({ createdAt: '2026-09-02T10:00:00.000Z', amount: 20, fundId: 'df-2', id: 'dup-event' }),
      depositEvent({ createdAt: '2026-09-01T10:00:00.000Z', amount: 30, fundId: 'df-1' }),
    ];
    const entries = deriveGuardTransfers(events);
    expect(entries.map(e => e.amount)).toEqual([30, 20, 10]);
    expect(entries.map(e => e.fundId)).toEqual(['df-1', 'df-2', 'df-2']);
  });

  it('空/脏输入安全返回空数组', () => {
    expect(deriveGuardTransfers(null)).toEqual([]);
    expect(deriveGuardTransfers([])).toEqual([]);
    expect(deriveGuardTransfers([{} as GuardEventLite])).toEqual([]);
  });
});

describe('口径一致性 — 禁止两套数', () => {
  it('按基金分组之和恒等于条目总额 (同源聚合)', () => {
    const entries = deriveGuardTransfers([
      depositEvent({ amount: 30, fundId: 'df-1' }),
      depositEvent({ amount: 10, fundId: 'df-2' }),
      depositEvent({ amount: 5.5, fundId: 'df-2' }),
      depositEvent({ amount: 100, fundId: SAVINGS_FUND_ID }),
    ]);
    const byFund = guardSavedByFund(entries);
    expect(byFund['df-1']).toBe(30);
    expect(byFund['df-2']).toBeCloseTo(15.5);
    expect(byFund[SAVINGS_FUND_ID]).toBe(100);
    expect(Object.values(byFund).reduce((a, b) => a + b, 0)).toBeCloseTo(guardTransfersTotal(entries));
  });

  it('fundGuardSaved: 无守护数据的基金返回 0 (调用方据此不渲染拆线)', () => {
    const entries = deriveGuardTransfers([depositEvent({ amount: 30, fundId: 'df-1' })]);
    expect(fundGuardSaved('df-1', entries)).toBe(30);
    expect(fundGuardSaved('df-2', entries)).toBe(0);
  });

  it('守护转存总额能对回 totalSaved: 守护存款是 total_saved 的子集', () => {
    const entries = deriveGuardTransfers([
      depositEvent({ amount: 46.8, fundId: 'df-1' }),
      depositEvent({ amount: 100, fundId: SAVINGS_FUND_ID }),
    ]);
    // total_saved = 守护存款 + 退款找回等其他来源 → 守护总额必在其内
    expect(guardTotalWithinTotalSaved(entries, 146.8 + 55)).toBe(true);
    // 浮点累加容差内一致
    expect(guardTotalWithinTotalSaved(entries, 146.80001)).toBe(true);
    // 守护总额超过 total_saved → 口径漂移, 断言失败
    expect(guardTotalWithinTotalSaved(entries, 100)).toBe(false);
  });
});

describe('守护目标基金偏好 (零 DDL, localStorage)', () => {
  it('默认 SAVINGS_FUND_ID', () => {
    expect(getGuardTargetFundId()).toBe(SAVINGS_FUND_ID);
  });

  it('设置后读回所选基金; 重置为 Savings 时清除存储', () => {
    setGuardTargetFundId('df-2');
    expect(getGuardTargetFundId()).toBe('df-2');
    expect(window.localStorage.getItem(GUARD_TARGET_STORAGE_KEY)).toBe('df-2');

    setGuardTargetFundId(SAVINGS_FUND_ID);
    expect(getGuardTargetFundId()).toBe(SAVINGS_FUND_ID);
    expect(window.localStorage.getItem(GUARD_TARGET_STORAGE_KEY)).toBeNull();
  });
});

describe('域红线 — 硬编码英文与分享面', () => {
  it('dream-fund-editor 无残留硬编码英文目标句子', () => {
    const src = readSrc('src', 'components', 'buddy', 'dream-fund-editor.tsx');
    for (const legacy of [
      'House down payment', 'Dream vacation', 'Emergency fund',
      'New laptop', 'Car down payment', 'Education fund',
    ]) {
      expect(src).not.toContain(legacy);
    }
  });

  it('share/ 域不引入守护账目 (金额不进导出/分享面)', () => {
    const shareDir = join(repoRoot, 'src', 'components', 'share');
    const files = readdirSync(shareDir).filter(f => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readSrc('src', 'components', 'share', f)).not.toContain('guard-ledger');
    }
  });
});

describe('i18n — buddy.dreamFund.* / buddy.ledger.guard.* 双语齐全', () => {
  const DREAM_FUND_KEYS = [
    'suggestions.home', 'suggestions.travel', 'suggestions.rainyDay',
    'suggestions.laptop', 'suggestions.car', 'suggestions.learning',
    'emojiPickerLabel', 'guardSavedLine', 'guardTargetBadge', 'guardTargetSet',
    'guardTargetActiveHint', 'guardTargetSetAria', 'guardTargetSaved',
  ];
  const LEDGER_GUARD_KEYS = ['title', 'totalLine', 'recentTitle', 'entryAria'];

  const pick = (obj: Record<string, unknown>, path: string): unknown =>
    path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);

  it.each(DREAM_FUND_KEYS)('buddy.dreamFund.%s en/zh 都存在且非空', (key) => {
    const enVal = pick(en.buddy as Record<string, unknown>, `dreamFund.${key}`);
    const zhVal = pick(zh.buddy as Record<string, unknown>, `dreamFund.${key}`);
    expect(typeof enVal).toBe('string');
    expect(enVal as string).not.toHaveLength(0);
    expect(typeof zhVal).toBe('string');
    expect(zhVal as string).not.toHaveLength(0);
  });

  it.each(LEDGER_GUARD_KEYS)('buddy.ledger.guard.%s en/zh 都存在且非空', (key) => {
    const enVal = pick(en.buddy as Record<string, unknown>, `ledger.guard.${key}`);
    const zhVal = pick(zh.buddy as Record<string, unknown>, `ledger.guard.${key}`);
    expect(typeof enVal).toBe('string');
    expect(enVal as string).not.toHaveLength(0);
    expect(typeof zhVal).toBe('string');
    expect(zhVal as string).not.toHaveLength(0);
  });

  it('guardSavedLine 带 {amount} 占位符; totalLine 带 {amount}/{count} 占位符', () => {
    const enBuddy = en.buddy as unknown as Record<string, unknown>;
    const dreamFund = enBuddy.dreamFund as Record<string, unknown>;
    const ledgerGuard = (enBuddy.ledger as Record<string, unknown>).guard as Record<string, string>;
    expect(dreamFund.guardSavedLine).toContain('{amount}');
    expect(ledgerGuard.totalLine).toContain('{amount}');
    expect(ledgerGuard.totalLine).toContain('{count');
    expect(ledgerGuard.recentTitle).not.toContain('{');
  });

  it('无死 key: 新增 key 全部被组件引用', () => {
    const sources = [
      readSrc('src', 'components', 'buddy', 'dream-funds-section.tsx'),
      readSrc('src', 'components', 'buddy', 'symy-ledger.tsx'),
      readSrc('src', 'components', 'buddy', 'dream-fund-editor.tsx'),
    ].join('\n');
    expect(sources).toContain('buddy.dreamFund.guardSavedLine');
    expect(sources).toContain('buddy.dreamFund.guardTargetBadge');
    expect(sources).toContain('buddy.dreamFund.guardTargetSet');
    expect(sources).toContain('buddy.dreamFund.guardTargetActiveHint');
    expect(sources).toContain('buddy.dreamFund.guardTargetSetAria');
    expect(sources).toContain('buddy.dreamFund.guardTargetSaved');
    expect(sources).toContain('buddy.dreamFund.suggestions.');
    expect(sources).toContain('buddy.dreamFund.emojiPickerLabel');
    expect(sources).toContain('buddy.ledger.guard.title');
    expect(sources).toContain('buddy.ledger.guard.totalLine');
    expect(sources).toContain('buddy.ledger.guard.recentTitle');
    expect(sources).toContain('buddy.ledger.guard.entryAria');
  });
});
