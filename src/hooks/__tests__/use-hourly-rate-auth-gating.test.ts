/**
 * Test: F2 fix pattern — useHourlyRate auth gating
 *
 * @vitest-environment happy-dom
 *
 * 🔧 Round 111: Test that useHourlyRate doesn't fire API calls
 *    when user is not authenticated (prevents 401 storm on cold load).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the auth provider
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(() => ({ user: null, loading: true })),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { useAuth } from '@/components/auth/auth-provider';
import { apiFetch } from '@/lib/api-client';

describe('F2 fix: useHourlyRate auth gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module-level state
    vi.resetModules();
  });

  it('should NOT call apiFetch when user is null and loading is true', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true, signOut: vi.fn() });

    const { result } = renderHook(() => useHourlyRate(false));

    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.hourlyRate).toBe(25); // default (U-4: $20→$25)
  });

  it('should NOT call apiFetch when user is null and loading is false', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });

    renderHook(() => useHourlyRate(false));

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('should call apiFetch when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'test-user', email: 'test@test.com' } as any,
      loading: false,
      signOut: vi.fn(),
    });

    vi.mocked(apiFetch).mockResolvedValue({ hourlyRate: 50 });

    renderHook(() => useHourlyRate(false));

    // Wait for the effect to run
    expect(apiFetch).toHaveBeenCalledWith('/api/user/hourly-rate');
  });
});
