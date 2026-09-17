/**
 * batch79-a — GuardYearReviewShareFace 本体补测 (testgap v9 §十五.2 share 卡簇)
 *
 * batch77-a 的 share-face-money-redline.test.tsx 已 sweep 正常数据下的金额红线;
 * 本文件补逐卡专属盲区:
 *   1. 核心内容渲染 — 年度画像 pill/身份句/headline ({count} 插值)/最稳月份/
 *      三格统计, zh/en 生产词典各一遍;
 *   2. 金额红线 (owner 09-06) — 次数/天数面子输入下 textContent 零金额;
 *   3. 空数据健壮性 — 全面子字段吃 null/undefined/[] 渲染不抛,
 *      steadiestMonth null → 月份面板隐藏 (设计内空态), 无 NaN/undefined 字样。
 * 边界说明: 不做 "year 空值 × steadiestMonth 有效" 的交叉探针 — 该组合会令
 * new Date(undefined, month, 1) 成 Invalid Date 且 Intl format 抛 RangeError,
 * 但生产 builder (buildGuardYearReviewShare) 恒同源供给 year+steadiestMonth,
 * 该状态不可达, 与 "空数据" 语义无关。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { GuardYearReviewShareFace } from '../guard-year-review-share';

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
  year: 2026,
  intercepts: 37,
  commitments: 12,
  adoptions: 9,
  longestStreakDays: 6,
  steadiestMonth: 8,
};

beforeEach(() => {
  locale = 'en';
});

describe('GuardYearReviewShareFace 本体 (batch79-a)', () => {
  it('en: 从生产词典渲染 pill/身份句/headline 插值/最稳月份/三格统计, 且零金额', () => {
    locale = 'en';
    const { container } = render(<GuardYearReviewShareFace data={FACE_DATA} />);
    expect(container.querySelector('[data-testid="guard-year-review-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('Yearly Guard Portrait');
    expect(text).toContain('This year, my guard identity is');
    expect(text).toContain('37 gentle pauses');
    // steadiestMonth 是 0 起算月份索引: 8 → September (new Date(2026, 8, 1))
    expect(text).toContain('Steadiest month: September');
    expect(text).toContain('promises kept');
    expect(text).toContain('green swaps');
    expect(text).toContain('best streak days');
    expect(text).toContain('Symy');
    expect(text).toContain('Become a guardian with me');
    expectNoMoney(text, 'guard-year-review [en]');
  });

  it('zh: 双语渲染年度守护画像卡面文案, 且零金额', () => {
    locale = 'zh';
    const { container } = render(<GuardYearReviewShareFace data={FACE_DATA} />);

    const text = container.textContent ?? '';
    expect(text).toContain('年度守护画像');
    expect(text).toContain('这一年，我的守护人格是');
    expect(text).toContain('37 次温柔刹车');
    expect(text).toContain('最稳月份：九月');
    expect(text).toContain('承诺守住');
    expect(text).toContain('绿色替代');
    expect(text).toContain('天最长连续');
    expectNoMoney(text, 'guard-year-review [zh]');
  });

  it('空数据: 全面子字段 null/undefined/[] 渲染不抛, steadiestMonth null 隐藏月份面板, 无 NaN/undefined', () => {
    locale = 'en';
    const { container } = render(
      <GuardYearReviewShareFace
        data={{
          year: null as unknown as number,
          intercepts: undefined as unknown as number,
          commitments: [] as unknown as number,
          adoptions: undefined as unknown as number,
          longestStreakDays: null as unknown as number,
          steadiestMonth: null,
        }}
      />
    );
    expect(container.querySelector('[data-testid="guard-year-review-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    // 设计内空态: 最稳月份缺位 → 月份行不出 (非硬造 "0 月")
    expect(container.querySelector('[data-testid="guard-year-review-share-month"]')).toBeNull();
    expect(container.querySelector('[data-testid="guard-year-review-share-stats"]')).not.toBeNull();
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'guard-year-review [empty]');
  });
});
