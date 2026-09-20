import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredKeys = [
  'title',
  'subtitle',
  'articlesTitle',
  'articleNumber',
  'reasonsTitle',
  'collectiveTitle',
  'wonBackTogether',
  'collectiveUnavailable',
  'trustLink',
] as const;

const requiredArticleKeys = ['explore', 'conserve', 'selfRestraint'] as const;
const requiredReasonKeys = ['incentives', 'visibility', 'practice'] as const;

describe('/covenant i18n guard', () => {
  it('keeps all covenant copy present on both sides without defaultValue', () => {
    const source = readFileSync('src/app/[locale]/covenant/page.tsx', 'utf8');
    expect(source).not.toContain('defaultValue');

    for (const locale of ['zh', 'en'] as const) {
      const covenant = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, 'utf8'),
      ).covenant as Record<string, unknown>;

      for (const key of requiredKeys) {
        expect(typeof covenant[key], `${locale}.covenant.${key}`).toBe('string');
        expect(String(covenant[key]).trim().length, `${locale}.covenant.${key}`).toBeGreaterThan(0);
      }

      const articles = covenant.articles as Record<string, unknown>;
      const reasons = covenant.reasons as Record<string, unknown>;
      for (const key of [...requiredArticleKeys, ...requiredReasonKeys]) {
        const owner = requiredArticleKeys.includes(key as never) ? articles : reasons;
        expect(typeof owner[key], `${locale}.covenant.${key}`).toBe('string');
        expect(String(owner[key]).trim().length, `${locale}.covenant.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps covenant copy calm and non-marketing', () => {
    for (const locale of ['zh', 'en'] as const) {
      const covenant = JSON.parse(
        readFileSync(`src/i18n/messages/${locale}.json`, 'utf8'),
      ).covenant as Record<string, unknown>;
      expect(JSON.stringify(covenant)).not.toMatch(/限时|立抢|独家/);
    }
    expect(readFileSync('src/app/[locale]/covenant/page.tsx', 'utf8')).not.toMatch(
      /限时|立抢|独家/,
    );
  });
});
