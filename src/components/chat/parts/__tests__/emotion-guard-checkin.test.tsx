// @vitest-environment happy-dom

/**
 * EmotionGuardCheckin 测试 — 「先等 10 分钟」到期待追问条两分支 (batch60-c)
 *
 * 覆盖: 渲染追问与二选一; 还想买 → 祝福 + 零上报; 放下了 → wait_passed
 * 审计 (manual_adjustment 纯审计, 零金额, triggerId 同日幂等约定)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmotionGuardCheckin } from '../emotion-guard-checkin';
import { _resetEmotionGuardStoreForTest, getEmotionWait, saveEmotionWait } from '../emotion-guard-store';
import type { PendingEmotionWait } from '@/types/emotion-guard';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'chat.emotionGuard.checkinQuestion': '10 分钟到了——现在还想买吗？',
        'chat.emotionGuard.checkinStillWant': '还想买',
        'chat.emotionGuard.checkinLetGo': '放下了',
        'chat.emotionGuard.checkinBlessing': '那就去吧，好好享受。🐘',
        'chat.emotionGuard.checkinSuccessNote': '这记「放下」本象帮你收好啦。🌱',
      })[key] || key,
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const record: PendingEmotionWait = {
  mood: 'tired',
  startedAt: Date.now() - 11 * 60 * 1000,
  dueAt: Date.now() - 60_000, // 已到期
};

describe('EmotionGuardCheckin (到期待追问条)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
    _resetEmotionGuardStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetEmotionGuardStoreForTest();
  });

  it('渲染追问问题与二选一按钮', () => {
    render(<EmotionGuardCheckin record={record} />);
    expect(screen.getByTestId('emotion-guard-checkin-bar').textContent).toContain('还想买吗');
    expect(screen.getByTestId('emotion-guard-checkin-want').textContent).toBe('还想买');
    expect(screen.getByTestId('emotion-guard-checkin-passed').textContent).toBe('放下了');
  });

  it('还想买 → 真诚祝福, 零上报 (买了不评判), 等待记录消解', () => {
    saveEmotionWait(record.mood, record.startedAt);
    render(<EmotionGuardCheckin record={record} />);
    fireEvent.click(screen.getByTestId('emotion-guard-checkin-want'));

    expect(screen.getByTestId('emotion-guard-checkin-answered').textContent).toContain('好好享受');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(getEmotionWait()).toBeNull();
  });

  it('放下了 → wait_passed 审计一次 (零金额, mood 进 metadata) + 成功文案', () => {
    saveEmotionWait(record.mood, record.startedAt);
    render(<EmotionGuardCheckin record={record} />);
    fireEvent.click(screen.getByTestId('emotion-guard-checkin-passed'));

    expect(screen.getByTestId('emotion-guard-checkin-answered').textContent).toContain('放下');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.body.eventType).toBe('manual_adjustment');
    expect(init.body.metadata).toEqual({ source: 'emotion_guard', mood: 'tired', choice: 'wait_passed' });
    expect(JSON.stringify(init.body)).not.toMatch(/amount|price|saved/i);
    expect(getEmotionWait()).toBeNull();
  });
});
