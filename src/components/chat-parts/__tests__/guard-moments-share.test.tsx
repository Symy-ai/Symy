/**
 * batch79-a — GuardMomentsShareFace 本体补测 (testgap v9 §十五.2 share 卡簇)
 *
 * batch77-a 的 share-face-money-redline.test.tsx 已 sweep 正常数据下的金额红线;
 * 本文件补逐卡专属盲区:
 *   1. 核心内容渲染 — 时刻 pill/headline ({count}×{days} 插值)/subline/三轨道
 *      计数面板/品牌条, zh/en 生产词典各一遍;
 *   2. 金额红线 (owner 09-06) — 纯计数面子输入下 textContent 零金额;
 *   3. 空数据健壮性 — 三个计数字段分别吃 null/undefined/[] 渲染不抛,
 *      headline 插值参数空缺时按 ICU 语义留空骨架词, 无 NaN/undefined 字样。
 * 边界说明: trackCounts 容器本身是结构必需 (null 会在取 .guard 时抛 TypeError,
 * 生产 builder 恒供给三键), 空值探针打在计数字段值上 — 与生产可达状态一致。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { GuardMomentsShareFace } from '../guard-moments-share';

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
  trackCounts: { guard: 3, alt: 2, reuse: 1 },
  totalMoments: 8,
  activeDays: 6,
};

beforeEach(() => {
  locale = 'en';
});

describe('GuardMomentsShareFace 本体 (batch79-a)', () => {
  it('en: 从生产词典渲染 pill/headline 插值/三轨道计数/品牌条, 且零金额', () => {
    locale = 'en';
    const { container } = render(<GuardMomentsShareFace data={FACE_DATA} />);
    expect(container.querySelector('[data-testid="guard-moments-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('Guard Moments');
    expect(text).toContain('8 moments held across 6 days');
    expect(text).toContain('Every quiet choice left a little light on this timeline.');
    expect(text).toContain('Intercept');
    expect(text).toContain('Substitute');
    expect(text).toContain('Reuse');
    expect(text).toContain('Symy');
    expect(text).toContain('Become a guardian with me');
    expectNoMoney(text, 'guard-moments [en]');
  });

  it('zh: 双语渲染守护时刻卡面文案, 且零金额', () => {
    locale = 'zh';
    const { container } = render(<GuardMomentsShareFace data={FACE_DATA} />);

    const text = container.textContent ?? '';
    expect(text).toContain('守护时刻');
    expect(text).toContain('6 天里，我们一起守住了 8 个时刻');
    expect(text).toContain('每一次安静的选择，都在这条时间线上留下了光。');
    expect(text).toContain('拦截');
    expect(text).toContain('替代');
    expect(text).toContain('复用');
    expect(text).toContain('和我一起当守护者');
    expectNoMoney(text, 'guard-moments [zh]');
  });

  it('空数据: 计数字段 null/undefined/[] 渲染不抛, headline 骨架词仍在, 无 NaN/undefined', () => {
    locale = 'en';
    const { container } = render(
      <GuardMomentsShareFace
        data={{
          trackCounts: {
            guard: null as unknown as number,
            alt: undefined as unknown as number,
            reuse: [] as unknown as number,
          },
          totalMoments: undefined as unknown as number,
          activeDays: null as unknown as number,
        }}
      />
    );
    expect(container.querySelector('[data-testid="guard-moments-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    // 插值参数空缺 → ICU 语义输出空串, headline 骨架词不丢
    expect(text).toContain('moments held across');
    expect(container.querySelector('[data-testid="guard-moments-share-stats"]')).not.toBeNull();
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'guard-moments [empty]');
  });
});
