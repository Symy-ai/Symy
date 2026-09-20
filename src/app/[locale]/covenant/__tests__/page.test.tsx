// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('@/lib/transparency-weekly-server', () => ({
  loadTransparencyWeekly: vi.fn(),
}));

import CovenantPage from '../page';
import { getTranslations } from 'next-intl/server';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';
import type { TransparencySnapshot } from '@/lib/transparency-weekly';

const zhMessages = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf8'));
const enMessages = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf8'));

const snapshot = {
  hoursWon: { total: 1_936 },
  guards: 1_234,
} as unknown as TransparencySnapshot;

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object') {
      Object.assign(result, flatten(entry as Record<string, unknown>, path));
    } else {
      result[path] = String(entry);
    }
  }
  return result;
}

function makeT(messages: Record<string, string>) {
  return (key: string, values?: Record<string, string | number>) => {
    let text = messages[key] ?? key;
    for (const [token, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${token}}`, String(value));
    }
    return text;
  };
}

async function renderPage(locale: 'zh' | 'en') {
  const page = await CovenantPage({ params: Promise.resolve({ locale }) });
  return render(page);
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);
});

describe('/covenant page', () => {
  it('renders the three covenant articles in both locales', async () => {
    for (const [locale, messages] of [
      ['zh', zhMessages],
      ['en', enMessages],
    ] as const) {
      (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flatten(messages)));
      const { unmount } = await renderPage(locale);

      expect(screen.getByTestId('covenant-article-explore').textContent).toContain(
        messages.covenant.articles.explore,
      );
      expect(screen.getByTestId('covenant-article-conserve').textContent).toContain(
        messages.covenant.articles.conserve,
      );
      expect(screen.getByTestId('covenant-article-selfRestraint').textContent).toContain(
        messages.covenant.articles.selfRestraint,
      );
      unmount();
    }
  });

  it('renders collective hours from the existing aggregate snapshot', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flatten(enMessages)));
    await renderPage('en');

    expect(loadTransparencyWeekly).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('covenant-collective-stats').textContent).toContain('1,936 hours');
    expect(screen.getByTestId('covenant-collective-stats').textContent).toContain('1,234 guards');
  });

  it('hides collective numbers without changing the covenant when data is unavailable', async () => {
    (loadTransparencyWeekly as ReturnType<typeof vi.fn>).mockRejectedValue(
      Promise.resolve(new Error('aggregate unavailable')),
    );
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flatten(enMessages)));
    await renderPage('en');

    expect(screen.queryByTestId('covenant-collective-stats')).toBeNull();
    expect(screen.getByTestId('covenant-collective-unavailable').textContent).toBe(
      enMessages.covenant.collectiveUnavailable,
    );
    expect(screen.getByTestId('covenant-article-explore').textContent).toContain(
      enMessages.covenant.articles.explore,
    );
  });

  it('links to the trust page', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flatten(enMessages)));
    await renderPage('en');

    expect(screen.getByTestId('covenant-trust-link').getAttribute('href')).toBe('/en/trust');
  });
});
