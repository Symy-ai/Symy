/**
 * Tests for /transparency/finance — 财务公开页 (batch83-a)
 *
 * - zh/en 渲染冒烟: 真实生产词典 (messages json) 驱动 mock t() —
 *   月度表格 / 累计行 / 账目说明块均真实可见
 * - 诚实原则: 全 0 占位 → "零值占位"提示; 空数据 → "待更新"态;
 *   亏损月净额带负号显示, 不钳成 0
 * - 红线: 渲染产物零用户级字段 (email / user_id / 个人金额字段)
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}));

vi.mock('@/lib/finance-public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/finance-public')>();
  return { ...actual, loadFinanceMonths: vi.fn() };
});

import FinancePage from '../page';
import { getTranslations } from 'next-intl/server';
import { loadFinanceMonths, type FinanceMonth } from '@/lib/finance-public';

/** zh/en 生产词典快照 — t() 断言打在用户真实可见文案上 */
const zhMsgs = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf-8'));
const enMsgs = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf-8'));

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, path));
    else out[path] = String(v);
  }
  return out;
}

function makeT(dict: Record<string, string>) {
  return (key: string): string => dict[key] ?? key;
}

const MONTH_WITH_DATA: FinanceMonth = {
  month: '2026-08',
  members: 10,
  revenueUsd: { membership: 100, other: 0 },
  costsUsd: { infra: 30, ai: 10, team: 0 },
  netUsd: 60,
  cumulativeNetUsd: 60,
};

const MONTH_PLACEHOLDER: FinanceMonth = {
  month: '2026-09',
  members: 0,
  revenueUsd: { membership: 0, other: 0 },
  costsUsd: { infra: 0, ai: 0, team: 0 },
  notes: '示例月占位：全 0，待 owner 录入首月真实账目。',
  netUsd: 0,
  cumulativeNetUsd: 60,
};

/** 亏损月 — 净额为负必须原样显示 (诚实原则) */
const MONTH_LOSS: FinanceMonth = {
  month: '2026-07',
  members: 5,
  revenueUsd: { membership: 40, other: 0 },
  costsUsd: { infra: 30, ai: 10, team: 60 },
  netUsd: -60,
  cumulativeNetUsd: -60,
};

async function renderPage(locale: 'zh' | 'en') {
  const ui = await FinancePage({ params: Promise.resolve({ locale }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadFinanceMonths as ReturnType<typeof vi.fn>).mockResolvedValue([MONTH_WITH_DATA, MONTH_PLACEHOLDER]);
});

describe('finance page — zh', () => {
  it('renders real dictionary copy with monthly table and cumulative row', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(zhMsgs)));

    const { container } = await renderPage('zh');

    expect(screen.getByTestId('finance-title').textContent).toBe('财务公开');
    expect(screen.getByTestId('finance-row-2026-08').textContent).toContain('$100');
    expect(screen.getByTestId('finance-row-2026-08').textContent).toContain('$40');
    expect(screen.getByTestId('finance-row-2026-08').textContent).toContain('$60');
    // 累计行: 收入 Σ100 / 成本 Σ40 / 净额 Σ60
    expect(screen.getByTestId('finance-cumulative').textContent).toContain('累计');
    expect(screen.getByTestId('finance-cumulative').textContent).toContain('$100');
    expect(screen.getByTestId('finance-cumulative').textContent).toContain('$40');
    expect(screen.getByTestId('finance-cumulative').textContent).toContain('$60');
    // 账目说明三要点: 只来自会员费 / 密钥与用户隐私永不公开 / 静态月更
    expect(container.textContent).toContain('收入只来自会员费');
    expect(container.textContent).toContain('永不公开');
    expect(container.textContent).toContain('静态月更');
    // 有真实数据月份在场 → 不出现占位提示
    expect(screen.queryByTestId('finance-placeholder')).toBeNull();
    // 返回透明度主页链接
    expect(screen.getByTestId('finance-back-link').getAttribute('href')).toBe('/zh/transparency');
  });

  it('shows a negative net month with its sign (never clamped to zero)', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(zhMsgs)));
    (loadFinanceMonths as ReturnType<typeof vi.fn>).mockResolvedValue([MONTH_LOSS]);

    await renderPage('zh');

    expect(screen.getByTestId('finance-row-2026-07').textContent).toContain('-$60');
    expect(screen.getByTestId('finance-cumulative').textContent).toContain('-$60');
  });
});

describe('finance page — en', () => {
  it('renders mirrored copy with table and notes', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(enMsgs)));

    const { container } = await renderPage('en');

    expect(screen.getByTestId('finance-title').textContent).toBe('Financial Transparency');
    expect(screen.getByTestId('finance-row-2026-08').textContent).toContain('$100');
    expect(container.textContent).toContain('membership fees only');
    expect(container.textContent).toContain('never published');
    expect(screen.getByTestId('finance-back-link').getAttribute('href')).toBe('/en/transparency');
  });
});

describe('finance page — honest empty / placeholder states', () => {
  it('all-zero months → placeholder hint instead of pretending to have data', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(zhMsgs)));
    (loadFinanceMonths as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...MONTH_PLACEHOLDER, cumulativeNetUsd: 0 },
    ]);

    await renderPage('zh');

    expect(screen.getByTestId('finance-placeholder').textContent).toContain('零值占位');
  });

  it('load failure / empty books → 待更新 state, no fabricated rows', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(zhMsgs)));
    (loadFinanceMonths as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await renderPage('zh');

    expect(screen.getByTestId('finance-empty').textContent).toContain('待');
    expect(screen.queryByTestId('finance-table')).toBeNull();
    expect(screen.queryByTestId('finance-row-2026-09')).toBeNull();
  });
});

describe('finance page — red lines', () => {
  it('renders zh and en with zero user-level fields in the markup', async () => {
    for (const [locale, msgs] of [['zh', zhMsgs], ['en', enMsgs]] as const) {
      (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(msgs)));
      const { container, unmount } = await renderPage(locale);

      const text = container.textContent ?? '';
      expect(text).not.toMatch(/email|@/i); // 无任何用户联系方式/个人标识
      expect(text).not.toMatch(/user_id|userId/);
      expect(text).not.toMatch(/"amount"/); // 无个人级订单字段透出
      unmount();
    }
  });
});
