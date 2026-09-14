import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/messages/en.json';
import zh from '../../i18n/messages/zh.json';

const COMPONENT_PATH = 'src/components/aha-moment-onboarding.tsx';

function leaves(node: unknown, prefix = ''): Array<{ key: string; value: string }> {
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ key: prefix, value: String(node) }];
}

function sectionEntries(dict: Record<string, unknown>, section: string): Array<{ key: string; value: string }> {
  return leaves(dict[section]).map((entry) => ({ ...entry, key: `${section}.${entry.key}` }));
}

describe('aha first-screen green guardian narrative', () => {
  it.each(['ahaMoment', 'authPrompt', 'demo'] as const)(
    'keeps %s free of mirror/reclaim vocabulary in both locales',
    (section) => {
      for (const dict of [en, zh]) {
        for (const { key, value } of sectionEntries(dict, section)) {
          expect(`${key} = ${value}`).not.toMatch(/mirror|🪞|reclaim/i);
        }
      }
    },
  );

  it('anchors the guardian, medal, and won-back-hours narrative in both locales', () => {
    expect(en.ahaMoment.welcomeDesc).toContain("Symy's little elephant holds the gate");
    expect(zh.ahaMoment.welcomeDesc).toContain('小象会替你守门');
    expect(en.ahaMoment.resultPassed).toContain('one more green medal');
    expect(zh.ahaMoment.resultPassed).toContain('绿色勋章');
    expect(en.ahaMoment.resultFailed).toContain('You chose freely');
    expect(zh.ahaMoment.resultFailed).toContain('你自由选择了');
    expect(en.authPrompt.features.aha_moment.title).toBe('Sign up to start guarding');
    expect(zh.authPrompt.features.aha_moment.title).toBe('注册开始守护');
    expect(en.authPrompt.features.aha_moment.benefit2).toContain('free hours you win back');
    expect(zh.authPrompt.features.aha_moment.benefit2).toContain('自由小时');
  });

  it('keeps the demoBanner → challenge_input → result journey in guardian language', () => {
    expect(en.ahaMoment.demoBanner).toContain('green gate');
    expect(en.ahaMoment.tryExampleFirst).toContain('guard');
    expect(en.ahaMoment.challengeMe).toContain('green gate');
    expect(en.ahaMoment.resultPassed).toContain('stays yours');
    expect(zh.ahaMoment.demoBanner).toContain('绿色关');
    expect(zh.ahaMoment.tryExampleFirst).toContain('守一单');
    expect(zh.ahaMoment.challengeMe).toContain('绿色之门');
    expect(zh.ahaMoment.resultPassed).toContain('留在你手里');
  });

  it('keeps component defaultValue fallbacks aligned with the i18n SSOT', () => {
    const source = readFileSync(path.resolve(process.cwd(), COMPONENT_PATH), 'utf8');
    const defaults: Record<string, string> = {
      welcomeTitle: 'Symy is your AI green-shopping companion',
      welcomeDesc: "Before you buy, Symy's little elephant holds the gate — for your wallet, your hours, and the planet. Let's try it in 2 minutes.",
      welcomeSub: 'Your wallet. Your hours. Your planet. Your call.',
      tryExampleFirst: 'Try one guard in 10 seconds',
      howMuch: 'How much freedom is at stake?',
      challengeMe: 'Let the green gate decide →',
      thisIsCore: 'This is what Symy is for — a guardian, not a judge.',
    };

    for (const [key, value] of Object.entries(defaults)) {
      expect(source, `ahaMoment.${key} defaultValue diverges`).toContain(
        `t('ahaMoment.${key}', { defaultValue: '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
      );
    }

    expect(source).toContain("defaultValue: `You held the gate. $");
    expect(source).toContain('defaultValue: \'You chose freely.');
    expect(source).not.toMatch(/mirror|reclaim|seeing|See it|the real cost/i);
  });
});
