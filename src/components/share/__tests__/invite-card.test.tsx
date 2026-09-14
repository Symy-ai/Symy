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
        'share.inviteCard.pill': 'Guardian Invite',
        'share.inviteCard.title': 'My guardian title',
        'share.inviteCard.companion': 'I invited {count} friends to guard the planet’s wallet together.',
        'share.inviteCard.recruitFirst': 'Help me recruit the first companion for a gentler planet.',
        'share.inviteCard.joinLabel': 'Join me',
        'profile.inviteTier5': 'Guardian Partner',
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

  it('renders tier, companion count and real ref code without reward numbers', () => {
    const { container } = render(
      <>{getShareTemplate('invite').render({ ...props, inviteCard: { refCode: 'guard7', completedCount: 5 } })}</>,
    );
    expect(container.textContent).toContain('Guardian Partner');
    expect(container.textContent).toContain('I invited 5 friends');
    expect(container.textContent).toContain('symy.ai/?ref=guard7');
    expect(container.textContent).not.toMatch(/Premium|\+\d+|\b30\b|\b60\b|[$¥€£]/i);
  });

  it('renders an encouraging zero-invite card', () => {
    const { container } = render(
      <>{getShareTemplate('invite').render({ ...props, inviteCard: { refCode: 'first1', completedCount: 0 } })}</>,
    );
    expect(container.textContent).toContain('recruit the first companion');
    expect(container.textContent).toContain('symy.ai/?ref=first1');
  });
});
