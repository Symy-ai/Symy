import { describe, expect, it } from 'vitest';
import { MESSAGE_POOL } from '../buddy-proactive-messages';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';

const zhMessages = zh.buddy.proactiveMessages as Record<string, string>;
const enMessages = en.buddy.proactiveMessages as Record<string, string>;

const bannedGlobalZh = /落后|失败|没用|再不|快|最后|错过|\$\d|¥\d|\d{2,}\s*碳|\d+\s*kg\s*CO₂/i;
const bannedGlobalEn = /behind|useless|you failed|failure|hurry|last chance|miss out|\$\d|¥\d|\d{2,}\s*kg\s*CO₂/i;

describe('buddy proactive message tone guard', () => {
  it('zh and en key sets are identical', () => {
    expect(Object.keys(zhMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it('covers every MESSAGE_POOL key in zh and en', () => {
    const poolShortKeys = Object.values(MESSAGE_POOL)
      .flat()
      .map((k) => k.split('.').pop() as string)
      .sort();
    const i18nKeys = Object.keys(zhMessages).sort();

    expect(i18nKeys).toEqual(poolShortKeys);
    expect(poolShortKeys.length).toBeGreaterThanOrEqual(60);
  });

  it('keeps every category non-empty in both locales', () => {
    for (const keys of Object.values(MESSAGE_POOL)) {
      for (const key of keys) {
        const suffix = key.split('.').pop() as string;
        expect(typeof zhMessages[suffix]).toBe('string');
        expect(typeof enMessages[suffix]).toBe('string');
        expect(zhMessages[suffix].length).toBeGreaterThan(2);
        expect(enMessages[suffix].length).toBeGreaterThan(2);
      }
    }
  });

  it('matches banned language in zh messages', () => {
    for (const value of Object.values(zhMessages)) {
      expect(value).not.toMatch(bannedGlobalZh);
    }
  });

  it('matches banned language in en messages', () => {
    for (const value of Object.values(enMessages)) {
      expect(value).not.toMatch(bannedGlobalEn);
    }
  });

  it('retains no dollar or yen symbols', () => {
    const currency = /[\$¥]/;
    for (const value of Object.values(zhMessages)) {
      expect(value).not.toMatch(currency);
    }
    for (const value of Object.values(enMessages)) {
      expect(value).not.toMatch(currency);
    }
  });

  it('keeps Chinese warmth anchors present', () => {
    const warmAnchors = /守护|森林|安静|自由时间|小象|慢慢|还在|温柔/;
    const matched = Object.values(zhMessages).filter((value) => warmAnchors.test(value));
    expect(matched.length).toBeGreaterThanOrEqual(16);
  });

  it('keeps English warmth anchors present', () => {
    const warmAnchors = /quiet|guardian|forest|slow|calm|still|gentle|free time/i;
    const matched = Object.values(enMessages).filter((value) => warmAnchors.test(value));
    expect(matched.length).toBeGreaterThanOrEqual(16);
  });

  it('keeps Chinese start tokens unique within each pool', () => {
    for (const keys of Object.values(MESSAGE_POOL)) {
      const starts = keys.map((k) => (zhMessages[k.split('.').pop() as string] ?? '').slice(0, 4));
      expect(new Set(starts).size).toBe(starts.length);
    }
  });

  it('keeps English start tokens unique within each pool', () => {
    for (const keys of Object.values(MESSAGE_POOL)) {
      const starts = keys.map((k) =>
        (enMessages[k.split('.').pop() as string] ?? '').toLowerCase().split(/\s+/).slice(0, 3).join(' '),
      );
      expect(new Set(starts).size).toBe(starts.length);
    }
  });

  it('does not repeat banned shame language in zh', () => {
    for (const value of Object.values(zhMessages)) {
      expect(value).not.toMatch(/落后|失败|没用|焦虑|再不|快|最后|错过/);
    }
  });

  it('does not repeat banned shame language in en', () => {
    for (const value of Object.values(enMessages)) {
      expect(value).not.toMatch(/behind|useless|failure|hurry|last chance|miss out/i);
    }
  });
});
