// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ChallengeContext } from '@/types/challenge-context';
import type { ComponentProps } from 'react';
import { AhaMomentOnboarding } from '../aha-moment-onboarding';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> & { defaultValue?: string }) => {
      if (params?.defaultValue !== undefined) return String(params.defaultValue);
      return key;
    },
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 50 }),
}));

vi.mock('@/lib/freedom-time', () => ({
  formatFreedomTime: (hours: number) => `${hours.toFixed(1)}h`,
  moneyToHours: (amount: number, rate: number) => amount / rate,
}));

function renderAha(overrides: Partial<ComponentProps<typeof AhaMomentOnboarding>> = {}) {
  const props = {
    open: true,
    isDemo: false,
    ahaChallengeContext: { itemName: 'Phone', amount: 699 } satisfies ChallengeContext,
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    onNavigateToChallenge: vi.fn(),
    ...overrides,
  };
  render(<AhaMomentOnboarding {...props} />);
  return props;
}

describe('AhaMomentOnboarding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing until open', () => {
    renderAha({ open: false });
    expect(document.body.textContent).not.toContain("What's calling you?");
  });

  it('opens on welcome with dialog semantics and the start button', () => {
    renderAha();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Experience →' })).toBeTruthy();
  });

  it('hides skip before three seconds and shows it on the exact timer tick', () => {
    renderAha();
    expect(screen.queryByRole('button', { name: 'Just looking around' })).toBeNull();
    act(() => { vi.advanceTimersByTime(2999); });
    expect(screen.queryByRole('button', { name: 'Just looking around' })).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('button', { name: 'Just looking around' })).toBeTruthy();
  });

  it('skip calls onSkip once', () => {
    const props = renderAha();
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(screen.getByRole('button', { name: 'Just looking around' }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it('moves from welcome to challenge input and prefills the first preset', () => {
    renderAha();
    fireEvent.click(screen.getByRole('button', { name: 'Start Experience →' }));
    expect(screen.getByText("What's calling you?")).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ahaMoment\.presets\.phone\.name/ }));
    expect((screen.getByPlaceholderText('e.g. Nike sneakers, AirPods...') as HTMLInputElement).value).toBe('ahaMoment.presets.phone.name');
    expect(screen.getByText('≈ 14.0h of freedom')).toBeTruthy();
  });

  it('keeps challenge start disabled until name and a minimum amount are valid', () => {
    renderAha();
    fireEvent.click(screen.getByRole('button', { name: 'Start Experience →' }));
    const submit = screen.getByRole('button', { name: 'Let the green gate decide →' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('e.g. Nike sneakers, AirPods...'), { target: { value: 'Headphones' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '9' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '120' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it('navigates with the challenge context and waits on the result step', () => {
    const props = renderAha();
    fireEvent.click(screen.getByRole('button', { name: 'Start Experience →' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Nike sneakers, AirPods...'), { target: { value: ' Headphones ' } });
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Let the green gate decide →' }));

    expect(props.onNavigateToChallenge).toHaveBeenCalledWith({ itemName: 'Headphones', amount: 120 });
    expect(screen.getByText('Complete the challenge in chat, then come back!')).toBeTruthy();
  });

  it('restores the saved pass result when reopened after challenge completion', () => {
    sessionStorage.setItem('symy-aha-challenge-completed', 'true');
    sessionStorage.setItem('symy-aha-challenge-amount', '120');
    renderAha({ ahaChallengeContext: null, open: false });

    const props = {
      open: true,
      isDemo: false,
      ahaChallengeContext: null,
      onComplete: vi.fn(),
      onSkip: vi.fn(),
      onNavigateToChallenge: vi.fn(),
      onChallengeCompleted: vi.fn(),
    };
    render(<AhaMomentOnboarding {...props} />);
    expect(screen.getByText(/You held the gate\. \$120\.00 stays yours/)).toBeTruthy();
    expect(sessionStorage.getItem('symy-aha-challenge-completed')).toBeNull();
  });

  it('does not consume the completed marker while the challenge context is still present', () => {
    sessionStorage.setItem('symy-aha-challenge-completed', 'true');
    renderAha();
    expect(screen.getByRole('button', { name: 'Start Experience →' })).toBeTruthy();
    expect(sessionStorage.getItem('symy-aha-challenge-completed')).toBe('true');
  });

  it('completes from the result step and resets state after close', () => {
    const props = renderAha();
    fireEvent.click(screen.getByRole('button', { name: 'Start Experience →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Just looking around' }));
    render(<AhaMomentOnboarding {...props} open={false} />);
    cleanup();

    render(<AhaMomentOnboarding {...props} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Experience →' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Nike sneakers, AirPods...'), { target: { value: 'Coffee' } });
    expect((screen.getByPlaceholderText('e.g. Nike sneakers, AirPods...') as HTMLInputElement).value).toBe('Coffee');
  });
});
