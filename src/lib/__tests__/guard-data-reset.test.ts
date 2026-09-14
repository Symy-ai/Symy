/**
 * guard-data-reset 纯 lib 测试 (batch59-b)
 *
 * 覆盖: 三轨道筛选 (条数/天数/保留清单) / 空输入 / estSaved 缺失字段容错 /
 * 金额结构性分离红线 (GuardDataResetPlan 序列化无金额, 金额只在
 * planGuardDataResetPrivateImpact 返回类型) / 总览 insufficient 阈值与最早日期。
 */

import { describe, expect, it } from 'vitest';
import {
  planGuardDataReset,
  planGuardDataResetPrivateImpact,
  summarizeGuardData,
} from '../guard-data-reset';

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0).toISOString();

const EVENTS = [
  { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 40 }, createdAt: d(1) },
  { eventType: 'challenge_completed', triggerId: 'g2', metadata: { savedAmount: 60 }, createdAt: d(2) },
  { eventType: 'challenge_completed', triggerId: 'g3', metadata: { savedAmount: 100 }, createdAt: d(2) },
  { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', estSaved: 25 }, createdAt: d(3) },
  { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption', estSaved: 50 }, createdAt: d(4) },
  // 去重: 同 triggerId 只算一次
  { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 40 }, createdAt: d(5) },
  // 无法归类的 mindful_recovery (无 guard kind) 不进任何轨道
  { eventType: 'mindful_recovery', triggerId: 'x1', metadata: { kind: 'other' }, createdAt: d(6) },
];

describe('planGuardDataReset — 轨道筛选', () => {
  it('challenge lane: 只算拦截轨, 其余保留', () => {
    const plan = planGuardDataReset(EVENTS, 'challenge');
    expect(plan.eventCount).toBe(3);
    expect(plan.coveredDays).toBe(2);
    expect(plan.retained).toEqual({ challenge: 0, alt: 1, reuse: 1 });
  });

  it('alt_reuse lane: 只算替代+复用轨', () => {
    const plan = planGuardDataReset(EVENTS, 'alt_reuse');
    expect(plan.eventCount).toBe(2);
    expect(plan.coveredDays).toBe(2);
    expect(plan.retained).toEqual({ challenge: 3, alt: 0, reuse: 0 });
  });

  it('all lane: 三轨全算, 保留全 0', () => {
    const plan = planGuardDataReset(EVENTS, 'all');
    expect(plan.eventCount).toBe(5);
    expect(plan.coveredDays).toBe(4);
    expect(plan.retained).toEqual({ challenge: 0, alt: 0, reuse: 0 });
  });
});

describe('planGuardDataReset — 空输入容错', () => {
  it('null / undefined / [] → 全 0', () => {
    for (const input of [null, undefined, []]) {
      const plan = planGuardDataReset(input, 'all');
      expect(plan.eventCount).toBe(0);
      expect(plan.coveredDays).toBe(0);
      expect(plan.retained).toEqual({ challenge: 0, alt: 0, reuse: 0 });
      expect(planGuardDataResetPrivateImpact(input, 'all').estSavedTotal).toBe(0);
    }
  });
});

describe('planGuardDataResetPrivateImpact — estSaved 容错', () => {
  it('guard=savedAmount, alt/reuse=estSaved, 合计正确', () => {
    expect(planGuardDataResetPrivateImpact(EVENTS, 'all').estSavedTotal).toBe(275);
    expect(planGuardDataResetPrivateImpact(EVENTS, 'challenge').estSavedTotal).toBe(200);
    expect(planGuardDataResetPrivateImpact(EVENTS, 'alt_reuse').estSavedTotal).toBe(75);
  });

  it('字段缺失 / 非法 / 非正数 → 容错为 0', () => {
    const messy = [
      { eventType: 'challenge_completed', metadata: {}, createdAt: d(1) },
      { eventType: 'challenge_completed', metadata: { savedAmount: 'abc' }, createdAt: d(1) },
      { eventType: 'challenge_completed', metadata: { savedAmount: -5 }, createdAt: d(1) },
      { eventType: 'challenge_completed', metadata: null, createdAt: d(1) },
      { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption' }, createdAt: d(1) },
      { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved: '30' }, createdAt: d(1) },
    ];
    expect(planGuardDataResetPrivateImpact(messy, 'all').estSavedTotal).toBe(30);
  });
});

describe('金额结构性分离红线', () => {
  it('GuardDataResetPlan 序列化后不含任何金额值, 金额只在 private impact', () => {
    const plan = planGuardDataReset(EVENTS, 'challenge');
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('40');
    expect(serialized).not.toContain('60');
    expect(serialized).not.toContain('100');
    expect(serialized).not.toContain('savedAmount');
    expect(serialized).not.toContain('estSaved');
    expect(planGuardDataResetPrivateImpact(EVENTS, 'challenge').estSavedTotal).toBe(200);
  });

  it('summarizeGuardData 总览同样无金额', () => {
    const serialized = JSON.stringify(summarizeGuardData(EVENTS));
    expect(serialized).not.toContain('savedAmount');
    expect(serialized).not.toContain('estSaved');
  });
});

describe('summarizeGuardData — 总览', () => {
  it('空输入 → empty', () => {
    const o = summarizeGuardData([]);
    expect(o.status).toBe('empty');
    expect(o.totalEvents).toBe(0);
    expect(o.earliestDate).toBeNull();
  });

  it('<5 条 → insufficient, 仍给统计', () => {
    const o = summarizeGuardData(EVENTS.slice(0, 2));
    expect(o.status).toBe('insufficient');
    expect(o.totalEvents).toBe(2);
  });

  it('≥5 条 → ok, 最早日期正确', () => {
    const o = summarizeGuardData(EVENTS);
    expect(o.status).toBe('ok');
    expect(o.totalEvents).toBe(5); // 去重 + 排除无法归类
    expect(o.activeDays).toBe(4);
    expect(o.earliestDate?.getDate()).toBe(1);
  });
});
