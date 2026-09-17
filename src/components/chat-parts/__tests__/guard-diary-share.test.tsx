/**
 * batch79-a — GuardDiaryShareFace 本体补测 (testgap v9 §十五.2 share 卡簇)
 *
 * batch77-a 的 share-face-money-redline.test.tsx 已 sweep 正常数据下的金额红线;
 * 本文件补逐卡专属盲区:
 *   1. 核心内容渲染 — pill/日记文案/次数小时面板/连续天数/品牌条, 用 zh/en 生产
 *      词典快照断言用户真实可见文案 (非 key 回落);
 *   2. 金额红线 (owner 09-06) — 面子数据输入下 container.textContent 零金额,
 *      zh/en 各断言一遍 (简报红线 regex + formatCurrency 产物形状分档);
 *   3. 空数据健壮性 — date/text/guardCount/hoursReclaimed/streakDays 分别吃
 *      undefined/null/[] 渲染不抛, formatFreedomTime 空值回落 '0 hours',
 *      streakDays 空值不渲染天数面板, 无 NaN/undefined 字样。
 * i18n mock 与生产同向: next-intl 底层 intl-messageformat 对 nullish 插值参数
 * 输出空串 (已实测), 故 mock 对 nullish 参数 replace 为 ''。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { GuardDiaryShareFace } from '../guard-diary-share';

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
  date: '2026-09-14',
  text: 'Skipped the third coffee today',
  guardCount: 5,
  hoursReclaimed: 4.5,
  streakDays: 12,
};

beforeEach(() => {
  locale = 'en';
});

describe('GuardDiaryShareFace 本体 (batch79-a)', () => {
  it('en: 从生产词典渲染 pill/日记文案/统计面板/连续天数/品牌条, 且零金额', () => {
    locale = 'en';
    const { container } = render(<GuardDiaryShareFace data={FACE_DATA} />);
    expect(container.querySelector('[data-testid="guard-diary-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('Guard Diary');
    expect(text).toContain('Skipped the third coffee today');
    expect(text).toContain('Guards today');
    expect(text).toContain('4.5 hours');
    expect(text).toContain('4.5 hours won back');
    expect(text).toMatch(/Consecutive guards\s*·\s*12\s*days/);
    expect(text).toContain('Symy');
    expect(text).toContain('Become a guardian with me');
    expectNoMoney(text, 'guard-diary [en]');
  });

  it('zh: 双语渲染守护日记卡面文案, 且零金额', () => {
    locale = 'zh';
    const { container } = render(<GuardDiaryShareFace data={FACE_DATA} />);

    const text = container.textContent ?? '';
    expect(text).toContain('守护日记');
    expect(text).toContain('今日守护');
    expect(text).toContain('4.5 小时');
    expect(text).toContain('赢回 4.5 小时');
    expect(text).toMatch(/连续守护\s*·\s*12\s*天/);
    expect(text).toContain('和我一起当守护者');
    // 日期按 locale 走 zh-CN 长格式 (TZ=UTC 由全局 setup 钉死)
    expect(text).toMatch(/2026年9月14日/);
    expectNoMoney(text, 'guard-diary [zh]');
  });

  it('空数据: undefined/null/[] 渲染不抛, formatFreedomTime 回落 0 hours, 无 NaN/undefined', () => {
    locale = 'en';
    const { container } = render(
      <GuardDiaryShareFace
        data={{
          date: undefined as unknown as string,
          text: null as unknown as string,
          guardCount: undefined as unknown as number,
          hoursReclaimed: null as unknown as number,
          streakDays: [] as unknown as number,
        }}
      />
    );
    expect(container.querySelector('[data-testid="guard-diary-share-face"]')).not.toBeNull();

    const text = container.textContent ?? '';
    // formatFreedomTime(null) → Number.isFinite 分流到 '0 小时'/'0 hours', 不出 NaN
    expect(text).toContain('0 hours');
    // date 非法回落今天, 顶部日期条仍在渲染 (不抛即达, 无需断言具体日期)
    expect(container.querySelector('[data-testid="guard-diary-share-stats"]')).not.toBeNull();
    // streakDays 空值 → 天数面板隐藏 (0 不出失败态)
    expect(container.querySelector('[data-testid="guard-diary-share-streak"]')).toBeNull();
    expect(text).not.toMatch(/NaN|undefined/);
    expectNoMoney(text, 'guard-diary [empty]');
  });
});
