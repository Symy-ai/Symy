import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../en.json';
import zh from '../zh.json';

const FORBIDDEN_VALUE_CARD_PATTERN = /复利|compound|159|mirror|魔镜|照见/i;
const FORBIDDEN_PAGE_PATTERN = /valueCards\.mirror|bg-cyan-500|bg-purple-500/;

describe('auth login value cards guard', () => {
  it.each(['zh', 'en'] as const)('keeps %s value cards on the guard narrative', (locale) => {
    const messages = locale === 'zh' ? zh : en;
    const valueCards = messages.auth.login.valueCards;

    expect(Object.keys(valueCards)).not.toContain('mirror');
    expect(JSON.stringify(valueCards)).not.toMatch(FORBIDDEN_VALUE_CARD_PATTERN);
  });

  it('renders value cards without legacy keys and colors', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/[locale]/auth/login/page.tsx'),
      'utf-8',
    );

    expect(page).not.toMatch(FORBIDDEN_PAGE_PATTERN);
  });
});
