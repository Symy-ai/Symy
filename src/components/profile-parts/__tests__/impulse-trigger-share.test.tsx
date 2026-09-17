/**
 * batch79-a — ImpulseTriggerShareFace 本体补测 (testgap v9 §十五.2 share 卡簇)
 *
 * batch77-a 的 share-face-money-redline.test.tsx 已 sweep 正常数据下的金额红线;
 * 本文件补逐卡专属盲区:
 *   1. 核心内容渲染 — 触发画像 pill/reasonLabel/Top 原因文案/次数天数面板/
 *      品牌条, zh/en 生产词典各一遍;
 *   2. 金额红线 (owner 09-06) — 次数/天数面子输入下 textContent 零金额;
 *   3. 空数据健壮性 — topReasonLabel/interceptCount/activeDays 分别吃
 *      null/undefined/[] 渲染不抛, 无 NaN/undefined 字样。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ImpulseTriggerShareFace } from '../impulse-trigger-share';

const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

let locale: 'en' | 'zh' = 'en';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = flat(locale === 'zh' ? zhMsgs : enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replaceAll(`{${k}}`, v === null || v === undefined ? '' : String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));

/** 金额红线 — 简报 regex + formatCurrency 产物形状分档 (同 share-card-modal-redline 口径) */
const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/\d+(?:\.\d+)?\s*(?:元|块|¥|\$)/, 'brief redline: digit + 元/块/¥/$'],
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, 'formatCurrency 2-decimal shape'],
  [/\d{1,3}(?:,\d{3})+/, 'grouped-thousands format'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

function expectNoMoney(text: string, label: string) {
  for (const [re, why] of MONEY_PATTERNS) {
    const hit = text.match(re);
    expect(hit, `${label} renders money (${why}): "${hit?.[0]}"`).toBeNull();
  }
}

const FACE_DATA = {
  topReasonLabel: 'Late-night scrolling',
  interceptCount: 21,
  activeDays: 9,
};

beforeEach(() => {
  locale = 'en';
});

describe('ImpulseTriggerShareFace 本体 (batch79-a)', () => {
  it('en: 从生产词典渲染 pill/触发原因标签/次数天数面板/品牌条, 且零金额', () => {
    locale = 'en';
    const { container } = render(<ImpulseTriggerShareFace data={FACE_DATA} />);
    expect(container.querySelector('[data-testid="impulse-trigger-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('Impulse Trigger Profile');
    expect(text).toContain('My biggest impulse trigger is');
    expect(text).toContain('Late-night scrolling');
    expect(text).toContain('intercepts');
    expect(text).toContain('days on guard');
    expect(text).toContain('Symy');
    expect(text).toContain('Become a guardian with me');
    expectNoMoney(text, 'impulse-trigger [en]');
  });

  it('zh: 双语渲染冲动触发画像卡面文案, 且零金额', () => {
    locale = 'zh';
    const { container } = render(
      <ImpulseTriggerShareFace data={{ topReasonLabel: '深夜刷手机', interceptCount: 21, activeDays: 9 }} />
    );

    const text = container.textContent ?? '';
    expect(text).toContain('冲动触发画像');
    expect(text).toContain('我最大的冲动触发是');
    expect(text).toContain('深夜刷手机');
    expect(text).toContain('次拦截');
    expect(text).toContain('天在守护');
    expect(text).toContain('和我一起当守护者');
    expectNoMoney(text, 'impulse-trigger [zh]');
  });

  it('空数据: null/undefined/[] 渲染不抛, 统计面板仍在, 无 NaN/undefined', () => {
    locale = 'en';
    const { container } = render(
      <ImpulseTriggerShareFace
        data={{
          topReasonLabel: null as unknown as string,
          interceptCount: undefined as unknown as number,
          activeDays: [] as unknown as number,
        }}
      />
    );
    expect(container.querySelector('[data-testid="impulse-trigger-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(container.querySelector('[data-testid="impulse-trigger-share-stats"]')).not.toBeNull();
    expect(text).toContain('My biggest impulse trigger is');
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'impulse-trigger [empty]');
  });
});
