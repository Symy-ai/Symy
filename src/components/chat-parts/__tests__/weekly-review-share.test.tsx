/**
 * batch79-a — WeeklyReviewShareFace 本体补测 (testgap v9 §十五.2 share 卡簇)
 *
 * batch77-a 的 share-face-money-redline.test.tsx 已 sweep 正常数据下的金额红线;
 * 本文件补逐卡专属盲区:
 *   1. 核心内容渲染 — 周复盘 pill/骄傲时刻标题与自选文案/次数小时面板/品牌条,
 *      zh/en 生产词典各一遍;
 *   2. 金额红线 (owner 09-06) — 面子数据输入下 textContent 零金额;
 *   3. 空数据健壮性 — momentLabel 空串走组件自带的 fallback 文案 (设计内空态),
 *      weekKey/guardCount/hoursReclaimed 吃 undefined/null 渲染不抛,
 *      formatDiaryHours 空值回落 '0', 无 NaN/undefined 字样。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { WeeklyReviewShareFace } from '../weekly-review-share';

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
  weekKey: '2026-09-07',
  guardCount: 5,
  hoursReclaimed: 4.5,
  momentLabel: 'Third coffee skipped',
};

beforeEach(() => {
  locale = 'en';
});

describe('WeeklyReviewShareFace 本体 (batch79-a)', () => {
  it('en: 从生产词典渲染 pill/骄傲时刻/次数小时面板/品牌条, 且零金额', () => {
    locale = 'en';
    const { container } = render(<WeeklyReviewShareFace data={FACE_DATA} />);
    expect(container.querySelector('[data-testid="weekly-review-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('Weekly Review');
    expect(text).toContain('MY PROUDEST GUARD THIS WEEK');
    expect(text).toContain('Third coffee skipped');
    expect(text).toContain('guards this week');
    expect(text).toContain('hours won back');
    expect(text).toContain('Symy');
    expect(text).toContain('Become a guardian with me');
    expectNoMoney(text, 'weekly-review [en]');
  });

  it('zh: 双语渲染周复盘卡面文案, 且零金额', () => {
    locale = 'zh';
    const { container } = render(<WeeklyReviewShareFace data={FACE_DATA} />);

    const text = container.textContent ?? '';
    expect(text).toContain('周复盘');
    expect(text).toContain('本周最骄傲的守护');
    expect(text).toContain('Third coffee skipped');
    expect(text).toContain('本周守护');
    expect(text).toContain('换回自由小时');
    expect(text).toContain('和我一起当守护者');
    expect(text).toMatch(/9月7日/);
    expectNoMoney(text, 'weekly-review [zh]');
  });

  it('空数据: momentLabel 空串走 fallback 文案, null/undefined 字段渲染不抛, 无 NaN/undefined', () => {
    locale = 'en';
    const { container } = render(
      <WeeklyReviewShareFace
        data={{
          weekKey: undefined as unknown as string,
          guardCount: null as unknown as number,
          hoursReclaimed: undefined as unknown as number,
          momentLabel: '',
        }}
      />
    );
    expect(container.querySelector('[data-testid="weekly-review-share-face"]')).not.toBeNull();

    let text = container.textContent ?? '';
    // 组件设计内空态: 自选时刻缺位 → fallback 文案顶上, 不留白
    expect(text).toContain('Every quiet no — counted, and mine.');
    expect(container.querySelector('[data-testid="weekly-review-share-stats"]')).not.toBeNull();
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'weekly-review [empty en]');

    // zh 同一遍 — fallback 是双语词条, 两侧都要钉住
    locale = 'zh';
    const zhView = render(
      <WeeklyReviewShareFace
        data={{
          weekKey: null as unknown as string,
          guardCount: undefined as unknown as number,
          hoursReclaimed: null as unknown as number,
          momentLabel: '',
        }}
      />
    );
    text = zhView.container.textContent ?? '';
    expect(text).toContain('每一个安静的不买，都被记住了。');
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'weekly-review [empty zh]');
  });
});
