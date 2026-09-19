/**
 * Tests for /transparency public page (batch81-a / batch82-b)
 *
 * - zh/en 渲染冒烟: 真实生产词典 (messages json) 驱动 mock t() —
 *   标题/五张指标卡 hero 数字/口径注/页脚 slogan 均真实可见
 * - 金额红线: 页面渲染产物零用户级字段 (user_id/userId); 金额只以平台总额
 *   语境出现; 赢回小时口径注明 ($25/h) 随数可见
 * - CO₂ (batch82-b): 第三北极星指标, 估算口径注明 + 开源仓库链接随数可见
 * - 降级态: degraded:true → 缓存快照提示可见
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}));

vi.mock('@/lib/transparency-weekly-server', () => ({
  loadTransparencyWeekly: vi.fn(),
}));

// 增长区块 (batch82-c) — K 因子 + 邀请漏斗
vi.mock('@/lib/growth-stats-server', () => ({
  loadGrowthStats: vi.fn(),
}));

// 页面自 batch82-a 起内嵌 TransparencyShareButton (client, useTranslations)
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
}));

import TransparencyPage from '../page';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import { loadGrowthStats } from '@/lib/growth-stats-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';
import type { GrowthStats } from '@/lib/growth-stats';

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
  return (key: string, values?: Record<string, string | number>): string => {
    const raw = dict[key] ?? key;
    if (!values) return raw;
    return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
  };
}

/** RSC 与 client (share-button) 两条 t 路径都喂真实词典 */
function mockMessages(dict: Record<string, string>) {
  (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(dict));
  (useTranslations as ReturnType<typeof vi.fn>).mockReturnValue(makeT(dict));
}

const FIXTURE: TransparencySnapshot = {
  weekStart: '2026-09-14T00:00:00.000Z',
  weekEnd: '2026-09-18T12:00:00.000Z',
  intercepts: { week: 7, total: 42 },
  savedUsd: { week: 120, total: 960 },
  hoursWon: { week: 4.8, total: 38.4 },
  co2SavedKg: { week: 16.8, total: 134.4 },
  guards: 13,
  generatedAt: '2026-09-18T12:00:00.000Z',
  degraded: false,
};

/** 增长区块 fixture (batch82-c): K=0.3 真实小数字, 7 发出/2 完成/7 邀请者 */
const GROWTH_FIXTURE: GrowthStats = {
  invites: { total: 7, pending: 5, completed: 2 },
  uniqueInviters: 7,
  kFactorApprox: 0.3,
  generatedAt: '2026-09-18T12:00:00.000Z',
};

async function renderPage(locale: 'zh' | 'en') {
  const ui = await TransparencyPage({ params: Promise.resolve({ locale }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(FIXTURE);
  (loadGrowthStats as ReturnType<typeof vi.fn>).mockResolvedValue(GROWTH_FIXTURE);
});

describe('transparency page — zh', () => {
  it('renders real dictionary copy with hero numbers visible', async () => {
    mockMessages(flat(zhMsgs));

    const { container } = await renderPage('zh');

    expect(screen.getByTestId('transparency-title').textContent).toBe('每周透明度报告');
    expect(screen.getByTestId('transparency-intercepts-hero').textContent).toBe('7');
    expect(screen.getByTestId('transparency-saved-hero').textContent).toBe('$120');
    expect(screen.getByTestId('transparency-hours-hero').textContent).toBe('4.8');
    expect(screen.getByTestId('transparency-co2-hero').textContent).toBe('16.8');
    expect(screen.getByTestId('transparency-guards-hero').textContent).toBe('13');
    // 口径随数注明 (hoursCaliberNote 含 $25 换算来源)
    expect(container.textContent).toContain('口径');
    expect(container.textContent).toContain('$25/小时');
    // CO₂ 估算口径注明 + 开源仓库口径文件链接 (batch82-b)
    expect(container.textContent).toContain('非实测');
    expect(screen.getByTestId('transparency-co2-link').getAttribute('href')).toContain('co2-estimate.ts');
    expect(container.textContent).toContain('数据生成于 2026-09-18（UTC）');
    expect(screen.getByTestId('transparency-footer-slogan').textContent).toBe(
      '透明就是我们的内容引擎 — build in public',
    );
  });
});

describe('transparency page — en', () => {
  it('renders the exact BP slogan and mirror metrics', async () => {
    mockMessages(flat(enMsgs));

    const { container } = await renderPage('en');

    expect(screen.getByTestId('transparency-title').textContent).toBe('Weekly Transparency Report');
    expect(screen.getByTestId('transparency-saved-hero').textContent).toBe('$120');
    expect(screen.getByTestId('transparency-co2-hero').textContent).toBe('16.8');
    expect(screen.getByTestId('transparency-guards-hero').textContent).toBe('13');
    expect(screen.getByTestId('transparency-footer-slogan').textContent).toBe(
      'Transparency is our content engine — build in public',
    );
    expect(container.textContent).toContain('$25/hour');
    // CO₂ estimate caliber note visible in en as well
    expect(container.textContent).toContain('not measured');
  });
});

describe('transparency page — red lines', () => {
  it('renders zh and en with zero user-level fields in the markup (no personal amounts)', async () => {
    for (const [locale, msgs] of [['zh', zhMsgs], ['en', enMsgs]] as const) {
      mockMessages(flat(msgs));
      const { container, unmount } = await renderPage(locale);

      const text = container.textContent ?? '';
      expect(text).not.toMatch(/user_id|userId/);
      expect(text).not.toMatch(/"amount"/); // 无个人级订单字段透出
      unmount();
    }
  });

  it('shows the degraded banner when serving a cached snapshot', async () => {
    mockMessages(flat(zhMsgs));
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue({ ...FIXTURE, degraded: true });

    await renderPage('zh');

    expect(screen.getByTestId('transparency-degraded').textContent).toContain('缓存快照');
  });
});

describe('transparency page — growth section (batch82-c)', () => {
  it('renders zh K-factor + funnel with caliber note next to the numbers', async () => {
    mockMessages(flat(zhMsgs));

    const { container } = await renderPage('zh');

    expect(screen.getByTestId('transparency-growth')).toBeTruthy();
    expect(screen.getByTestId('transparency-growth-k-hero').textContent).toBe('0.3'); // K=0.3 显示 0.3
    expect(screen.getByTestId('transparency-growth-sent').textContent).toContain('7');
    expect(screen.getByTestId('transparency-growth-completed').textContent).toContain('2');
    expect(screen.getByTestId('transparency-growth-inviters').textContent).toContain('7');
    // 口径随数可见 (指定措辞): completed 邀请 ÷ 去重邀请者
    expect(container.textContent).toContain('K 因子近似口径：completed 邀请 ÷ 去重邀请者');
    // 奖励是代币权益非现金 — 注明不展示
    expect(container.textContent).toContain('非现金');
  });

  it('renders en K-factor + funnel with the caliber note mirrored', async () => {
    mockMessages(flat(enMsgs));

    const { container } = await renderPage('en');

    expect(screen.getByTestId('transparency-growth-k-hero').textContent).toBe('0.3');
    expect(container.textContent).toContain('K-factor caliber (approx.): completed invites ÷ unique inviters');
    expect(container.textContent).toContain('not cash');
  });

  it('hides the whole growth section when aggregation fails (never fake zeros)', async () => {
    mockMessages(flat(zhMsgs));
    (loadGrowthStats as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { container } = await renderPage('zh');

    expect(screen.queryByTestId('transparency-growth')).toBeNull();
    expect(container.textContent).not.toContain('K 因子近似口径');
  });

  it('growth markup carries zero personal / amount fields (aggregate only red line)', async () => {
    mockMessages(flat(zhMsgs));

    const { container } = await renderPage('zh');

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/user_id|userId|referee|referrer_user/);
    expect(text).not.toMatch(/reward|amount/i);
    expect(text).not.toContain('50'); // 邀请奖励 50 代币不是钱, 任何形式都不出现
  });
});
