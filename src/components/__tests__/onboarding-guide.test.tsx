// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'onboarding.progressLabels.step') return `Step ${opts?.current} / ${opts?.total}`;
      return key;
    },
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetchVoid: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/onboarding/first-gate-list', () => ({
  FirstGateList: () => <div data-testid="first-gate-list" />,
}));

import { OnboardingGuide } from '../onboarding-guide';
import { apiFetchVoid } from '@/lib/api-client';

function renderGuide(overrides: Partial<React.ComponentProps<typeof OnboardingGuide>> = {}) {
  const onComplete = vi.fn();
  const onSwitchTab = vi.fn();
  const onSkip = vi.fn();
  render(
    <OnboardingGuide
      onComplete={onComplete}
      onSwitchTab={onSwitchTab}
      onSkip={onSkip}
      visible
      {...overrides}
    />,
  );
  return { onComplete, onSwitchTab, onSkip };
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: /onboarding\.(startTour|next|getStarted)/ }));
}

function skip() {
  fireEvent.click(screen.getByRole('button', { name: /onboarding\.skipGuide/ }));
}

describe('OnboardingGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(apiFetchVoid).mockResolvedValue(undefined);
  });

  it('renders nothing while hidden', () => {
    renderGuide({ visible: false });
    expect(screen.queryByText('onboarding.steps.welcome.title')).toBeNull();
  });

  it('renders the welcome step and initial progress', () => {
    renderGuide();
    expect(screen.getByText('onboarding.steps.welcome.title')).toBeTruthy();
    expect(screen.getByText('onboarding.progressLabels.welcome')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.queryByTestId('first-gate-list')).toBeNull();
  });

  it('advances through interactive steps and switches the requested tabs', () => {
    const { onSwitchTab } = renderGuide();

    next();
    expect(screen.getByText('onboarding.steps.buddy.title')).toBeTruthy();
    expect(onSwitchTab).toHaveBeenLastCalledWith('buddy');

    next();
    expect(screen.getByText('onboarding.steps.seeIt.title')).toBeTruthy();
    expect(onSwitchTab).toHaveBeenCalledTimes(1);

    next();
    expect(screen.getByText('onboarding.steps.dreamFunds.title')).toBeTruthy();
    expect(onSwitchTab).toHaveBeenLastCalledWith('profile');
  });

  it('renders the complete step with the starter gate and final progress', () => {
    const { onSwitchTab } = renderGuide();
    next(); next(); next(); next();

    expect(screen.getAllByText('onboarding.steps.complete.title').length).toBeGreaterThan(1);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByTestId('first-gate-list')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /onboarding\.skipGuide/ })).toBeNull();
    expect(onSwitchTab).toHaveBeenCalledTimes(2);
  });

  it('records completion, dispatches the challenge event, and closes from the final step', () => {
    const listener = vi.fn();
    window.addEventListener('symy:open-challenge-modal', listener);
    const { onComplete } = renderGuide();
    next(); next(); next(); next();
    next();

    expect(apiFetchVoid).toHaveBeenCalledWith('/api/user/onboarding', {
      method: 'PUT',
      body: { onboarding_completed: true },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    window.removeEventListener('symy:open-challenge-modal', listener);
  });

  it('skips permanently, invokes external skip handling, and closes', () => {
    const { onComplete, onSkip } = renderGuide();
    skip();

    expect(apiFetchVoid).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('supports demo mode without recording completion on finish or skip', () => {
    const { onComplete } = renderGuide({ isDemo: true });
    next(); next(); next(); next(); next();

    expect(apiFetchVoid).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);

    cleanup();
    const { onComplete: skippedOnComplete } = renderGuide({ isDemo: true });
    skip();
    expect(localStorage.getItem('symy-onboarding-seen')).toBe('true');
    expect(skippedOnComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('clears and nullifies the pending retry timer on unmount after completion API failure', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiFetchVoid).mockRejectedValueOnce(new Error('offline'));
      renderGuide();
      next(); next(); next(); next(); next();
      await vi.advanceTimersByTimeAsync(0);
      expect(apiFetchVoid).toHaveBeenCalledTimes(1);
      cleanup();
      await vi.advanceTimersByTimeAsync(2000);
      expect(apiFetchVoid).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries the completion record once after an API failure', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiFetchVoid)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined);
      const { onComplete } = renderGuide();
      next(); next(); next(); next(); next();
      await vi.advanceTimersByTimeAsync(0);
      expect(apiFetchVoid).toHaveBeenCalledTimes(1);
      onComplete.mockImplementation(() => {});
      await vi.advanceTimersByTimeAsync(2000);
      expect(apiFetchVoid).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a targeted step when its spotlight target is absent', () => {
    renderGuide();
    next();
    expect(screen.getByText('onboarding.steps.buddy.title')).toBeTruthy();
  });
});
