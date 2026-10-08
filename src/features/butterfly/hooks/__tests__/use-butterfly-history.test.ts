// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useButterflyHistory } from '../use-butterfly-history';
import type { ButterflySession } from '../../types';

const apiFetchMock = vi.hoisted(() => vi.fn());
const apiFetchVoidMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock, apiFetchVoid: apiFetchVoidMock }));

function session(id: string, overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id,
    userId: 'u-1',
    decisionType: 'bought' as never,
    decisionDescription: `Decision ${id}`,
    amount: 10,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'completed',
    isExample: false,
    isBookmarked: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(sessions: ButterflySession[], total: number, hasMore = false) {
  return { sessions, total, page: 1, pageSize: 10, hasMore };
}

async function settle() {
  await act(async () => {});
}

describe('useButterflyHistory', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('does not fetch when disabled', async () => {
    renderHook(() => useButterflyHistory(false));
    await settle();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('loads the first page when enabled', async () => {
    apiFetchMock.mockResolvedValue(page([session('s-1'), session('s-2')], 12, true));
    const { result } = renderHook(() => useButterflyHistory(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.total).toBe(12);
    expect(result.current.hasMore).toBe(true);
    expect(String(apiFetchMock.mock.calls[0][0])).toContain('page=1');
  });

  it('loadMore appends the next page', async () => {
    apiFetchMock
      .mockResolvedValueOnce(page([session('s-1')], 2, true))
      .mockResolvedValueOnce(page([session('s-2')], 2, false));
    const { result } = renderHook(() => useButterflyHistory(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.sessions.map((s) => s.id)).toEqual(['s-1', 's-2']);
    expect(result.current.hasMore).toBe(false);
    expect(String(apiFetchMock.mock.calls[1][0])).toContain('page=2');
  });

  it('deleteSession removes the row from the loaded list', async () => {
    apiFetchMock.mockResolvedValue(page([session('s-1'), session('s-2')], 2));
    apiFetchVoidMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useButterflyHistory(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let ok = false;
    await act(async () => { ok = await result.current.deleteSession('s-1'); });
    expect(ok).toBe(true);
    expect(result.current.sessions.map((s) => s.id)).toEqual(['s-2']);
  });

  it('selectSession toggles the detail view target', async () => {
    apiFetchMock.mockResolvedValue(page([session('s-1')], 1));
    const { result } = renderHook(() => useButterflyHistory(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => { result.current.selectSession(result.current.sessions[0]); });
    expect(result.current.selectedSession?.id).toBe('s-1');
    act(() => { result.current.selectSession(null); });
    expect(result.current.selectedSession).toBeNull();
  });

  it('surfaces load failures as error without crashing', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useButterflyHistory(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.sessions).toEqual([]);
  });
});
