import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../en.json';
import zh from '../zh.json';

const forbiddenTerms = [
  '共生',
  '共生实验室',
  'symbiosis',
  'Symbiotic Lab',
  '清华大学',
  'Tsinghua',
];

describe('about narrative guard', () => {
  it.each([['zh', zh.about], ['en', en.about]])(
    'keeps %s about copy free of retired institutional claims',
    (_locale, about) => {
      const serialized = JSON.stringify(about).toLowerCase();

      for (const term of forbiddenTerms) {
        expect(serialized).not.toContain(term.toLowerCase());
      }
    },
  );

  it('keeps blog CTAs on the guardian color palette', async () => {
    const files = [
      'src/app/[locale]/blog/page.tsx',
      'src/app/[locale]/blog/the-prison-of-attachment/page.tsx',
      'src/app/[locale]/blog/algorithm-decode-001/page.tsx',
    ];

    for (const file of files) {
      const source = await readFile(path.resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('from-cyan-500');
    }
  });
});
