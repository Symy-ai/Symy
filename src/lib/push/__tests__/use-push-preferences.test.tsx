/* eslint-disable require-await -- test fetch mocks use async for API consistency */
// @vitest-environment happy-dom
/**
 * usePushPreferences hook 测试 (batch60-b)
 *
 * 锁客户端行为: GET 回显归一化、PATCH 乐观更新 + 失败回滚 (不伪造已保存)、
 * 成功后 "已更新" 轻反馈且下次改动清除。
 */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { usePushPreferences } from '../use-push-preferences';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('usePushPreferences', () => {
  it('loads and normalizes server preferences', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: { missYou: false, frequency: 'weekly' } }),
    });

    const { result } = renderHook(() => usePushPreferences());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.preferences).toEqual({
      missYou: false,
      dreamFund: true,
      challenge: true,
      weeklyGuardian: true,
      dailyAlgorithm: true,
      frequency: 'weekly',
    });
    expect(result.current.isLoaded).toBe(true);
  });

  it('optimistically applies a patch and flips justSaved on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, preferences: { frequency: 'weekly' } }),
    });

    const { result } = renderHook(() => usePushPreferences());
    expect(result.current.justSaved).toBe(false);

    await act(async () => {
      await result.current.save({ frequency: 'weekly' });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/push/preferences', expect.objectContaining({ method: 'PATCH' }));
    expect(result.current.preferences.frequency).toBe('weekly');
    expect(result.current.justSaved).toBe(true);
    expect(result.current.saveError).toBeNull();
  });

  it('reverts the optimistic update and surfaces the error when PATCH fails — never fakes a save', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { result } = renderHook(() => usePushPreferences());
    await act(async () => {
      await result.current.save({ frequency: 'weekly' });
    });
    expect(result.current.preferences.frequency).toBe('weekly');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'DB down' }) });
    await act(async () => {
      await result.current.save({ missYou: false });
    });

    expect(result.current.preferences).toMatchObject({ frequency: 'weekly', missYou: true });
    expect(result.current.justSaved).toBe(false);
    expect(result.current.saveError).toBe('DB down');
  });

  it('keeps justSaved until the next change begins', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, preferences: {} }) });

    const { result } = renderHook(() => usePushPreferences());
    await act(async () => {
      await result.current.save({ missYou: false });
    });
    expect(result.current.justSaved).toBe(true);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, preferences: {} }) });
    await act(async () => {
      await result.current.save({ missYou: true });
    });
    expect(result.current.justSaved).toBe(true);
  });

  it('waits for load to settle', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preferences: { challenge: false } }),
    });

    const { result } = renderHook(() => usePushPreferences());
    act(() => {
      void result.current.load();
    });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.preferences.challenge).toBe(false);
  });
});
