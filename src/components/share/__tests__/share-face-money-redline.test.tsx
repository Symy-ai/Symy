/**
 * batch77-a — 分享卡面金额红线 (testgap v9 §十五.2 分享卡簇 8 文件)
 *
 * owner 09-06 铁律: 分享只晒面子绝不露里子 — 金额只能出现在私人视图。
 * 8 个分享卡面 (chat-parts 3 + profile-parts 5) mock + render, 断言渲染产物
 * (container.textContent) 零金额, zh/en 双语各跑一遍:
 *   a) 金额数字模式: 货币符号 / USD|CNY|RMB / 两位小数 (formatCurrency 产物) /
 *      \d+(元|块) — 即 /\d+(\.\d+)?\s*(元|块|¥|\$)/ 的分档拆解
 *   b) 金额字段文案: 金额|总额|省了…元|省下|saved…$ (及其 zh 词条)
 * i18n mock 解析 en.json/zh.json 生产词典 — 断言覆盖用户真实可见文案;
 * 缺 key 时回落 key 名 (与生产 createTranslator 降级同向, 亦不含金额)。
 * 样例数据沿用生产调用方的面子字段 (次数/小时/天数), 每卡同时断言 hero 数字
 * 可见 — 防止空渲染造成的假绿。豁免: formatFreedomTime/formatDiaryHours 产物
 * 是小时 (面子), "4.5" 一位小数不落两位小数金额模式。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { GuardDiaryShareFace } from '@/components/chat-parts/guard-diary-share';
import { GuardMomentsShareFace } from '@/components/chat-parts/guard-moments-share';
import { WeeklyReviewShareFace } from '@/components/chat-parts/weekly-review-share';
import { GuardConsistencyShareFace } from '@/components/profile-parts/guard-consistency-share';
import { GuardStyleShareFace } from '@/components/profile-parts/guard-style-share';
import { GuardYearReviewShareFace } from '@/components/profile-parts/guard-year-review-share';
import { ImpulseTriggerShareFace } from '@/components/profile-parts/impulse-trigger-share';
import { MonthlyGuardStatementShareFace } from '@/components/profile-parts/monthly-guard-statement-share';
import type { GuardMatrixTitle } from '@/lib/guard-consistency-matrix';
import type { MonthlyStatementTone } from '@/lib/monthly-guard-statement';
import type { GuardStyleId } from '@/lib/guard-style-profile';

/** zh/en 双语生产词典快照 — 红线断言要打在用户真实可见的文案上 */
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
    const translations = locale === 'zh' ? flat(zhMsgs) : flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale,
    };
  },
}));

/** 金额红线 — 数字模式 + 字段文案, 与简报 a/b 两组一一对应 */
const MONEY_NUMBER_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
];
const MONEY_WORDBOOK_PATTERN: Array<[RegExp, string]> = [
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

type FaceCase = {
  /** 组件导出名 — 测试名可读 */
  name: string;
  testid: string;
  data: Record<string, unknown>;
  /** 面子仍在: 这些 hero 数字/文案必须出现在渲染产物里 */
  expectVisible: string[];
};

const CASES: FaceCase[] = [
  {
    name: 'GuardDiaryShareFace (chat-parts)',
    testid: 'guard-diary-share-face',
    data: { date: '2026-09-14', text: 'Skipped the third coffee today', guardCount: 5, hoursReclaimed: 4.5, streakDays: 12 },
    expectVisible: ['Skipped the third coffee today', '5', '4.5'],
  },
  {
    name: 'GuardMomentsShareFace (chat-parts)',
    testid: 'guard-moments-share-face',
    data: { trackCounts: { guard: 3, alt: 2, reuse: 1 }, totalMoments: 8, activeDays: 6 },
    expectVisible: ['8', '3', '2', '1'],
  },
  {
    name: 'WeeklyReviewShareFace (chat-parts)',
    testid: 'weekly-review-share-face',
    data: { weekKey: '2026-09-07', guardCount: 5, hoursReclaimed: 4.5, momentLabel: 'Third coffee skipped' },
    expectVisible: ['Third coffee skipped', '5', '4.5'],
  },
  {
    name: 'GuardConsistencyShareFace (profile-parts)',
    testid: 'guard-consistency-share-face',
    data: {
      rows: [
        { label: 'clothing', actions: 9, activeDays: 4, title: 'steadiest' as GuardMatrixTitle },
        { label: 'electronics', actions: 3, activeDays: 2, title: null },
        { label: 'food', actions: 2, activeDays: 1, title: 'needsCare' as GuardMatrixTitle },
      ],
      steadiestLabel: 'clothing',
      needsCareLabel: 'food',
      totalActions: 14,
      activeDays: 7,
    },
    expectVisible: ['clothing', '14', '7'],
  },
  {
    name: 'GuardStyleShareFace (profile-parts)',
    testid: 'guard-style-share-face',
    data: {
      styleId: 'substitutor' as GuardStyleId,
      styleName: 'The Substitutor',
      verdict: 'Swap it, do not stop it',
      trackCounts: { guard: 4, alt: 6, reuse: 2 },
    },
    expectVisible: ['The Substitutor', '6'],
  },
  {
    name: 'GuardYearReviewShareFace (profile-parts)',
    testid: 'guard-year-review-share-face',
    data: { year: 2026, intercepts: 37, commitments: 12, adoptions: 9, longestStreakDays: 6, steadiestMonth: 8 },
    expectVisible: ['2026', '37', '12', '9', '6'],
  },
  {
    name: 'ImpulseTriggerShareFace (profile-parts)',
    testid: 'impulse-trigger-share-face',
    data: { topReasonLabel: 'Late-night scrolling', interceptCount: 21, activeDays: 9 },
    expectVisible: ['Late-night scrolling', '21', '9'],
  },
  {
    name: 'MonthlyGuardStatementShareFace (profile-parts)',
    testid: 'monthly-statement-share-face',
    data: {
      monthLabel: '2026 / 09',
      interceptCount: 18,
      hoursLabel: '37 hours',
      longestStreakDays: 6,
      tone: 'harvest' as MonthlyStatementTone,
    },
    expectVisible: ['37 hours', '18', '6'],
  },
];

beforeEach(() => {
  locale = 'en';
});

describe('money red line: 8 share faces render zero money in either locale', () => {
  it.each(CASES.map((c) => [c.name, 'en', c] as const))('%s (%s)', (_name, lang, c) => {
    locale = lang;
    const { container } = render(
      // 三参组件 (GuardDiary/GuardStyle/…) 只吃 data + 可选 cardRef; 用 as 兼容各 interface
      renderFace(c)
    );
    expect(container.querySelector(`[data-testid="${c.testid}"]`)).not.toBeNull();

    const text = container.textContent ?? '';
    for (const [re, label] of MONEY_NUMBER_PATTERNS) {
      const hit = text.match(re);
      expect(hit, `${c.name} [${lang}] renders a money number (${label}): "${hit?.[0]}"`).toBeNull();
    }
    for (const [re, label] of MONEY_WORDBOOK_PATTERN) {
      const hit = text.match(re);
      expect(hit, `${c.name} [${lang}] renders money wording (${label}): "${hit?.[0]}"`).toBeNull();
    }
    for (const visible of c.expectVisible) {
      expect(text, `${c.name} [${lang}] lost its face number "${visible}"`).toContain(visible);
    }
  });

  it.each(CASES.map((c) => [c.name, 'zh', c] as const))('%s (%s)', (_name, lang, c) => {
    locale = lang;
    const { container } = render(renderFace(c));
    expect(container.querySelector(`[data-testid="${c.testid}"]`)).not.toBeNull();

    const text = container.textContent ?? '';
    for (const [re, label] of MONEY_NUMBER_PATTERNS) {
      const hit = text.match(re);
      expect(hit, `${c.name} [${lang}] renders a money number (${label}): "${hit?.[0]}"`).toBeNull();
    }
    for (const [re, label] of MONEY_WORDBOOK_PATTERN) {
      const hit = text.match(re);
      expect(hit, `${c.name} [${lang}] renders money wording (${label}): "${hit?.[0]}"`).toBeNull();
    }
    for (const visible of c.expectVisible) {
      expect(text, `${c.name} [${lang}] lost its face number "${visible}"`).toContain(visible);
    }
  });
});

/** 按卡面分发 props — 各 Face 的 data interface 均为面子字段, 形状互不相同 */
function renderFace(c: FaceCase): ReactElement {
  switch (c.testid) {
    case 'guard-diary-share-face':
      return <GuardDiaryShareFace data={c.data as unknown as Parameters<typeof GuardDiaryShareFace>[0]['data']} />;
    case 'guard-moments-share-face':
      return <GuardMomentsShareFace data={c.data as unknown as Parameters<typeof GuardMomentsShareFace>[0]['data']} />;
    case 'weekly-review-share-face':
      return <WeeklyReviewShareFace data={c.data as unknown as Parameters<typeof WeeklyReviewShareFace>[0]['data']} />;
    case 'guard-consistency-share-face':
      return <GuardConsistencyShareFace data={c.data as unknown as Parameters<typeof GuardConsistencyShareFace>[0]['data']} />;
    case 'guard-style-share-face':
      return <GuardStyleShareFace data={c.data as unknown as Parameters<typeof GuardStyleShareFace>[0]['data']} />;
    case 'guard-year-review-share-face':
      return <GuardYearReviewShareFace data={c.data as unknown as Parameters<typeof GuardYearReviewShareFace>[0]['data']} />;
    case 'impulse-trigger-share-face':
      return <ImpulseTriggerShareFace data={c.data as unknown as Parameters<typeof ImpulseTriggerShareFace>[0]['data']} />;
    default:
      return <MonthlyGuardStatementShareFace data={c.data as unknown as Parameters<typeof MonthlyGuardStatementShareFace>[0]['data']} />;
  }
}
