// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

const REST_KEYS = [
  'buddy.spendingWearingDown',
  'buddy.impulseHurting',
  'buddy.healthStatus.weak',
  'buddy.healthStatus.critical',
  'buddy.companionLostPower',
  'buddy.depositToRevive',
  'buddy.depositToReviveDesc',
  'buddy.reviveCompanion',
] as const;

function lookup(messages: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>(
    (node, segment) =>
      node && typeof node === 'object'
        ? (node as Record<string, unknown>)[segment]
        : undefined,
    messages,
  );
  return String(value ?? '');
}

describe('buddy rest frame guard', () => {
  it('keeps weak, critical, and dormant copy out of mirror and redemption narratives', () => {
    const forbidden =
      /你知道的|You already know|照见|mirror|自由|freedom|难过|伤心|sad|开心|cheer up|赎罪/i;

    for (const locale of [zh, en]) {
      for (const key of REST_KEYS) {
        expect(lookup(locale, key), `${key}`).not.toMatch(forbidden);
      }
    }
  });

  it('keeps the real-money promise in both dormant revive descriptions', () => {
    expect(zh.buddy.depositToReviveDesc).toMatch(/守护战绩|自由小时/);
    expect(en.buddy.depositToReviveDesc).toMatch(/guardian record|freedom hours/i);
  });

  it('removes the skull icon from the dormant rest card', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/buddy-tab.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/\bSkull\b/);
  });
});
