// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuardDiary } from '@/hooks/use-guard-diary';
import type { GuardDiaryEventInput } from '@/lib/guard-diary';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const hourlyRateMock = vi.hoisted(() => vi.fn(() => ({ hourlyRate: 20 })));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));
vi.mock('@/i18n/provider', () => ({ useI18n: vi.fn(() => ({ locale: 'zh' })) }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: hourlyRateMock }));

function nowEvent(overrides: Partial<GuardDiaryEventInput> = {}): GuardDiaryEventInput {
  return {
    metadata: { source: 'deposit', amount: 30, itemTitle: '耳机' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function settle() {
  await act(async () => {});
}

describe('useGuardDiary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('成功加载当日事件并生成日记派生值', async () => {
    apiFetchMock.mockResolvedValue({ events: [nowEvent({ metadata: { source: 'deposit', amount: 40, itemTitle: '耳机' } })] });
    const { result } = renderHook(() => useGuardDiary());

    expect(result.current.diary).toBeNull();
    await settle();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toContain('event_type=challenge_reward&limit=100');
    expect(result.current.diary).toMatchObject({ guardCount: 1, estSaved: 40, hoursReclaimed: 2, topCategory: 'electronics' });
    expect(result.current.diary?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.current.diary?.text).not.toContain('40');
  });

  it('过滤非当日事件并缓存空日记事件', async () => {
    apiFetchMock.mockResolvedValue({ events: [nowEvent({ createdAt: '2020-01-01T10:00:00' })] });
    const { result, unmount } = renderHook(() => useGuardDiary());
    await settle();

    expect(result.current.diary).toMatchObject({ variant: 'companion', guardCount: 0 });
    expect(window.sessionStorage.length).toBe(1);
    unmount();

    renderHook(() => useGuardDiary());
    await settle();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('空响应映射为陪伴版日记', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardDiary());
    await settle();

    expect(result.current.diary).toMatchObject({ variant: 'companion', guardCount: 0, estSaved: 0, hoursReclaimed: 0 });
  });

  it('请求失败静默降级为 null 并写 warn 日志', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardDiary());
    await settle();

    expect(result.current.diary).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it('demo 模式不请求 API', async () => {
    const { result } = renderHook(() => useGuardDiary(true));
    await settle();
    expect(result.current.diary).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
