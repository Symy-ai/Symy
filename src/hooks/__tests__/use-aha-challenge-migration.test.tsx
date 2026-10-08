// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { showToast } from '@/lib/toast';
import { useAhaChallengeMigration } from '@/hooks/use-aha-challenge-migration';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }));

const storedChallenge = {
  challengeTitle: 'Camera',
  passed: true,
  amount: 180,
  savedAt: '2026-10-07T10:00:00.000Z',
};

function settle() {
  return act(async () => {
    await Promise.resolve();
  });
}

describe('useAhaChallengeMigration', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(showToast).mockClear();
  });

  afterEach(() => cleanup());

  it('migrates valid stored challenge data and shows a toast', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', JSON.stringify(storedChallenge));
    vi.mocked(apiFetch).mockResolvedValue({});

    renderHook(() => useAhaChallengeMigration({ id: 'u-1' }, key => key));
    await settle();

    expect(apiFetch).toHaveBeenCalledWith('/api/challenge/create', {
      method: 'POST',
      body: { itemName: 'Camera', amount: 180 },
    });
    expect(localStorage.getItem('symy-aha-challenge-recorded:u-1')).toBe('true');
    expect(sessionStorage.getItem('symy-aha-challenge-migration')).toBeNull();
    expect(showToast).toHaveBeenCalledWith('ahaMoment.migratedToast', 'success', 1500);
  });

  it('passes through without API calls when no old data exists', async () => {
    renderHook(() => useAhaChallengeMigration({ id: 'u-1' }, key => key));
    await settle();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('does nothing for signed-out users', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', JSON.stringify(storedChallenge));
    renderHook(() => useAhaChallengeMigration(null, key => key));
    await settle();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('skips malformed storage and remains retryable', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', '{broken');
    renderHook(() => useAhaChallengeMigration({ id: 'u-1' }, key => key));
    await settle();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('symy-aha-challenge-recorded:u-1')).toBeNull();
  });
});
