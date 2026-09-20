/**
 * Tests for /transparency public page (batch81-a / batch82-b / batch104-c)
 *
 * - zh/en 渲染冒烟: 真实生产词典 (messages json) 驱动 mock t() —
 *   标题/五张指标卡 hero 数字/口径注/页脚 slogan 均真实可见
 * - 金额红线: 页面渲染产物零用户级字段 (user_id/userId); 金额只以平台总额
 *   语境出现; 赢回小时口径注明 ($25/h) 随数可见
 * - CO₂ (batch82-b): 第三北极星指标, 估算口径注明 + 开源仓库链接随数可见
 * - 降级态: degraded:true → 缓存快照提示可见
 * - 环比行 (batch104-c): 四周指标 ↑↓→ 三态 + 无基线中性态不渲染;
 *   下降态平静呈现, 全页焦虑词 grep 红线 (落后/警示/警告/behind/warning…)
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

// 页面自 batch82-a 起内嵌 TransparencyShareButton、batch84-c 起内嵌
// TransparencySubscribeForm (client, useTranslations + useLocale)
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
  useLocale: vi.fn(),
}));

import TransparencyPage from '../page';
import { getTranslations } from 'next-intl/server';
import { useTranslations, useLocale } from 'next-intl';
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

/** RSC 与 client (share-button / subscribe-form) 两条 t 路径都喂真实词典 */
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
  lastWeek: { intercepts: 5, savedUsd: 100, hoursWon: 4, co2SavedKg: 14 },
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
  // subscribe-form (batch84-c) 读 useLocale — 按渲染 locale 喂值
  (useLocale as ReturnType<typeof vi.fn>).mockReturnValue(locale);
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

describe('transparency page — trend arrows (batch104-c)', () => {
  /** 焦虑词红名单: 环比行 (尤其下降态) 与全页禁止出现 — 反 FOMO 铁律 */
  const ANXIETY_WORDS = /落后|警示|警告|告警|焦虑|预警|behind|warning|alert|alarm|anxiety|fear/i;

  it('keeps trendUp/trendDown/trendFlat non-empty in both real dictionaries and anxiety-free', () => {
    for (const key of ['trendUp', 'trendDown', 'trendFlat'] as const) {
      expect(typeof zhMsgs.transparency[key]).toBe('string');
      expect(typeof enMsgs.transparency[key]).toBe('string');
      expect((zhMsgs.transparency[key] as string).length).toBeGreaterThan(0);
      expect((enMsgs.transparency[key] as string).length).toBeGreaterThan(0);
      expect(zhMsgs.transparency[key]).not.toMatch(ANXIETY_WORDS);
      expect(enMsgs.transparency[key]).not.toMatch(ANXIETY_WORDS);
    }
  });

  it('renders the up state on all four week metrics with the strengthening-protection narrative (zh)', async () => {
    mockMessages(flat(zhMsgs));

    const { container } = await renderPage('zh');

    expect(screen.getByTestId('transparency-intercepts-trend').textContent).toBe(
      '↑ 较上周多 2 — 守护力在增强',
    );
    expect(screen.getByTestId('transparency-saved-trend').textContent).toBe(
      '↑ 较上周多 $20 — 守护力在增强',
    );
    expect(screen.getByTestId('transparency-hours-trend').textContent).toBe(
      '↑ 较上周多 0.8 — 守护力在增强',
    );
    expect(screen.getByTestId('transparency-co2-trend').textContent).toBe(
      '↑ 较上周多 2.8 — 守护力在增强',
    );
    // 守护者卡是累计口径 — 无环比行
    expect(screen.queryByTestId('transparency-guards-trend')).toBeNull();
    expect(container.textContent).not.toMatch(ANXIETY_WORDS);
  });

  it('renders the en up state from the real dictionary', async () => {
    mockMessages(flat(enMsgs));

    await renderPage('en');

    expect(screen.getByTestId('transparency-intercepts-trend').textContent).toBe(
      '↑ 2 more than last week — protection is growing',
    );
    expect(screen.getByTestId('transparency-saved-trend').textContent).toBe(
      '↑ $20 more than last week — protection is growing',
    );
  });

  it('renders the down state calmly — no anxiety wording anywhere on the page (zh + en)', async () => {
    const downWeek: TransparencySnapshot = {
      ...FIXTURE,
      lastWeek: { intercepts: 20, savedUsd: 500, hoursWon: 20, co2SavedKg: 70 },
    };
    for (const [locale, msgs] of [['zh', zhMsgs], ['en', enMsgs]] as const) {
      mockMessages(flat(msgs));
      (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(downWeek);
      const { container, unmount } = await renderPage(locale);

      expect(screen.getByTestId('transparency-intercepts-trend').textContent).toBe(
        locale === 'zh'
          ? '↓ 较上周少 13 — 平静的一周也是守护'
          : '↓ 13 less than last week — a calm week still counts',
      );
      expect(container.textContent ?? '').not.toMatch(ANXIETY_WORDS);
      unmount();
    }
  });

  it('renders the flat state when a metric is level with last week', async () => {
    mockMessages(flat(zhMsgs));
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...FIXTURE,
      lastWeek: { ...(FIXTURE.lastWeek as { intercepts: number; savedUsd: number; hoursWon: number; co2SavedKg: number }), hoursWon: 4.8 },
    });

    await renderPage('zh');

    expect(screen.getByTestId('transparency-hours-trend').textContent).toBe('→ 与上周持平');
  });

  it('renders the neutral state as no trend line when there is no last-week baseline', async () => {
    mockMessages(flat(zhMsgs));
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue({ ...FIXTURE, lastWeek: null });

    await renderPage('zh');

    for (const id of [
      'transparency-intercepts-trend',
      'transparency-saved-trend',
      'transparency-hours-trend',
      'transparency-co2-trend',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });
});

describe('transparency page — post-copy block (batch89-a)', () => {
  it('mounts the post-copy button next to the share button in zh and en', async () => {
    for (const [locale, msgs] of [['zh', zhMsgs], ['en', enMsgs]] as const) {
      mockMessages(flat(msgs));
      const { unmount } = await renderPage(locale);

      expect(screen.getByTestId('transparency-post-copy')).toBeTruthy();
      expect(screen.getByTestId('transparency-post-copy-button').textContent).toBe(
        msgs.transparency.postCopyButton,
      );
      expect(screen.getByTestId('transparency-share')).toBeTruthy();
      unmount();
    }
  });
});

describe('transparency page — finance link (batch83-a)', () => {
  it('links to the financial transparency subpage in zh and en', async () => {
    for (const [locale, msgs, expectText] of [
      ['zh', zhMsgs, '财务公开'],
      ['en', enMsgs, 'Financials'],
    ] as const) {
      mockMessages(flat(msgs));
      const { unmount } = await renderPage(locale);

      const link = screen.getByTestId('transparency-finance-link');
      expect(link.getAttribute('href')).toBe(`/${locale}/transparency/finance`);
      expect(link.textContent).toContain(expectText);
      unmount();
    }
  });
});

describe('transparency page — subscribe block (batch84-c)', () => {
  it('renders the weekly-report subscribe block in zh and en', async () => {
    for (const [locale, msgs] of [['zh', zhMsgs], ['en', enMsgs]] as const) {
      mockMessages(flat(msgs));
      const { unmount } = await renderPage(locale);

      expect(screen.getByTestId('transparency-subscribe')).toBeTruthy();
      expect(screen.getByTestId('transparency-subscribe-title').textContent).toBe(
        msgs.transparency.subscribeTitle,
      );
      expect(screen.getByTestId('transparency-subscribe-input')).toBeTruthy();
      expect(screen.getByTestId('transparency-subscribe-button').textContent).toBe(
        msgs.transparency.subscribeButton,
      );
      unmount();
    }
  });
});
