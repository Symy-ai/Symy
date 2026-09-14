// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FirstGateList, FIRST_GATE_CHALLENGES } from '../onboarding/first-gate-list';
import { GUARDIAN_CHALLENGES } from '../buddy/challenge-definitions';
import en from '../../i18n/messages/en.json';
import zh from '../../i18n/messages/zh.json';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

vi.mock('@/i18n/provider', async () => {
  const messages = await import('@/i18n/messages/en.json');
  const lookup = (key: string): string =>
    key.split('.').reduce<unknown>((node, segment) => {
      if (node && typeof node === 'object') return (node as Record<string, string>)[segment];
      return undefined;
    }, messages.default) as string;
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) => {
        let result = lookup(key) ?? key;
        for (const [name, value] of Object.entries(params || {})) {
          result = result.replaceAll(`{${name}}`, String(value));
        }
        return result;
      },
      locale: 'en',
    }),
  };
});

describe('onboarding first-gate ritual', () => {
  it('renders three real starter challenges in period priority order', () => {
    render(<FirstGateList />);
    const expected = GUARDIAN_CHALLENGES
      .filter((challenge) => challenge.tier === 'starter')
      .sort((a, b) => {
        const priority = { daily: 0, weekly: 1, all_time: 2 } as const;
        return priority[a.period] - priority[b.period];
      })
      .slice(0, 3);

    expect(FIRST_GATE_CHALLENGES.map((challenge) => challenge.id)).toEqual(expected.map((challenge) => challenge.id));
    for (const challenge of FIRST_GATE_CHALLENGES) {
      expect(screen.getByText(lookupText(en, challenge.titleKey))).toBeTruthy();
      expect(screen.getAllByText(`${challenge.target} times`).length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).not.toMatch(/unlock|badge|勋章|解锁/);
  });

  it('keeps onboarding i18n keys aligned and keeps the badge section limited to the guardian rookie name', () => {
    expect((zh.onboarding as Record<string, unknown>).badge).toEqual({ name: '绿色守护新手' });
    expect((en.onboarding as Record<string, unknown>).badge).toEqual({ name: 'Green Guardian Rookie' });
    expect(zh.onboarding.firstGateTitle).toBe('今日第一关');
    expect(en.onboarding.firstGateTitle).toBe("Today's First Gates");
    expect(en.onboarding.steps.complete.description).not.toMatch(/badge|unlock/i);
    expect(zh.onboarding.steps.complete.description).not.toMatch(/勋章|解锁/);
  });
});

function lookupText(source: typeof en, key: string): string {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object') return (node as Record<string, string>)[segment];
    return undefined;
  }, source) as string;
}
