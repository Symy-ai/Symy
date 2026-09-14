// @vitest-environment happy-dom

/**
 * MonthlyGuardStatementCard — 卡片渲染 + 分享面 amount-free 测试 (batch54-b)
 * 测法对齐 impulse-trigger-card.test.tsx: 双语词表从真实 i18n 文件快照,
 * apiFetch mock 四类事件, 断言卡面渲染 + 分享面结构上无金额字符。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { MonthlyGuardStatementCard } from '../monthly-guard-statement-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

/** zh/en 双语词表快照 — 从真实 i18n 文件取 */
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

let locale = 'en';

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

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25 }),
}));

/** 当前自然月内的事件集 (跨月对比 + 品类 + 采纳齐备) */
function statementEvents(): Array<Record<string, unknown>> {
  const now = new Date();
  const inMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 10, 0, 0).toISOString();
  const inPrevMonth = (day: number) => new Date(now.getFullYear(), now.getMonth() - 1, day, 10, 0, 0).toISOString();
  return [
    { eventType: 'challenge_completed', triggerSource: 'guard', triggerId: 'p1', metadata: { category: 'clothing' }, createdAt: inPrevMonth(5) },
    { eventType: 'challenge_completed', triggerSource: 'guard', triggerId: 'c1', metadata: { category: 'clothing' }, createdAt: inMonth(1) },
    { eventType: 'challenge_completed', triggerSource: 'guard', triggerId: 'c2', metadata: { category: 'clothing' }, createdAt: inMonth(2) },
    { eventType: 'challenge_completed', triggerSource: 'guard', triggerId: 'c3', metadata: { category: 'food' }, createdAt: inMonth(3) },
    { eventType: 'challenge_failed', triggerSource: 'guard', triggerId: 'f1', createdAt: inMonth(4) },
    { eventType: 'challenge_reward', triggerSource: 'deposit_api', triggerId: 'd1', metadata: { source: 'deposit', amount: 925 }, createdAt: inMonth(3) },
    { eventType: 'mindful_recovery', triggerSource: 'chat_mcp', triggerId: 'green-alt-adoption:handmade-gift:2026-09-01', metadata: { kind: 'green_alt_adoption', entryId: 'handmade-gift' }, createdAt: inMonth(5) },
  ];
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MonthlyGuardStatementCard', () => {
  it('renders skeleton while loading', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<MonthlyGuardStatementCard />);
    expect(screen.getByTestId('monthly-statement-card-skeleton')).toBeTruthy();
  });

  it('renders empty guide state on fetch failure (no fake statement)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network') as never);
    render(<MonthlyGuardStatementCard />);
    await screen.findByTestId('monthly-statement-card-empty');
  });

  it('renders zh: headline/hours/category chips reuse guardCategoryName vocabulary, private amount marked visible-only', async () => {
    locale = 'zh';
    vi.mocked(apiFetch).mockResolvedValue({ events: statementEvents() } as never);
    render(<MonthlyGuardStatementCard />);
    await screen.findByTestId('monthly-statement-card');

    expect(screen.getByTestId('monthly-statement-card-headline').textContent).toContain('4 局守护');
    // 守护自由小时: 925 / 25 = 37 小时
    expect(screen.getByTestId('monthly-statement-card-hours').textContent).toContain('37');
    // 品类 chip 复用既有词表
    expect(screen.getByTestId('monthly-statement-card-categories').textContent).toContain(
      `${zhMsgs.profile.guardCategoryName.clothing} ×2`,
    );
    // 私享金额行有"仅自己可见"标注 (对齐 win-rate 卡措辞先例)
    expect(screen.getByTestId('monthly-statement-card-amount').textContent).toContain('仅自己可见');
    // 对比行: 上月 1 局 → up
    expect(screen.getByTestId('monthly-statement-card-compare').textContent).toContain('1');
  });

  it('renders en: bilingual labels', async () => {
    locale = 'en';
    vi.mocked(apiFetch).mockResolvedValue({ events: statementEvents() } as never);
    render(<MonthlyGuardStatementCard />);
    await screen.findByTestId('monthly-statement-card');

    expect(screen.getByTestId('monthly-statement-card-hours').textContent).toContain('37');
    expect(screen.getByTestId('monthly-statement-card-categories').textContent).toContain(
      `${enMsgs.profile.guardCategoryName.clothing} ×2`,
    );
  });

  it('share face opens on click and is structurally amount-free (counts/hours/days + elephant tone only)', async () => {
    locale = 'en';
    vi.mocked(apiFetch).mockResolvedValue({ events: statementEvents() } as never);
    render(<MonthlyGuardStatementCard />);
    fireEvent.click(await screen.findByTestId('monthly-statement-share-btn'));

    const face = await screen.findByTestId('monthly-statement-share-face');
    expect(face.textContent).toContain('37');
    expect(face.textContent).toContain(String(4));
    // 小象月度寄语 (三档词表, 本例 4 局 → steady)
    expect(face.textContent).toContain(enMsgs.profile.monthlyStatement.share.tone.steady);
    // 分享面金额红线
    expect(face.textContent).not.toMatch(/\$\d/);
    expect(face.textContent).not.toMatch(/\d+\.\d\d/);
    expect(face.textContent).not.toContain('925');
  });
});
