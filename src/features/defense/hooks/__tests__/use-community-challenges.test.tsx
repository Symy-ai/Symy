// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useCommunityChallenges } from '../use-community-challenges';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

const remoteChallenge = {
  id: 'c-1', title: 'T', titleKey: null, description: null, platform: 'x',
  maxAmount: null, startDate: '2026-10-01', endDate: '2026-10-08',
  totalDays: 7, currentDay: 3, totalParticipants: 10, activeParticipants: 5,
  completedParticipants: 2, myStatus: null, myCurrentDay: 0, myLastCheckinDate: null,
};

/**
 * use-community-challenges.ts (170行) — 社区挑战 hook (手动 useState 时代, 未 RQ 化)。
 *
 * 锁定:
 * - demo: 示例数据直出零 fetch + join/checkin 短路 {success:false}
 * - 非 demo: 拉取列表 /api/community/challenges
 * - joinChallenge: POST join 端点 + 成功 refresh + 失败 error 透传
 * - checkin: POST checkin 端点 + result 透传
 */
describe('useCommunityChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('demo: 示例挑战直出 + 零 fetch + isLoading 终态 false', async () => {
    const { result } = renderHook(() => useCommunityChallenges(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.challenges.length).toBeGreaterThan(0);
    expect(result.current.challenges[0].id).toBe('demo-1');
  });

  it('demo: join/checkin 双短路 {success:false} 不发请求', async () => {
    const { result } = renderHook(() => useCommunityChallenges(true));
    const j = await result.current.joinChallenge('demo-1');
    const c = await result.current.checkin('demo-1');
    expect(j).toEqual({ success: false });
    expect(c).toEqual({ success: false });
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('非 demo: 拉取远程列表', async () => {
    mockApi.mockResolvedValueOnce({ challenges: [remoteChallenge] } as never);
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    expect(mockApi).toHaveBeenCalledWith('/api/community/challenges');
    expect(result.current.challenges[0].currentDay).toBe(3);
  });

  it('非 demo 拉取失败 → 空列表兜底不炸', async () => {
    mockApi.mockRejectedValueOnce(new Error('down') as never);
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.challenges).toEqual([]);
  });

  it('joinChallenge: POST join + 成功后 refresh 重拉', async () => {
    mockApi.mockResolvedValueOnce({ challenges: [remoteChallenge] } as never); // 首拉
    mockApi.mockResolvedValueOnce({ ok: true } as never); // join
    mockApi.mockResolvedValueOnce({ challenges: [{ ...remoteChallenge, myStatus: 'active' }] } as never); // refresh
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    let res!: { success: boolean; error?: string };
    await act(async () => { res = await result.current.joinChallenge('c-1'); });
    expect(res.success).toBe(true);
    const joinCall = mockApi.mock.calls.find((c) => c[0] === '/api/community/challenges/join');
    expect(joinCall).toBeTruthy();
    expect((joinCall![1] as { method?: string }).method).toBe('POST');
    await waitFor(() => expect(result.current.challenges[0].myStatus).toBe('active'));
  });

  it('joinChallenge 失败 → error 透传 + actionLoading 复位', async () => {
    mockApi.mockResolvedValueOnce({ challenges: [remoteChallenge] } as never);
    mockApi.mockRejectedValueOnce(new Error('already joined') as never);
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    let res!: { success: boolean; error?: string };
    await act(async () => { res = await result.current.joinChallenge('c-1'); });
    expect(res).toEqual({ success: false, error: 'already joined' });
    expect(result.current.actionLoading).toBe(false);
  });

  it('checkin: POST checkin + result 透传 (currentDay/status)', async () => {
    mockApi.mockResolvedValueOnce({ challenges: [remoteChallenge] } as never);
    mockApi.mockResolvedValueOnce({ success: true, currentDay: 4, status: 'active' } as never);
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    let res!: { success: boolean; currentDay?: number; status?: string; error?: string };
    await act(async () => { res = await result.current.checkin('c-1'); });
    expect(res).toEqual({ success: true, currentDay: 4, status: 'active' });
    const checkinCall = mockApi.mock.calls.find((c) => c[0] === '/api/community/challenges/checkin');
    expect((checkinCall![1] as { body?: { challengeId?: string } }).body?.challengeId).toBe('c-1');
  });

  it('checkin 失败 → error 透传', async () => {
    mockApi.mockResolvedValueOnce({ challenges: [remoteChallenge] } as never);
    mockApi.mockRejectedValueOnce(new Error('checked in today') as never);
    const { result } = renderHook(() => useCommunityChallenges(false));
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    let res!: { success: boolean; currentDay?: number; status?: string; error?: string };
    await act(async () => { res = await result.current.checkin('c-1'); });
    expect(res.success).toBe(false);
    expect(res.error).toBe('checked in today');
  });
});
