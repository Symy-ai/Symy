// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { captureRefCode, useRefCodeTracking } from '@/hooks/use-ref-code-tracking';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe('ref code tracking', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.mocked(apiFetch).mockReset();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => cleanup());

  it('captures a ref code while preserving other query parameters', () => {
    window.history.replaceState({}, '', '/landing?ref=FRIEND&utm_source=x#team');

    captureRefCode();

    expect(localStorage.getItem('symy_ref_code')).toBe('FRIEND');
    expect(localStorage.getItem('symy_ref_code_recorded')).toBeNull();
    expect(window.location.href).toBe('http://localhost:3000/landing?utm_source=x#team');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('FRIEND'));
  });

  it('does not rewrite the URL when no ref is present', () => {
    window.history.replaceState({}, '', '/home?a=1');
    captureRefCode();

    expect(window.location.href).toBe('http://localhost:3000/home?a=1');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('records once after login and clears storage', async () => {
    localStorage.setItem('symy_ref_code', 'GUARDIAN');
    vi.mocked(apiFetch).mockResolvedValue({ recorded: true });

    const { rerender } = renderHook(({ userId }) => useRefCodeTracking(userId), { initialProps: { userId: null as string | null } });
    expect(apiFetch).not.toHaveBeenCalled();

    rerender({ userId: 'u-1' });
    rerender({ userId: 'u-1' });
    await act(async () => {});
    await act(async () => {});

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/invite/record-ref', { method: 'POST', body: { refCode: 'GUARDIAN' } });
    expect(localStorage.getItem('symy_ref_code')).toBeNull();
  });

  it('does not post without a stored code', () => {
    renderHook(() => useRefCodeTracking('u-1'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('retries after a recording failure', async () => {
    localStorage.setItem('symy_ref_code', 'RETRY');
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ recorded: true });

    const { rerender } = renderHook(({ userId }) => useRefCodeTracking(userId), { initialProps: { userId: 'u-1' } });
    await act(async () => {});
    rerender({ userId: 'u-2' });
    await act(async () => {});

    expect(apiFetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(localStorage.getItem('symy_ref_code')).toBeNull());
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
