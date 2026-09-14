/**
 * green-commitment 单测 (batch53-a)
 *
 * 验收: 登记解析 (metadata 字段)、结算三分支 (kept/broken/insufficient)、
 * 一次性消解 (settlement ref_key)、助攻计数/小时换算、到期当天判定、纯函数防御。
 */
import { describe, expect, it } from 'vitest';
import {
  commitmentDays,
  commitmentEndKeyOf,
  commitmentRefKey,
  dateKeyOf,
  deriveGreenCommitment,
  GREEN_COMMITMENT_SETTLEMENT_SOURCE,
  GREEN_COMMITMENT_SOURCE,
  monthEndKeyOf,
} from '@/lib/green-commitment';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';

function commitmentEvent(over: Partial<WeeklyGuardEventInput> = {}): WeeklyGuardEventInput {
  return {
    eventType: 'manual_adjustment',
    triggerSource: 'manual',
    triggerId: null,
    metadata: {
      source: GREEN_COMMITMENT_SOURCE,
      category: 'food',
      subject: '咖啡',
      start_key: '2026-08-01',
      end_key: '2026-08-31',
    },
    createdAt: '2026-08-01T02:00:00.000Z',
    ...over,
  };
}

function completed(createdAt: string, over: Partial<WeeklyGuardEventInput> = {}): WeeklyGuardEventInput {
  return {
    eventType: 'challenge_completed',
    triggerSource: 'guard',
    triggerId: 't1',
    metadata: { category: 'food', itemName: '拿铁咖啡', savedAmount: 50 },
    createdAt,
    ...over,
  };
}

function failed(createdAt: string, over: Partial<WeeklyGuardEventInput> = {}): WeeklyGuardEventInput {
  return {
    eventType: 'challenge_failed',
    triggerSource: 'guard',
    triggerId: 't2',
    metadata: { category: 'food', itemName: '咖啡豆' },
    createdAt,
    ...over,
  };
}

const AFTER_DUE = new Date(2026, 8, 2); // 2026-09-02, 承诺 08-31 已到期
const RATE = 25;

describe('日期键工具', () => {
  it('dateKeyOf / monthEndKeyOf / commitmentEndKeyOf / commitmentDays', () => {
    expect(dateKeyOf(new Date(2026, 7, 5))).toBe('2026-08-05');
    expect(monthEndKeyOf(new Date(2026, 1, 10))).toBe('2026-02-28');
    expect(monthEndKeyOf(new Date(2024, 1, 10))).toBe('2024-02-29'); // 闰年
    expect(commitmentEndKeyOf(new Date(2026, 7, 1), 'fixed', 30)).toBe('2026-08-31');
    expect(commitmentEndKeyOf(new Date(2026, 7, 1), 'month_end', null)).toBe('2026-08-31');
    expect(commitmentDays('2026-08-01', '2026-08-31')).toBe(30);
    expect(commitmentDays('2026-08-31', '2026-08-01')).toBe(0);
  });
});

describe('deriveGreenCommitment 结算三分支', () => {
  it('未到期 → 无结算, 给进行中承诺', () => {
    const d = deriveGreenCommitment([commitmentEvent()], new Date(2026, 7, 15), RATE);
    expect(d.dueSettlement).toBeNull();
    expect(d.activeCommitment?.subject).toBe('咖啡');
  });

  it('到期无任何守护事件 → insufficient (不渲染假达成)', () => {
    const d = deriveGreenCommitment([commitmentEvent()], AFTER_DUE, RATE);
    expect(d.dueSettlement?.outcome).toBe('insufficient');
    expect(d.dueSettlement?.days).toBe(30);
    expect(d.dueSettlement?.refKey).toBe(commitmentRefKey('2026-08-01', '2026-08-31'));
  });

  it('窗口内该品类成功拦截 → kept, 助攻计数 + 小时换算 (triggerId 去重)', () => {
    const events = [
      commitmentEvent(),
      completed('2026-08-10T05:00:00.000Z'),
      completed('2026-08-20T05:00:00.000Z', { triggerId: 't1', id: 'dup' }), // 同 triggerId 去重
      completed('2026-08-20T05:00:00.000Z', { triggerId: 't3', metadata: { category: 'clothing', itemName: '衬衫', savedAmount: 999 } }), // 品类不匹配不计
    ];
    const d = deriveGreenCommitment(events, AFTER_DUE, RATE);
    expect(d.dueSettlement?.outcome).toBe('kept');
    expect(d.dueSettlement?.assistCount).toBe(1);
    expect(d.dueSettlement?.hoursReclaimed).toBeCloseTo(2); // 50 / 25
  });

  it('仅其他品类守护事件 (承诺品类无挑战) → kept 零助攻', () => {
    const events = [
      commitmentEvent(),
      completed('2026-08-10T05:00:00.000Z', { metadata: { category: 'clothing', itemName: '衬衫', savedAmount: 100 } }),
    ];
    const d = deriveGreenCommitment(events, AFTER_DUE, RATE);
    expect(d.dueSettlement?.outcome).toBe('kept');
    expect(d.dueSettlement?.assistCount).toBe(0);
  });

  it('窗口内该品类 challenge_failed → broken', () => {
    const events = [commitmentEvent(), failed('2026-08-15T05:00:00.000Z')];
    const d = deriveGreenCommitment(events, AFTER_DUE, RATE);
    expect(d.dueSettlement?.outcome).toBe('broken');
  });

  it('承诺期外的失败不计入 (窗口含尾边界)', () => {
    const events = [commitmentEvent(), failed('2026-09-10T12:00:00.000Z')]; // 09-10 > end 08-31
    const d = deriveGreenCommitment(events, AFTER_DUE, RATE);
    expect(d.dueSettlement?.outcome).toBe('insufficient');
  });

  it('到期当天 (endKey == today) 即结算, 当天窗口内事件照常计入', () => {
    const events = [commitmentEvent(), failed('2026-08-31T12:00:00.000Z')];
    const d = deriveGreenCommitment(events, new Date(2026, 7, 31, 20, 0), RATE);
    expect(d.dueSettlement?.outcome).toBe('broken');
  });
});

describe('一次性消解与防御', () => {
  it('已有 settlement ref_key 的事件 → 同承诺不再结算', () => {
    const settled: WeeklyGuardEventInput = {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId: null,
      metadata: { source: GREEN_COMMITMENT_SETTLEMENT_SOURCE, ref_key: commitmentRefKey('2026-08-01', '2026-08-31'), outcome: 'kept' },
      createdAt: '2026-09-01T05:00:00.000Z',
    };
    const d = deriveGreenCommitment([commitmentEvent(), settled], AFTER_DUE, RATE);
    expect(d.dueSettlement).toBeNull();
  });

  it('多条登记取最近一条; 坏 metadata (缺 key/倒挂) 跳过不抛异常', () => {
    const newer = commitmentEvent({
      metadata: {
        source: GREEN_COMMITMENT_SOURCE,
        category: 'clothing',
        subject: '鞋',
        start_key: '2026-08-15',
        end_key: '2026-08-29',
      },
      createdAt: '2026-08-15T02:00:00.000Z',
    });
    const broken = commitmentEvent({ metadata: { source: GREEN_COMMITMENT_SOURCE, start_key: '2026-08-31', end_key: '2026-08-01' } });
    const noKeys = commitmentEvent({ metadata: { source: GREEN_COMMITMENT_SOURCE } });
    const d = deriveGreenCommitment([commitmentEvent(), newer, broken, noKeys], AFTER_DUE, RATE);
    expect(d.dueSettlement?.record.subject).toBe('鞋');
    expect(d.dueSettlement?.days).toBe(14);
  });

  it('空输入/非承诺事件 → 全 null 不抛异常', () => {
    expect(deriveGreenCommitment(null, AFTER_DUE, RATE)).toEqual({ dueSettlement: null, activeCommitment: null });
    expect(deriveGreenCommitment([completed('2026-08-10T05:00:00.000Z')], AFTER_DUE, RATE).dueSettlement).toBeNull();
  });
});
