/**
 * Tests for /[locale]/transparency/og — 周报分享卡 (batch82-a)
 *
 * - 周报卡渲染冒烟: mock 聚合快照 → 四指标 + Week of <weekStart> + 品牌可见
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

/** 卡面四指标标签 (与 route copy.stats 同源的真实词典词) */
const FIXTURE_LABELS = {
  zh: { interceptsLabel: '拦截次数', savedLabel: '为用户省下', hoursLabel: '赢回小时', guardsLabel: '守护者' },
  en: { interceptsLabel: 'Intercepts', savedLabel: 'Saved for users', hoursLabel: 'Hours won back', guardsLabel: 'Guardians' },
} as const;

beforeEach(() => {
  vi.mocked(ImageResponse).mockClear();
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockReset();
});

describe('transparency og — weekly card', () => {
  it('renders the four platform metrics with the week label and brand', () => {
    for (const locale of ['zh', 'en'] as const) {
      const element = buildTransparencyOgContent(locale, FIXTURE);
      const serialized = JSON.stringify(element);

      expect(serialized).toContain('Symy');
      expect(serialized).toContain('2026-09-14');
      expect(serialized).toContain('7');
      expect(serialized).toContain('$120');
      expect(serialized).toContain('4.8');
      expect(serialized).toContain('13');
      for (const key of ['interceptsLabel', 'savedLabel', 'hoursLabel', 'guardsLabel'] as const) {
        expect(serialized).toContain(FIXTURE_LABELS[locale][key]);
      }
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
  });

  it('keeps serving 200 image/* when the loader rejects', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(ImageResponse).toHaveBeenCalledTimes(1);
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
