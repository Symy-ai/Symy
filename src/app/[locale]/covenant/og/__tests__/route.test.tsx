import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCovenantOgContent, GET } from '../route';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';

vi.mock('@/lib/transparency-weekly-server', () => ({
  loadTransparencyWeekly: vi.fn(),
}));

vi.mock('next/og', () => ({
  ImageResponse: vi.fn(function ImageResponseMock(
    _element: unknown,
    init?: { format?: string }
  ): Response {
    return new Response('mock-image', {
        headers: { 'content-type': `image/${init?.format ?? 'png'}` },
      });
  }),
}));

const snapshot = {
  hoursWon: { total: 1_936.5 },
  guards: 1_234,
} as unknown as TransparencySnapshot;

function context(locale = 'zh') {
  return { params: Promise.resolve({ locale }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockReset();
});

describe('covenant og', () => {
  it('renders the covenant template with collective hours and no money', () => {
    for (const locale of ['zh', 'en'] as const) {
      const serialized = JSON.stringify(
        buildCovenantOgContent(locale, { hours: 1_936.5 }),
      );

      expect(serialized).toContain('新契约');
      expect(serialized).toContain('Won back together');
      expect(serialized).toContain('1,937');
      expect(serialized).not.toContain('$');
    }
  });

  it('uses the aggregate source and returns a 1200×630 image', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);

    const response = await GET(new NextRequest('http://symy.test/zh/covenant/og'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(loadTransparencyWeekly).toHaveBeenCalledTimes(1);
    expect(ImageResponse).toHaveBeenCalledWith(expect.anything(), {
      width: 1200,
      height: 630,
    });
  });

  it('keeps the template shareable when the aggregate source fails', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockRejectedValue(
      Promise.resolve(new Error('aggregate unavailable')),
    );

    const response = await GET(new NextRequest('http://symy.test/en/covenant/og'), context('en'));

    expect(response.status).toBe(200);
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });
});
