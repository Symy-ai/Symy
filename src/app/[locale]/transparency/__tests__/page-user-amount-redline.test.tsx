// @vitest-environment happy-dom

/**
 * 公开面金额红线 — DB 行 → 快照 → 页面渲染 (batch126-a testgap scan)
 *
 * owner 铁律: 平台聚合数字可进治理公开面, 用户级金额红线不放松。
 *
 * 既有 page.test.tsx 用**手写快照 fixture**, 页面读的是 loadTransparencyWeekly 的返回值
 * —— 等于假设"聚合层已经洗好了", 没人钉住"洗的过程本身不把用户级金额漏出去"。
 * 本文件把红线回归线前移到 DB 行: 多用户 / 多金额行集 → 真实 aggregateTransparency →
 * 真实页面渲染, 断言渲染产物里金额只以平台桶出现, 逐笔金额与用户标识一个都不见。
 * 同时钉 API 面: 公开 JSON 只暴露契约键, 无原始行字段。
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('@/lib/transparency-weekly-server', () => ({ loadTransparencyWeekly: vi.fn() }));
vi.mock('@/lib/growth-stats-server', () => ({ loadGrowthStats: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: vi.fn(), useLocale: vi.fn() }));

import TransparencyPage from '../page';
import { getTranslations } from 'next-intl/server';
import { useTranslations, useLocale } from 'next-intl';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import { loadGrowthStats } from '@/lib/growth-stats-server';
import { aggregateTransparency, type TransparencyHealthRow, type TransparencyPassedChallengeRow, type TransparencyProfileRow, type TransparencySnapshot } from '@/lib/transparency-weekly';

function flat(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, p));
    else out[p] = String(v);
  }
  return out;
}

function mockMessages(file: 'zh' | 'en', locale: 'zh' | 'en') {
  const dict = flat(JSON.parse(readFileSync(`src/i18n/messages/${file}.json`, 'utf8')));
  const t = (key: string, values?: Record<string, string | number>): string => {
    const raw = dict[key] ?? key;
    if (!values) return raw;
    return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
  };
  (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(t);
  (useTranslations as ReturnType<typeof vi.fn>).mockReturnValue(t);
  (useLocale as ReturnType<typeof vi.fn>).mockReturnValue(locale);
}

const NOW = new Date('2026-09-18T12:00:00.000Z'); // 周五
/** 三用户三笔本周 (逐笔金额即"用户级金额"红线对象) + 两笔上周 (让环比非中性) */
const PASSED: TransparencyPassedChallengeRow[] = [
  { amount: 412.37, completed_at: '2026-09-16T09:00:00.000Z' },
  { amount: 88.11, completed_at: '2026-09-17T21:00:00.000Z' },
  { amount: 250, completed_at: '2026-09-14T00:00:00.000Z' },
  { amount: 640.5, completed_at: '2026-09-08T10:00:00.000Z' },
  { amount: 19.25, completed_at: '2026-09-10T08:00:00.000Z' },
];
const HEALTH: TransparencyHealthRow[] = [
  { id: 'ev-a1', user_id: 'user_alice', event_type: 'challenge_completed', trigger_id: 'trg_alice_1', created_at: '2026-09-16T09:00:00.000Z' },
  { id: 'ev-b1', user_id: 'user_bob', event_type: 'challenge_failed', trigger_id: 'trg_bob_1', created_at: '2026-09-17T21:00:00.000Z' },
  { id: 'ev-c1', user_id: 'user_carol', event_type: 'challenge_completed', trigger_id: 'trg_carol_1', created_at: '2026-09-14T00:00:00.000Z' },
];
const PROFILES: TransparencyProfileRow[] = [
  { created_at: '2026-09-01T00:00:00.000Z' },
  { created_at: '2026-09-05T00:00:00.000Z' },
  { created_at: '2026-09-09T00:00:00.000Z' },
];

function snapshotOf(rows: TransparencyPassedChallengeRow[]): TransparencySnapshot {
  return aggregateTransparency(HEALTH, rows, PROFILES, NOW);
}

/** 金额字符串的 locale 无关变体 (页面用 Intl 分组, zh/en 各自渲染) */
function renderings(amount: number): string[] {
  return [...new Set(['zh-CN', 'en-US'].flatMap((l) => {
    const f = new Intl.NumberFormat(l, { maximumFractionDigits: 2 }).format(amount);
    return [f, String(amount)];
  }))].filter((s) => s.length > 1 && s !== '0');
}

/**
 * 逐笔金额里**不能**出现在页面上的字符串。页面 hero 用 formatInt (四舍五入到整)
 * 渲染平台桶, 所以"平台桶取整后"的字面量是允许的 (那是公开承诺的聚合值)。
 */
function forbidden(rows: TransparencyPassedChallengeRow[], snap: TransparencySnapshot): string[] {
  const allowed = new Set([snap.savedUsd.week, snap.savedUsd.total, snap.lastWeek?.savedUsd ?? 0]
    .flatMap((n) => renderings(n)).concat(renderings(Math.round(snap.savedUsd.week)), renderings(Math.round(snap.savedUsd.total))));
  return rows.map((r) => Number(r.amount)).flatMap(renderings).filter((s) => !allowed.has(s));
}

async function renderPage(locale: 'zh' | 'en', snapshot: TransparencySnapshot) {
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);
  return render(await TransparencyPage({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadGrowthStats as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe('公开面红线 — 真实聚合快照渲染出页面', () => {
  it('aggregates three users into platform buckets before the page ever sees them', () => {
    const snap = snapshotOf(PASSED);

    // 本周三用户三笔 = 412.37+88.11+250; 上周两笔 = 640.5+19.25
    expect(snap.savedUsd.week).toBe(750.48);
    expect(snap.savedUsd.total).toBe(1410.23);
    expect(snap.lastWeek?.savedUsd).toBe(659.75);
    expect(snap.intercepts.week).toBe(3);
    expect(snap.guards).toBe(3);
    expect(Object.keys(snap.savedUsd)).toEqual(['week', 'total']);
    expect(JSON.stringify(snap)).not.toMatch(/alice|bob|carol|trg_/i);
  });

  for (const locale of ['zh', 'en'] as const) {
    it(`renders only the platform aggregate in ${locale} (no per-user amount, no user id)`, async () => {
      mockMessages(locale, locale);
      const snap = snapshotOf(PASSED);

      const { container, unmount } = await renderPage(locale, snap);
      const text = container.textContent ?? '';

      // 平台桶可见 (公开承诺兑现): 本周 + 累计
      expect(screen.getByTestId('transparency-saved-hero').textContent).toBe('$750');
      expect(screen.getByTestId('transparency-saved').textContent).toContain('$1,410');
      expect(screen.getByTestId('transparency-intercepts-hero').textContent).toBe('3');
      for (const s of forbidden(PASSED, snap)) expect(text).not.toContain(s);
      expect(text).not.toMatch(/alice|bob|carol|trg_/i);
      expect(text).not.toMatch(/user_id|userId/);
      unmount();
    });
  }

  it('leaks nothing when one per-user amount is tiny enough to render as noise', async () => {
    // 0.07 会被 formatInt 四舍五入成 0 — 若逐笔被渲染出来, 页面可能出现 "0"
    const tiny: TransparencyPassedChallengeRow[] = [PASSED[0], { amount: 0.07, completed_at: '2026-09-17T21:00:00.000Z' }];
    const snap = snapshotOf(tiny);
    mockMessages('en', 'en');

    const { container, unmount } = await renderPage('en', snap);
    const text = container.textContent ?? '';

    expect(snap.savedUsd.week).toBe(412.44);
    expect(text).toContain('$412');
    for (const s of forbidden(tiny, snap)) expect(text).not.toContain(s);
    unmount();
  });

  it('keeps the red line when the page is served a degraded (cached) snapshot', async () => {
    // 降级快照原样渲染 (页面只多一条缓存提示) — 红线不因降级而松
    const snap = { ...snapshotOf(PASSED), degraded: true };
    mockMessages('zh', 'zh');

    const { container, unmount } = await renderPage('zh', snap);
    const text = container.textContent ?? '';

    expect(screen.getByTestId('transparency-degraded').textContent).toContain('缓存快照');
    expect(text).toContain('$750');
    for (const s of forbidden(PASSED, snap)) expect(text).not.toContain(s);
    unmount();
  });

  it('exposes the platform aggregate on the API surface with no raw row fields', () => {
    const body = JSON.parse(JSON.stringify(snapshotOf(PASSED)));

    expect(Object.keys(body).sort()).toEqual([
      'co2SavedKg', 'degraded', 'generatedAt', 'guards', 'hoursWon', 'intercepts', 'lastWeek', 'savedUsd', 'weekEnd', 'weekStart',
    ]);
    expect(JSON.stringify(body)).not.toMatch(/user_id|userId|amount|trigger|alice|bob|carol/i);
  });
});
