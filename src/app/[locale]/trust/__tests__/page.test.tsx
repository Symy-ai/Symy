/**
 * Tests for /trust — 三重公开整合入口 (batch105-a)
 */

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}));

import TrustPage from '../page';
import { getTranslations } from 'next-intl/server';

const zhMessages = JSON.parse(readFileSync('src/i18n/messages/zh.json', 'utf8'));
const enMessages = JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf8'));

function flat(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object') {
      Object.assign(result, flat(entry as Record<string, unknown>, path));
    } else {
      result[path] = String(entry);
    }
  }
  return result;
}

function makeT(messages: Record<string, string>) {
  return (key: string): string => messages[key] ?? key;
}

async function renderPage(locale: 'zh' | 'en') {
  const page = await TrustPage({ params: Promise.resolve({ locale }) });
  return render(page);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/trust page', () => {
  it('renders three disclosures in zh and en', async () => {
    for (const [locale, messages, expectedTitle] of [
      ['zh', zhMessages, '信任'],
      ['en', enMessages, 'Trust'],
    ] as const) {
      (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(messages)));
      const { unmount } = await renderPage(locale);

      expect(screen.getByTestId('trust-title').textContent).toBe(expectedTitle);
      expect(screen.getByTestId('trust-disclosure-business').textContent).toContain(
        messages.trust.businessTitle,
      );
      expect(screen.getByTestId('trust-disclosure-finance').textContent).toContain(
        messages.trust.financeTitle,
      );
      expect(screen.getByTestId('trust-disclosure-governance').textContent).toContain(
        messages.trust.governanceTitle,
      );
      unmount();
    }
  });

  it('links business and finance disclosures to locale-prefixed routes', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(enMessages)));
    await renderPage('en');

    expect(screen.getByTestId('trust-disclosure-business-link').getAttribute('href')).toBe(
      '/en/transparency',
    );
    expect(screen.getByTestId('trust-disclosure-finance-link').getAttribute('href')).toBe(
      '/en/transparency/finance',
    );
  });

  it('indexes governance documents without copying them into the site', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(zhMessages)));
    await renderPage('zh');

    const documents = screen.getByTestId('trust-governance-documents').querySelectorAll('a');
    expect(documents).toHaveLength(6);
    documents.forEach((link) => {
      expect(link.getAttribute('href')).toContain(
        'https://github.com/Symy-ai/Symy/tree/main/doc/symy-lab/',
      );
      expect(link.getAttribute('target')).toBe('_blank');
    });
  });

  it('renders three anti-greenwashing principles and three neutrality lines', async () => {
    (getTranslations as ReturnType<typeof vi.fn>).mockResolvedValue(makeT(flat(enMessages)));
    await renderPage('en');

    const principles = [
      'trust-anti-greenwashing-estimates',
      'trust-anti-greenwashing-caliber',
      'trust-anti-greenwashing-no-offset',
    ].map((testId) => screen.getByTestId(testId).textContent);
    const neutrality = [
      'trust-neutrality-ads',
      'trust-neutrality-bidding',
      'trust-neutrality-placement',
    ].map((testId) => screen.getByTestId(testId).textContent);

    expect(principles).toEqual([
      enMessages.trust.antiGreenwashingEstimates,
      enMessages.trust.antiGreenwashingCaliber,
      enMessages.trust.antiGreenwashingNoOffset,
    ]);
    expect(neutrality).toEqual([
      enMessages.trust.neutralityAds,
      enMessages.trust.neutralityBidding,
      enMessages.trust.neutralityPlacement,
    ]);
  });
});
