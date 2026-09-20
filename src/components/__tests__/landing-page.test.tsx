// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingPage } from '../landing-page';

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => {
    const tr = (key: string) => key;
    tr.raw = () => [];
    tr.rich = (_key: string, values: { highlight?: (chunks: string) => unknown }) =>
      values.highlight?.('') ?? null;
    return tr;
  },
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../landing-ref-hero', () => ({ LandingRefHero: () => null }));
vi.mock('../landing-hero-image', () => ({ LandingHeroImage: () => null }));
vi.mock('../language-switcher', () => ({ LanguageSwitcher: () => null }));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/zh');
  });

  it('explore-demo CTA pushes the locale-prefixed guest route', () => {
    render(<LandingPage />);

    screen.getByText('landing.ctaExplore').click();

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/zh?guest=true');
  });

  it('shows the trust entry in the footer', () => {
    render(<LandingPage />);

    expect(screen.getByText('landing.footerTrust').getAttribute('href')).toBe('/zh/trust');
  });
});
