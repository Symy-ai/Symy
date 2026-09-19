/**
 * Tests for TransparencyPostCopyButton (batch89-a)
 *
 * - 渲染: 真实生产词典驱动 — 按钮/语言标签/双选项; 默认语言跟随 useLocale
 * - 复制交互: writeText payload === buildWeeklyPostCopy 真函数产物 (真契约);
 *   下拉切 en 后 payload 跟随; 剪贴板拒权不亮胶囊不抛错
 * - 成功胶囊: 复制成功出现, 1.5s 后消失 (fake timers)
 * - i18n: postCopy* 五键 zh/en 对称非空; 组件零 defaultValue / 零金额引用
 * - 文案纪律: postCopy* 键与复制产物均无 FOMO 词、零货币符号
 */

// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useTranslations, useLocale } from 'next-intl';

import { TransparencyPostCopyButton } from '../post-copy-button';
import { buildWeeklyPostCopy } from '@/lib/transparency-post-copy';

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

/** 纯函数入参用快照形 (intercepts/hoursWon 双桶), 组件 props 用原始数 — 两不相混 */
const SNAPSHOT = {
  intercepts: { week: 7, total: 42 },
  hoursWon: { week: 4.8, total: 38.4 },
  guards: 13,
};
const PROPS = { intercepts: 7, hoursWon: 4.8, guards: 13 };
const POST_COPY_KEYS = [
  'postCopyLangLabel',
  'postCopyLangZh',
  'postCopyLangEn',
  'postCopyButton',
  'postCopyCopied',
];
const FOMO = /仅剩|最后|限时|限量|马上抢|错过再|倒计时|hurry|last chance|only \d+ left|running out|don'?t miss|act now/i;

const writeText = vi.fn<(text: string) => Promise<void>>();

function renderButton(dict: Record<string, string>, locale: 'zh' | 'en') {
  (useTranslations as ReturnType<typeof vi.fn>).mockReturnValue(makeT(flat(dict)));
  (useLocale as ReturnType<typeof vi.fn>).mockReturnValue(locale);
  return render(<TransparencyPostCopyButton {...PROPS} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  writeText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('transparency post-copy button — render', () => {
  it('renders zh labels from the real dictionary with locale default zh', () => {
    const { unmount } = renderButton(zhMsgs, 'zh');

    expect(screen.getByTestId('transparency-post-copy-button').textContent).toBe('复制发帖文案');
    expect(screen.getByTestId('transparency-post-copy').textContent).toContain('发帖语言');
    const select = screen.getByTestId('transparency-post-copy-lang') as HTMLSelectElement;
    expect(select.value).toBe('zh');
    expect(select.textContent).toContain('中文');
    expect(select.textContent).toContain('英文');
    // 未复制前成功胶囊不存在
    expect(screen.queryByTestId('transparency-post-copy-copied')).toBeNull();
    unmount();
  });

  it('defaults to en when the page locale is en', () => {
    const { unmount } = renderButton(enMsgs, 'en');

    expect(screen.getByTestId('transparency-post-copy-button').textContent).toBe('Copy post text');
    expect((screen.getByTestId('transparency-post-copy-lang') as HTMLSelectElement).value).toBe('en');
    unmount();
  });
});

describe('transparency post-copy button — copy interaction', () => {
  it('copies the real buildWeeklyPostCopy payload for the selected language', async () => {
    const { unmount } = renderButton(zhMsgs, 'zh');

    fireEvent.click(screen.getByTestId('transparency-post-copy-button'));
    await act(async () => {});

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      buildWeeklyPostCopy(SNAPSHOT, 'zh'),
    );
    unmount();
  });

  it('follows the dropdown to en after the user switches language', async () => {
    const { unmount } = renderButton(zhMsgs, 'zh');

    fireEvent.change(screen.getByTestId('transparency-post-copy-lang'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByTestId('transparency-post-copy-button'));
    await act(async () => {});

    expect(writeText).toHaveBeenCalledWith(buildWeeklyPostCopy(SNAPSHOT, 'en'));
    unmount();
  });

  it('shows the success capsule and clears it after 1.5s', async () => {
    vi.useFakeTimers();
    const { unmount } = renderButton(zhMsgs, 'zh');

    fireEvent.click(screen.getByTestId('transparency-post-copy-button'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('transparency-post-copy-copied').textContent).toBe('已复制，去 X 粘贴发布');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.queryByTestId('transparency-post-copy-copied')).toBeNull();
    unmount();
  });

  it('shows no capsule and throws nothing when the clipboard is denied', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { unmount } = renderButton(enMsgs, 'en');

    fireEvent.click(screen.getByTestId('transparency-post-copy-button'));
    await act(async () => {});

    expect(screen.queryByTestId('transparency-post-copy-copied')).toBeNull();
    unmount();
  });
});

describe('transparency post-copy — discipline', () => {
  it('has symmetric non-empty postCopy* keys in both locales', () => {
    for (const key of POST_COPY_KEYS) {
      expect(String(zhMsgs.transparency[key])).toBeTruthy();
      expect(String(enMsgs.transparency[key])).toBeTruthy();
    }
  });

  it('never uses defaultValue and never references amounts in the component source', () => {
    const source = readFileSync('src/app/[locale]/transparency/post-copy-button.tsx', 'utf-8');
    expect(source).not.toContain('defaultValue');
    expect(source).not.toContain('savedUsd');
    expect(source).not.toMatch(/[$¥€£]/);
  });

  it.each([
    ['zh', zhMsgs],
    ['en', enMsgs],
  ])('keeps %s postCopy* UI copy free of FOMO phrasing', (_locale, msgs) => {
    for (const key of POST_COPY_KEYS) {
      expect(String(msgs.transparency[key])).not.toMatch(FOMO);
    }
  });

  it('keeps the actual clipboard payload money-free in both languages', async () => {
    const { unmount } = renderButton(zhMsgs, 'zh');

    for (const lang of ['zh', 'en'] as const) {
      fireEvent.change(screen.getByTestId('transparency-post-copy-lang'), {
        target: { value: lang },
      });
      fireEvent.click(screen.getByTestId('transparency-post-copy-button'));
    }
    await act(async () => {});

    const payloads = writeText.mock.calls.map((c) => c[0] as string);
    expect(payloads).toHaveLength(2);
    for (const text of payloads) {
      expect(text).not.toMatch(/[$¥€£]/);
      expect(text).not.toMatch(FOMO);
    }
    unmount();
  });
});
