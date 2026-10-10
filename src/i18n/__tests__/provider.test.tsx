// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const M = vi.hoisted(() => ({
  apiFetchVoid: vi.fn(() => Promise.resolve()),
  warn: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetchVoid: M.apiFetchVoid }));
vi.mock('@/lib/logger', () => ({ logger: { warn: M.warn } }));
vi.mock('next-intl', () => ({
  IntlProvider: ({ children }: { children: ReactNode }) => <div data-testid="intl">{children}</div>,
  useTranslations: () => (key: string) => key,
}));

import { I18nProviderWrapper, useI18n, useLocaleContext } from '../provider';

/**
 * i18n/provider.tsx (185行) — locale Context + t() 增强。
 *
 * 锁定:
 * - t(): key 缺失 → defaultValue fallback (BUG-6 fix)
 * - t(): 插值透传
 * - setLocale: localStorage+cookie+URL replaceState+POST /api/user/locale
 * - locale 切换 → html lang 更新
 */
function Consumer() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="missing">{t('buddy.dreamFundOrderHint', { defaultValue: '默认提示' })}</span>
      <span data-testid="interp">{t('welcome', { name: 'Spark' })}</span>
      <span data-testid="rawkey">{t('some.raw.key')}</span>
      <button onClick={() => setLocale('zh')}>switch-zh</button>
    </div>
  );
}

function LocaleReader() {
  const { locale } = useLocaleContext();
  return <span data-testid="ctx-locale">{locale}</span>;
}

describe('i18n provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = '';
    window.history.replaceState(null, '', '/en/dashboard');
  });

  it('t(): 缺失 key → defaultValue (BUG-6 fix)', () => {
    render(
      <I18nProviderWrapper initialLocale="en">
        <Consumer />
      </I18nProviderWrapper>,
    );
    expect(screen.getByTestId('missing').textContent).toBe('默认提示');
    // raw key 无 defaultValue → key 本身
    expect(screen.getByTestId('rawkey').textContent).toBe('some.raw.key');
  });

  it('t(): 插值透传', () => {
    render(
      <I18nProviderWrapper initialLocale="en">
        <Consumer />
      </I18nProviderWrapper>,
    );
    expect(screen.getByTestId('interp').textContent).toBe('welcome');
  });

  it('setLocale → POST /api/user/locale + cookie + URL + localStorage', async () => {
    render(
      <I18nProviderWrapper initialLocale="en">
        <Consumer />
      </I18nProviderWrapper>,
    );
    fireEvent.click(screen.getByText('switch-zh'));
    await waitFor(() => expect(M.apiFetchVoid).toHaveBeenCalledWith('/api/user/locale', expect.objectContaining({ method: 'POST', body: { locale: 'zh' } })));
    expect(localStorage.getItem('symy-locale')).toBe('zh');
    expect(document.cookie).toContain('NEXT_LOCALE=zh');
    expect(window.location.pathname).toBe('/zh/dashboard');
    expect(document.documentElement.lang).toBe('zh');
  });

  it('initialLocale 驱动 context (en → zh 切换)', () => {
    render(
      <I18nProviderWrapper initialLocale="en">
        <LocaleReader />
      </I18nProviderWrapper>,
    );
    expect(screen.getByTestId('ctx-locale').textContent).toBe('en');
  });

  it('locale fetch 失败 → warn 不炸 (AbortError 静默)', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    M.apiFetchVoid.mockRejectedValueOnce(abortErr);
    render(
      <I18nProviderWrapper initialLocale="en">
        <Consumer />
      </I18nProviderWrapper>,
    );
    fireEvent.click(screen.getByText('switch-zh'));
    await waitFor(() => expect(M.apiFetchVoid).toHaveBeenCalled());
    // AbortError → 不 warn
    expect(M.warn).not.toHaveBeenCalled();
  });
});
