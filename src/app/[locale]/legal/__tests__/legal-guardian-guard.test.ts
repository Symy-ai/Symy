import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const legalPages = [
  'src/app/[locale]/legal/privacy/page.tsx',
  'src/app/[locale]/legal/terms/page.tsx',
] as const;

const pageMarkers: Record<string, string[]> = {
  'src/app/[locale]/legal/privacy/page.tsx': [
    '被同一双手守护',
    'guarded by the same hands',
    '认识小象 Symy',
    'Meet Symy',
  ],
  'src/app/[locale]/legal/terms/page.tsx': [
    '只对你负责',
    'answers to you',
    '认识小象 Symy',
    'Meet Symy',
  ],
};

describe('legal guardian guard', () => {
  it('keeps both legal pages on the guardian narrative', async () => {
    for (const file of legalPages) {
      const source = await readFile(path.resolve(process.cwd(), file), 'utf8');

      for (const marker of pageMarkers[file]) {
        expect(source, `${file}: ${marker}`).toContain(marker);
      }
      expect(source, file).toContain('无利益关系');
      expect(source, file).toContain('no financial ties');
      expect(source, file).toContain('href={`/${locale}`}');
    }
  });

  it('keeps legal links and borders off cyan', async () => {
    for (const file of legalPages) {
      const source = await readFile(path.resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/\bcyan-/);
    }
  });

  it('preserves the Symbiotic Lab intellectual-property clause', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'src/app/[locale]/legal/terms/page.tsx'),
      'utf8',
    );

    expect(source).toContain('归 Symbiotic Lab 所有');
    expect(source).toContain('owned by Symbiotic Lab');
  });
});
