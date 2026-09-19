/**
 * Tests for TransparencyShareButton (batch82-a)
 *
 * - 渲染 + 点击行为: 复制文案 (拦截/小时 + 链接) + 打开 x.com/intent/tweet
 * - 剪贴板拒权不阻断 intent 打开
 * - i18n: zh/en 真实词典驱动, 键双侧对称非空; 组件零 defaultValue
 * - 文案纪律: share 文案无 FOMO 词 (仅剩/最后/限时/hurry/last chance...)
 */

// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useTranslations } from 'next-intl';

import { TransparencyShareButton } from '../share-button';

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
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
  return (key: string, values?: Record<string, string | number>): string => {
    const raw = dict[key] ?? key;
    if (!values) return raw;
    return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
  };
}

const PROPS = { intercepts: '7', hoursWon: '4.8' };

const writeText = vi.fn<(text: string) => Promise<void>>();
let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  writeText.mockResolvedValue(undefined);
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  openSpy.mockRestore();
});

function renderButton(dict: Record<string, string>) {
  (useTranslations as ReturnType<typeof vi.fn>).mockReturnValue(makeT(dict));
  return render(<TransparencyShareButton {...PROPS} />);
}

describe('transparency share button — zh', () => {
  it('copies the weekly numbers + link and opens the X intent', async () => {
    const { unmount } = renderButton(flat(zhMsgs));

    expect(screen.getByTestId('transparency-share').textContent).toBe('分享到 X');
    fireEvent.click(screen.getByTestId('transparency-share'));

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));

    const [intentUrl, target, features] = openSpy.mock.calls[0] as unknown as [string, string, string];
    const parsed = new URL(intentUrl);
    expect(`${parsed.protocol}//${parsed.host}${parsed.pathname}`).toBe('https://x.com/intent/tweet');
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');

    const pageUrl = `${window.location.origin}/transparency`;
    expect(parsed.searchParams.get('url')).toBe(pageUrl);
    const text = parsed.searchParams.get('text') ?? '';
    for (const num of ['7', '4.8']) expect(text).toContain(num);
    expect(text).toBe(
      makeT(flat(zhMsgs))('transparency.shareText', { intercepts: '7', hours: '4.8' }),
    );

    expect(writeText).toHaveBeenCalledWith(`${text}\n${pageUrl}`);
    unmount();
  });

  it('flips to the copied label once the clipboard write resolves', async () => {
    const { unmount } = renderButton(flat(zhMsgs));

    fireEvent.click(screen.getByTestId('transparency-share'));
    await waitFor(() =>
      expect(screen.getByTestId('transparency-share').textContent).toBe('文案已复制，发布时请保留链接'),
    );
    unmount();
  });
});

describe('transparency share button — clipboard denied', () => {
  it('still opens the X intent when the clipboard write rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { unmount } = renderButton(flat(enMsgs));

    fireEvent.click(screen.getByTestId('transparency-share'));

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy.mock.calls[0]?.[0]).toContain('https://x.com/intent/tweet?text=');
    unmount();
  });
});

describe('transparency share copy — discipline', () => {
  it('has symmetric non-empty share keys in both locales', () => {
    for (const key of ['transparency.shareButton', 'transparency.shareCopied', 'transparency.shareText']) {
      expect(zhMsgs.transparency[key.split('.')[1]]).toBeTruthy();
      expect(enMsgs.transparency[key.split('.')[1]]).toBeTruthy();
    }
  });

  it('never uses defaultValue for the share keys in the component', () => {
    const source = readFileSync('src/app/[locale]/transparency/share-button.tsx', 'utf-8');
    expect(source).not.toContain('defaultValue');
  });

  it.each([
    ['zh', zhMsgs],
    ['en', enMsgs],
  ])('keeps %s share copy free of FOMO phrasing', (_locale, msgs) => {
    const fomo = /仅剩|最后|限时|限量|马上抢|错过再|倒计时|hurry|last chance|only \d+ left|running out|don'?t miss|act now/i;
    const texts = [
      msgs.transparency.shareButton,
      msgs.transparency.shareCopied,
      String(msgs.transparency.shareText).replaceAll('{intercepts}', '7').replaceAll('{hours}', '4.8'),
    ];
    for (const text of texts) expect(text).not.toMatch(fomo);
  });

  it.each([
    ['zh', zhMsgs],
    ['en', enMsgs],
  ])('keeps %s share copy free of money amounts', (_locale, msgs) => {
    const text = String(msgs.transparency.shareText)
      .replaceAll('{intercepts}', '7')
      .replaceAll('{hours}', '4.8');

    expect(text).not.toMatch(/[$¥€£]/);
    expect(text).not.toContain('saved');
  });
});
