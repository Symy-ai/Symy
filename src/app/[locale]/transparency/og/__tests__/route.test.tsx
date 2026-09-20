/**
 * Tests for /[locale]/transparency/og — 周报分享卡 (batch82-a / batch104-c)
 *
 * - 周报卡渲染冒烟: mock 聚合快照 → 无金额/碳指标 + Week of <weekStart> + 品牌可见
 * - 环比行 (batch104-c): 拦截/小时两 tile 带 ↑↓→ 趋势; 无上周基线 → 中性态不渲染;
 *   守护者 (累计) 无环比; 趋势行同样无金额
 * - 降级分支: loader 拒绝/返回 null → 静态骨架卡 (品牌 + 内容引擎 slogan),
 *   恒 200 不抛 500
 * - metadata 接线: /transparency 页 openGraph/twitter images 指向本 route
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, buildTransparencyOgContent } from '../route';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';

vi.mock('@/lib/transparency-weekly-server', () => ({
  loadTransparencyWeekly: vi.fn(),
}));

vi.mock('next/og', () => ({
  ImageResponse: vi.fn(function ImageResponseMock(_element, init) {
    return new Response('mock-image', {
      headers: { 'content-type': `image/${init?.format ?? 'png'}` },
    });
  }),
}));

const FIXTURE: TransparencySnapshot = {
  weekStart: '2026-09-14T00:00:00.000Z',
  weekEnd: '2026-09-18T12:00:00.000Z',
  intercepts: { week: 7, total: 42 },
  savedUsd: { week: 120, total: 960 },
  hoursWon: { week: 4.8, total: 38.4 },
  co2SavedKg: { week: 16.8, total: 134.4 }, // batch82-b 快照契约字段; OG 卡面按红线不展示碳数值
  lastWeek: { intercepts: 5, savedUsd: 100, hoursWon: 4, co2SavedKg: 14 },
  guards: 13,
  generatedAt: '2026-09-18T12:00:00.000Z',
  degraded: false,
};

function request(locale = 'zh') {
  return new NextRequest(`http://symy.test/${locale}/transparency/og`, { method: 'GET' });
}

function context(locale = 'zh') {
  return { params: Promise.resolve({ locale }) };
}

/** 卡面公开指标标签 (与 route copy.stats 同源的真实词典词) */
const FIXTURE_LABELS = {
  zh: { interceptsLabel: '拦截次数', hoursLabel: '赢回小时', guardsLabel: '守护者' },
  en: { interceptsLabel: 'Intercepts', hoursLabel: 'Hours won back', guardsLabel: 'Guardians' },
} as const;

beforeEach(() => {
  vi.mocked(ImageResponse).mockClear();
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockReset();
});

describe('transparency og — weekly card', () => {
  it('renders share-safe platform metrics with the week label and brand', () => {
    for (const locale of ['zh', 'en'] as const) {
      const element = buildTransparencyOgContent(locale, FIXTURE);
      const serialized = JSON.stringify(element);

      expect(serialized).toContain('Symy');
      expect(serialized).toContain('2026-09-14');
      expect(serialized).toContain('7');
      expect(serialized).toContain('4.8');
      expect(serialized).toContain('13');
      for (const key of ['interceptsLabel', 'hoursLabel', 'guardsLabel'] as const) {
        expect(serialized).toContain(FIXTURE_LABELS[locale][key]);
      }
      expect(serialized).not.toContain('$');
      expect(serialized).not.toContain('120');
      expect(serialized).not.toContain('16.8');
    }
  });

  it('serves 200 image/* from mocked aggregate data', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(FIXTURE);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(loadTransparencyWeekly).toHaveBeenCalledTimes(1);
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });
});

describe('transparency og — fallback', () => {
  it('renders the static skeleton (brand + content-engine slogan) with zero metrics', () => {
    const serialized = JSON.stringify(buildTransparencyOgContent('zh', null));

    expect(serialized).toContain('Symy');
    expect(serialized).toContain('透明就是我们的内容引擎');
    expect(serialized).not.toContain('$');
    expect(serialized).not.toContain('2026-09-14');
    // 骨架卡无指标自然无环比行
    expect(serialized).not.toContain('较上周');
  });

  it('keeps serving 200 image/* when the loader rejects', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });
});

describe('transparency og — trend lines (batch104-c)', () => {
  it('renders up-trend lines on the two week tiles only (intercepts + hours), delta without any amount', () => {
    for (const locale of ['zh', 'en'] as const) {
      const serialized = JSON.stringify(buildTransparencyOgContent(locale, FIXTURE));
      const expected = {
        zh: { intercepts: '↑ 较上周 +2', hours: '↑ 较上周 +0.8' },
        en: { intercepts: '↑ +2 vs last week', hours: '↑ +0.8 vs last week' },
      }[locale];
      expect(serialized).toContain(expected.intercepts);
      expect(serialized).toContain(expected.hours);
    }
  });

  it('renders down and flat trend lines with the same calm compact form', () => {
    const downFlat: TransparencySnapshot = {
      ...FIXTURE,
      lastWeek: { intercepts: 9, savedUsd: 100, hoursWon: 4.8, co2SavedKg: 14 },
    };
    for (const locale of ['zh', 'en'] as const) {
      const serialized = JSON.stringify(buildTransparencyOgContent(locale, downFlat));
      const expected = {
        zh: { intercepts: '↓ 较上周 -2', hours: '→ 与上周持平' },
        en: { intercepts: '↓ -2 vs last week', hours: '→ Level with last week' },
      }[locale];
      expect(serialized).toContain(expected.intercepts);
      expect(serialized).toContain(expected.hours);
    }
  });

  it('renders no trend line when there is no last-week baseline (neutral)', () => {
    const neutral: TransparencySnapshot = { ...FIXTURE, lastWeek: null };
    const serialized = JSON.stringify(buildTransparencyOgContent('zh', neutral));

    expect(serialized).not.toContain('较上周');
    expect(serialized).not.toContain('vs last week');
    // 指标本身照常可见
    expect(serialized).toContain('7');
    expect(serialized).toContain('4.8');
  });
});

describe('transparency og — metadata wiring', () => {
  it('keeps the /transparency page OG/Twitter images pointed at this route', async () => {
    const page = await readFile(
      path.resolve(__dirname, '../../page.tsx'),
      'utf8'
    );

    expect(page).toContain('openGraph');
    expect(page).toContain('twitter');
    expect(page).toContain('/${locale}/transparency/og');
  });
});
