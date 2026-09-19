/**
 * Tests for TransparencySubscribeForm (batch84-c)
 *
 * - 渲染: zh/en 真实词典驱动, 邮箱空时按钮禁用, 输入后启用
 * - 成功态: POST /api/transparency/subscribe 携 { email, locale } → 1.5s 胶囊
 *   后自动消失回到表单态 (fake timers)
 * - 降级: 503 → 「订阅即将上线」替换表单; 网络失败 → 通用错误行
 * - i18n 纪律: subscribe* 键双侧对称非空; 组件零 defaultValue
 */

// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useLocale, useTranslations } from 'next-intl';

import { TransparencySubscribeForm } from '../subscribe-form';

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
  useLocale: vi.fn(),
}));

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

const fetchMock = vi.fn<typeof fetch>();

function renderForm(locale: 'zh' | 'en') {
  const dict = flat(locale === 'zh' ? zhMsgs : enMsgs);
  (useTranslations as ReturnType<typeof vi.fn>).mockReturnValue(makeT(dict));
  (useLocale as ReturnType<typeof vi.fn>).mockReturnValue(locale);
  return render(<TransparencySubscribeForm />);
}

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByTestId('transparency-subscribe-input'), {
    target: { value: email },
  });
  fireEvent.click(screen.getByTestId('transparency-subscribe-button'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('transparency subscribe form — rendering', () => {
  it.each([
    ['zh', '订阅每周透明度报告', '订阅'],
    ['en', 'Subscribe to the weekly transparency report', 'Subscribe'],
  ])('renders %s labels from the real dictionary', (locale, title, button) => {
    const { unmount } = renderForm(locale as 'zh' | 'en');
    expect(screen.getByTestId('transparency-subscribe-title').textContent).toBe(title);
    expect(screen.getByTestId('transparency-subscribe-button').textContent).toBe(button);
    unmount();
  });

  it('keeps the submit button disabled until an email is typed', () => {
    const { unmount } = renderForm('zh');
    const button = screen.getByTestId('transparency-subscribe-button');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('transparency-subscribe-input'), {
      target: { value: 'a@example.com' },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    unmount();
  });
});

describe('transparency subscribe form — success capsule (1.5s)', () => {
  it('posts email + locale, shows the capsule, clears the input, then fades back', async () => {
    vi.useFakeTimers();
    const { unmount } = renderForm('zh');

    fillAndSubmit('Reader@Example.com');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/transparency/subscribe');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'Reader@Example.com', locale: 'zh' });

    expect(screen.getByTestId('transparency-subscribe-success').textContent).toBe('已订阅，下周见');
    expect((screen.getByTestId('transparency-subscribe-input') as HTMLInputElement).value).toBe('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.queryByTestId('transparency-subscribe-success')).toBeNull();
    unmount();
  });

  it('shows the same success capsule when the route silently dedupes (anti-enumeration)', async () => {
    vi.useFakeTimers();
    const { unmount } = renderForm('en');

    fillAndSubmit('dupe@example.com');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('transparency-subscribe-success')).toBeTruthy();
    unmount();
  });
});

describe('transparency subscribe form — degradation', () => {
  it('swaps the form for the "coming soon" note on 503', async () => {
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    const { unmount } = renderForm('zh');

    fillAndSubmit('a@example.com');
    await act(async () => {});

    expect(screen.getByTestId('transparency-subscribe-unavailable').textContent).toBe('订阅即将上线');
    expect(screen.queryByTestId('transparency-subscribe-input')).toBeNull();
    unmount();
  });

  it('shows the generic error line when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { unmount } = renderForm('en');

    fillAndSubmit('a@example.com');
    await act(async () => {});

    expect(screen.getByTestId('transparency-subscribe-error').textContent).toBe(
      'Subscription failed, please try again later',
    );
    unmount();
  });
});

describe('transparency subscribe copy — discipline', () => {
  const KEYS = [
    'subscribeTitle',
    'subscribeNote',
    'subscribePlaceholder',
    'subscribeButton',
    'subscribeSuccess',
    'subscribeUnavailable',
    'subscribeError',
  ];

  it('has symmetric non-empty subscribe keys in both locales', () => {
    for (const key of KEYS) {
      expect(String(zhMsgs.transparency[key])).toBeTruthy();
      expect(String(enMsgs.transparency[key])).toBeTruthy();
    }
  });

  it('never uses fallback copy in the component', () => {
    const source = readFileSync('src/app/[locale]/transparency/subscribe-form.tsx', 'utf-8');
    expect(source).not.toMatch(/defaultValue/);
  });
});
