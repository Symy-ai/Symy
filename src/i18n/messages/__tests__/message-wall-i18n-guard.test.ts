import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

const BANNER_SOURCE = join(
  process.cwd(),
  'src/components/buddy/proactive-message-banner.tsx',
);

describe('message wall i18n (batch73-c)', () => {
  it('defines the mark-as-read + NEW badge keys in both dictionaries', () => {
    expect(zh.buddy.proactiveMessagesMarkRead).toBe('标为已读');
    expect(en.buddy.proactiveMessagesMarkRead).toBe('Mark as read');
    expect(zh.buddy.proactiveMessagesNewBadge).toBe('新');
    expect(en.buddy.proactiveMessagesNewBadge).toBe('NEW');
  });

  it('keeps the banner source free of hardcoded English wall strings', () => {
    const source = readFileSync(BANNER_SOURCE, 'utf8');
    expect(source).not.toContain("'Mark as read'");
    expect(source).not.toContain('>NEW<');
  });
});
