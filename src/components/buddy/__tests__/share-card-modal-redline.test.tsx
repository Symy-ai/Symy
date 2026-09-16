/**
 * batch77-a — ShareCardModal (buddy 装配层) 金额红线·输入侧攻击 (testgap v9 §十五.2)
 *
 * green-narrative-guard.test.tsx 已钉住干净输入下 canvas 导出零金额; 本文件换
 * 攻击性输入复验同一红线: dreamFunds 带金额语义、aiQuote 塞满金额
 * ($12.34 / 30 元 / 50 CNY), 断言:
 *   1. DOM 渲染产物 (portal: 故事输入/按钮/隐私注记) 零金额 —
 *      dreamFunds 的 current/target 只参与小时换算, 永不出现在 DOM;
 *   2. canvas fillText 全文零金额, 且 quote 里的金额被 stripMoney 抠掉后
 *      余文仍上卡 (非整句丢弃), 赢回小时数 (面子) 照常出现。
 * 金额只进换算 ((90+250) ÷ 20 时薪 = 17h), 不上任何导出面。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ShareCardModal } from '../share-card-modal';
import type { BuddyState } from '@/types/buddy-state';

const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations = flat(enMsgs);
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (k !== 'defaultValue' && params.defaultValue === undefined) {
              result = result.replace(`{${k}}`, String(v));
            }
          }
        }
        return params?.defaultValue !== undefined ? params.defaultValue : result;
      },
      locale: 'en',
    };
  },
}));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: 20 }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
// 隔离被测单元 — 多平台按钮组有自己的 whitebox 测试 (common/__tests__)
vi.mock('@/components/common/multi-platform-share', () => ({ MultiPlatformShare: () => null }));

const MONEY_PATTERNS: Array<[RegExp, string]> = [
  [/[$¥€£]/, 'currency symbol'],
  [/\b(?:USD|CNY|RMB)\b/, 'currency code'],
  [/\d+\.\d{2}\b/, '2-decimal money format'],
  [/\d+(?:\.\d+)?\s*(?:元|块)/, 'CNY colloquial amount'],
  [/金额|总额/, 'money-field noun (zh)'],
  [/省了.{0,12}元|省下/, 'saved-amount phrasing (zh)'],
  [/saved.*\$/i, 'saved-amount phrasing (en)'],
];

const captured: string[] = [];

beforeAll(() => {
  // happy-dom 没有 2d context — 用桩捕获全部 fillText 文字 (同 green-narrative-guard)
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: (text: string) => {
      captured.push(String(text));
    },
    measureText: (s: string) => ({ width: s.length * 20 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,stub');
});

/** 输入侧攻击: buddyState 携带金额语义 (dream fund 余额/目标), aiQuote 塞满金额 */
const moneyLadenState = {
  dreamFunds: [
    { id: 'df-camera', name: 'Camera', target: 400, current: 90, emoji: '📷' },
    { id: 'df-savings', name: 'Savings', target: 1000, current: 250, emoji: '🏦' },
  ],
  streak: 12,
  level: 3,
  vitality: 87.5,
} as unknown as BuddyState;

const moneyLadenQuote = 'Skipped it! Saved $12.34 today — 30 元 less on my card, that is 50 CNY kept.';

describe('ShareCardModal money red line under money-laden inputs', () => {
  it('renders zero money in the portal DOM while dream-fund amounts stay inside the math', async () => {
    render(
      <ShareCardModal open onClose={() => {}} buddyState={moneyLadenState} aiQuote={moneyLadenQuote} />
    );

    // DOM 面仍在: 故事输入标签 + 保存/分享按钮 + 隐私注记
    await waitFor(() => expect(document.body.querySelector('img[alt="Symy Guardian Card"]')).not.toBeNull());
    const domText = document.body.textContent ?? '';
    expect(domText).toContain("Today's story");
    expect(domText).toContain('Save Image');
    expect(domText).toContain('Share');
    expect(domText).toContain("Won't share your personal info");

    // 90/250 等金额数字不得泄入 DOM (只参与 90÷20=4.5h 换算)
    expect(domText).not.toContain('400');
    expect(domText).not.toContain('250');
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = domText.match(re);
      expect(hit, `portal DOM renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });

  it('scrubs money out of the AI quote on canvas but keeps the scrubbed words and won-back hours', async () => {
    captured.length = 0;
    render(
      <ShareCardModal open onClose={() => {}} buddyState={moneyLadenState} aiQuote={moneyLadenQuote} />
    );

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));

    const canvasText = captured.join('\n');
    // 面子仍在: 赢回小时 ((90+250) ÷ 时薪 20 = 17.0h) 是卡上主角
    expect(canvasText).toContain('17.0');

    // stripMoney 抠掉金额后余文上卡 — 不是整句丢弃 (丢句会回落 defaultQuote)
    expect(canvasText).toContain('Skipped it!');

    // canvas 全文零金额 (数字模式 + 字段文案)
    for (const [re, label] of MONEY_PATTERNS) {
      const hit = canvasText.match(re);
      expect(hit, `canvas text renders money (${label}): "${hit?.[0]}"`).toBeNull();
    }
  });
});
