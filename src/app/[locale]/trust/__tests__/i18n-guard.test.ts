import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredKeys = [
  'title',
  'subtitle',
  'disclosuresTitle',
  'businessTitle',
  'businessDescription',
  'businessLink',
  'financeTitle',
  'financeDescription',
  'financeLink',
  'governanceTitle',
  'governanceDescription',
  'antiGreenwashingTitle',
  'antiGreenwashingEstimates',
  'antiGreenwashingCaliber',
  'antiGreenwashingNoOffset',
  'neutralityTitle',
  'neutralityAds',
  'neutralityBidding',
  'neutralityPlacement',
] as const;

describe('/trust i18n guard', () => {
  it('keeps all trust copy present on both sides without defaultValue', () => {
    const source = readFileSync('src/app/[locale]/trust/page.tsx', 'utf8');
    expect(source).not.toContain('defaultValue');

    for (const locale of ['zh', 'en'] as const) {
      const trust = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, 'utf8'),
      ).trust as Record<string, unknown>;

      for (const key of requiredKeys) {
        expect(typeof trust[key], `${locale}.trust.${key}`).toBe('string');
        expect(String(trust[key]).trim().length, `${locale}.trust.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
