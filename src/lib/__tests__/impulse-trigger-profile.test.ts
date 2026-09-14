import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  aggregateImpulseTriggerProfile,
  impulseTriggerReasonTextKey,
  type ImpulseTriggerEventInput,
} from '@/lib/impulse-trigger-profile';

/** 本地时区固定 Date — 无 UTC 日期炸弹 (impulse-window 同款约定) */
function at(hour: number, day = 1, month = 5): Date {
  return new Date(2026, month, day, hour, 30, 0);
}

describe('aggregateImpulseTriggerProfile', () => {
  it('空输入 / null → insufficient 稳定降级, 不抛错', () => {
    for (const input of [null, undefined, []]) {
      const p = aggregateImpulseTriggerProfile(input as ImpulseTriggerEventInput[] | null | undefined);
      expect(p.status).toBe('insufficient');
      expect(p.totalIntercepts).toBe(0);
      expect(p.activeDays).toBe(0);
      expect(p.topReasons).toEqual([]);
      expect(p.topCategory).toBeNull();
      expect(p.adviceId).toBeNull();
      expect(p.window.status).toBe('insufficient');
    }
  });

  it('单条数据 → 低于样本阈值, insufficient 不出伪画像', () => {
    const p = aggregateImpulseTriggerProfile([
      { metadata: { itemName: 'Nike sneakers' }, createdAt: at(23) },
    ]);
    expect(p.status).toBe('insufficient');
    expect(p.totalIntercepts).toBe(0); // 降级态不半暴露计数
  });

  it('聚合正确性: Top 3 原因按次数降序 + share, 品类/时段/天数交叉', () => {
    const events: ImpulseTriggerEventInput[] = [
      // impulse ×4 (clothing), 深夜
      { metadata: { itemName: 'sneakers', category: 'clothing' }, createdAt: at(23, 1) },
      { metadata: { itemName: 'hoodie', category: 'clothing' }, createdAt: at(23, 1) },
      { metadata: { itemName: 'cap', category: 'clothing' }, createdAt: at(0, 2) },
      { metadata: { itemName: 'socks', category: 'clothing' }, createdAt: at(1, 3) },
      // non_green.disposable ×2 (home), 白天
      { metadata: { itemName: 'disposable cups', category: 'home' }, createdAt: at(13, 2) },
      { metadata: { itemName: 'plastic forks', category: 'home' }, createdAt: at(14, 3) },
      // non_green.ivory ×1, 傍晚; impulse food ×1, 清晨
      { metadata: { itemName: 'ivory carving' }, createdAt: at(18, 3) },
      { metadata: { itemName: 'snack box', category: 'food' }, createdAt: at(6, 4) },
    ];
    const p = aggregateImpulseTriggerProfile(events);

    expect(p.status).toBe('ok');
    expect(p.totalIntercepts).toBe(8);
    expect(p.activeDays).toBe(4);
    expect(p.topReasons.map((r) => r.reasonId)).toEqual([
      'impulse',
      'non_green.disposable',
      'non_green.ivory',
    ]);
    expect(p.topReasons[0]).toMatchObject({ count: 5, share: 0.625 });
    expect(p.topCategory).toBe('clothing');
    expect(p.topCategoryCount).toBe(4);
    expect(p.window.status).toBe('ok');
    expect(p.window.counts.lateNight).toBe(4);
    expect(p.window.topWindow).toBe('lateNight');
    expect(p.adviceId).toBe('impulse');
  });

  it('同 count 原因按 reasonId 稳定排序 (无并列抖动)', () => {
    const events: ImpulseTriggerEventInput[] = [
      { metadata: { itemName: 'plastic toy' }, createdAt: at(10) },
      { metadata: { itemName: 'sneakers' }, createdAt: at(11) },
      { metadata: { itemName: 'ivory statue' }, createdAt: at(12) },
    ];
    const p = aggregateImpulseTriggerProfile(events);
    expect(p.topReasons.map((r) => r.reasonId)).toEqual([
      'impulse',
      'non_green.ivory',
      'non_green.plastic',
    ]);
  });

  it('无商品名条目归 unknown 原因, 不抛错; 时间戳无效条目不计样本', () => {
    const events: ImpulseTriggerEventInput[] = [
      { metadata: {}, createdAt: at(10) },
      { metadata: null, createdAt: at(11) },
      { metadata: { itemName: 'sneakers' }, createdAt: 'not-a-date' },
      { metadata: { itemName: 'sneakers' }, createdAt: at(12) },
      { metadata: { itemName: 'hoodie' }, createdAt: at(13) },
    ];
    const p = aggregateImpulseTriggerProfile(events);
    // 有效样本 4 ≥ 3 → ok
    expect(p.status).toBe('ok');
    expect(p.totalIntercepts).toBe(4);
    // unknown ×2 与 impulse ×2 并列, 稳定排序 impulse 在前
    expect(p.topReasons.map((r) => `${r.reasonId}:${r.count}`).join(',')).toBe('impulse:2,unknown:2');
  });

  it('金额红线: 输出结构无任何金额字段 (分享/荣誉面纯计数)', () => {
    const events: ImpulseTriggerEventInput[] = [
      { metadata: { itemName: 'sneakers', savedAmount: 129.99, amount: 50 }, createdAt: at(23) },
      { metadata: { itemName: 'hoodie', savedAmount: 89.5 }, createdAt: at(23, 2) },
      { metadata: { itemName: 'cap' }, createdAt: at(23, 3) },
    ];
    const p = aggregateImpulseTriggerProfile(events);
    const dumped = JSON.stringify(p);
    expect(dumped).not.toContain('savedAmount');
    expect(dumped).not.toContain('amount');
    expect(dumped).not.toContain('129.99');
    expect(dumped).not.toContain('89.5');
    expect(dumped).not.toMatch(/\$\d/);
  });
});

describe('impulseTriggerReasonTextKey', () => {
  it('复用 intercept-reason-chip 既有 i18n 词表 (不造第二套)', () => {
    expect(impulseTriggerReasonTextKey('impulse')).toBe('chat.interceptReason.impulse');
    expect(impulseTriggerReasonTextKey('unknown')).toBe('chat.interceptReason.unknown');
    expect(impulseTriggerReasonTextKey('non_green.ivory')).toBe('chat.interceptReason.nonGreen.ivory');
    expect(impulseTriggerReasonTextKey('non_green.plastic')).toBe('chat.interceptReason.nonGreen.plastic');
  });

  it('key 在 zh/en 词表里真实存在 (无第二套标签)', () => {
    const zh = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8')).chat.interceptReason;
    const en = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8')).chat.interceptReason;
    for (const id of ['impulse', 'unknown'] as const) {
      expect(typeof zh[id]).toBe('string');
      expect(typeof en[id]).toBe('string');
    }
    for (const cat of ['ivory', 'plastic']) {
      expect(typeof zh.nonGreen[cat]).toBe('string');
      expect(typeof en.nonGreen[cat]).toBe('string');
    }
  });
});
