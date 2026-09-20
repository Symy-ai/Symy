// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';
import { getShareTemplate, SHARE_TEMPLATES, type ShareTemplateRenderProps } from '../card-templates';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const values: Record<string, string> = {
        'invite.covenantPill': 'Guardian Covenant',
        'invite.covenantTitle': "I'm guarding your future time",
        'invite.covenantHeading': "I'm guarding your future time",
        'invite.covenantSubtitle': 'Join guardian No. {guardianRank}',
        'invite.covenantJoinLabel': 'Become the person who is guarded',
        'invite.covenantFooter': 'Symy Guardian Forest',
        'share.interceptMedal.brandTagline': 'Buy less. Live more.',
      };
      let result = values[key] ?? params?.defaultValue ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          if (name !== 'defaultValue') result = result.replaceAll(`{${name}}`, String(value));
        }
      }
      return result;
    },
  }),
}));

const props: ShareTemplateRenderProps = {
  medal: { itemTitle: '', savedCents: 0, date: '2026-09-07T00:00:00Z' },
  streakDays: 0,
  interceptCount: 0,
  savedHours: 0,
};

describe('invite share template', () => {
  it('registers all nine templates and keeps invite labels bilingual', () => {
    expect(SHARE_TEMPLATES.map((template) => template.id)).toEqual([
      'intercept',
      'streak',
      'milestone',
      'badge',
      'challenge',
      'weekly',
      'dream',
      'guardian-stats',
      'invite',
    ]);
    expect(en.share.template.invite).toBeTruthy();
    expect(zh.share.template.invite).toBeTruthy();
    for (const locale of [en, zh]) {
      for (const key of Object.keys(locale.share.inviteCard)) {
        expect(typeof (locale.share.inviteCard as Record<string, string>)[key]).toBe('string');
      }
    }
  });

  it('renders the guardian covenant narrative and real ref code without reward numbers', () => {
    const { container } = render(
      <>{getShareTemplate('invite').render({ ...props, inviteCard: { refCode: 'guard7', completedCount: 5 } })}</>,
    );
    expect(container.textContent).toContain('Guardian Covenant');
    expect(container.textContent).toContain("I'm guarding your future time");
    expect(container.textContent).toContain('Join guardian No. 6');
    expect(container.textContent).toContain('Become the person who is guarded');
    expect(container.textContent).toContain('symy.ai/?ref=guard7');
    expect(container.textContent).not.toMatch(/reward|rebate|cashback|make money|Premium|\+\d+|\b30\b|\b60\b|[$¥€£]/i);
  });

  it('positions a first invitee as the person being guarded', () => {
    const { container } = render(
      <>{getShareTemplate('invite').render({ ...props, inviteCard: { refCode: 'first1', completedCount: 0 } })}</>,
    );
    expect(container.textContent).toContain('Join guardian No. 1');
    expect(container.textContent).toContain('symy.ai/?ref=first1');
  });

  it('keeps covenant copy bilingual and rebate-free', () => {
    for (const locale of [en, zh]) {
      expect(locale.invite.covenantHeading).toBeTruthy();
      expect(locale.invite.covenantSubtitle).toBeTruthy();
      expect(JSON.stringify(locale.invite)).not.toMatch(/reward|rebate|cashback|make money|奖励|返现|赚钱/i);
    }
  });
});
