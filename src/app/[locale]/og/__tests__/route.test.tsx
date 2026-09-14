import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, buildOgContent } from '../route';

function request(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

function context(locale = 'zh') {
  return { params: Promise.resolve({ locale }) };
}

function responseFor(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  return GET(request('http://symy.test/zh/og?ref=TEST'), context());
}

beforeEach(() => {
  vi.mocked(ImageResponse).mockClear();
  vi.unstubAllGlobals();
  vi.spyOn(globalThis, 'fetch');
});

vi.mock('next/og', () => ({
  ImageResponse: vi.fn(function ImageResponseMock(_element, init) {
    return new Response('mock-image', {
      headers: { 'content-type': `image/${init?.format ?? 'png'}` },
    });
  }),
}));

describe('/[locale]/og', () => {
  it('renders the brand card when no ref is present', async () => {
    const response = await GET(request('http://symy.test/zh/og'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });

  it('renders stats copy and values for a found referral', async () => {
    const element = buildOgContent('zh', {
      found: true,
      displayName: 'Avery',
      intercepts: 37,
      guardDays: 12,
      freedomHours: 10.5,
    });

    expect(JSON.stringify(element)).toContain('Avery');
    expect(JSON.stringify(element)).toContain('37');
    expect(JSON.stringify(element)).toContain('12');
    expect(JSON.stringify(element)).toContain('10.5');
    expect(JSON.stringify(element)).toContain('拦截次数');
    expect(JSON.stringify(element)).toContain('守护天数');
    expect(JSON.stringify(element)).toContain('赢回小时');

    const fetchStats = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            found: true,
            displayName: 'Avery',
            intercepts: 37,
            guardDays: 12,
            freedomHours: 10.5,
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      ) as unknown as ReturnType<typeof Promise.resolve<Response>>
    );
    await responseFor(fetchStats as unknown as typeof fetch);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('http://symy.test/api/invite/public-stats?ref=TEST'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing referral', () => Promise.resolve(new Response(JSON.stringify({ found: false })))],
    ['fetch rejection', () => Promise.reject(new Error('network down'))],
    [
      'fetch timeout',
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          return;
        }),
    ],
  ])('falls back to the brand card on %s', async (_name, fetchImpl) => {
    const response = await responseFor(fetchImpl as unknown as typeof fetch);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^image\//);
    expect(ImageResponse).toHaveBeenCalledTimes(1);
  });

  it('keeps landing and twitter metadata wired to the OG route', async () => {
    const landing = await readFile(
      path.resolve(__dirname, '../../landing/page.tsx'),
      'utf8'
    );
    const layout = await readFile(
      path.resolve(__dirname, '../../layout.tsx'),
      'utf8'
    );

    expect(landing).toContain('openGraph');
    expect(landing).toContain('/${locale}/og');
    expect(landing).toContain('searchParams');
    expect(layout).toContain('twitter');
    expect(layout).toContain('/${locale}/og');
    expect(layout).not.toContain('/icon-1024.png');
  });
});
