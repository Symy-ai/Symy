import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/messages/en.json';
import zh from '../../i18n/messages/zh.json';

describe('aha first screen green guard', () => {
  it('removes the legacy cyan-purple CTA language', () => {
    for (const file of [
      'src/components/aha-moment-onboarding.tsx',
      'src/components/landing-page.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source, file).not.toContain('from-cyan-500');
      expect(source, file).not.toContain('to-purple-500');
    }
  });

  it('mirrors green preset names and emojis in both locales', () => {
    for (const messages of [zh.ahaMoment, en.ahaMoment]) {
      for (const preset of ['phone', 'sneakers', 'coffee']) {
        const copy = messages.presets[preset as keyof typeof messages.presets];

        expect(copy.name.trim()).not.toBe('');
        expect(copy.emoji.trim()).not.toBe('');
      }
    }
  });

  it('keeps freedom hours in the passed-result copy', () => {
    expect(zh.ahaMoment.resultPassed).toContain('{hours}');
    expect(en.ahaMoment.resultPassed).toContain('{hours}');
    expect(zh.ahaMoment.presets.phone.name).not.toMatch(/[A-Za-z]/);
  });
});
