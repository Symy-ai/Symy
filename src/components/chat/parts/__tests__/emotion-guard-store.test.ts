// @vitest-environment happy-dom

/**
 * emotion-guard-store 测试 — 10 分钟等待 one-shot + 审计幂等 (batch60-c)
 *
 * 覆盖: 本地日期 key 与 triggerId 约定; 等待写入/到期/消解/僵尸清理;
 * 同 mood 同日审计只写一次 (本地防线); 跨日自动重置; 失败回滚可重试。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMOTION_WAIT_DURATION_MS,
  _resetEmotionGuardStoreForTest,
  emotionGuardLocalDateKey,
  emotionGuardTriggerId,
  getDueEmotionWait,
  getEmotionWait,
  hasEmotionGuardAudit,
  pruneStaleEmotionWait,
  reportEmotionGuardEvent,
  resolveEmotionWait,
  saveEmotionWait,
} from '../emotion-guard-store';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('emotion-guard-store — triggerId 约定', () => {
  it('本地日期 key 为 YYYY-MM-DD (用户本地日, 非 UTC)', () => {
    expect(emotionGuardLocalDateKey(new Date(2026, 8, 9, 23, 59))).toBe('2026-09-09');
    expect(emotionGuardLocalDateKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });

  it('triggerId = emotion-guard:YYYY-MM-DD:mood', () => {
    expect(emotionGuardTriggerId('tired', '2026-09-09')).toBe('emotion-guard:2026-09-09:tired');
  });
});

describe('emotion-guard-store — 10 分钟等待 one-shot', () => {
  beforeEach(() => _resetEmotionGuardStoreForTest());
  afterEach(() => _resetEmotionGuardStoreForTest());

  it('写入等待: dueAt = now + 10min', () => {
    const now = Date.now();
    saveEmotionWait('tired', now);
    const wait = getEmotionWait();
    expect(wait?.mood).toBe('tired');
    expect(wait!.dueAt - wait!.startedAt).toBe(EMOTION_WAIT_DURATION_MS);
  });

  it('未到期 → getDueEmotionWait 为 null; 到期后返回记录', () => {
    const now = Date.now();
    saveEmotionWait('sad', now);
    expect(getDueEmotionWait(now + EMOTION_WAIT_DURATION_MS - 1000)).toBeNull();
    expect(getDueEmotionWait(now + EMOTION_WAIT_DURATION_MS + 1)?.mood).toBe('sad');
  });

  it('消解后记录清除; 新等待覆盖旧等待 (one-shot)', () => {
    const now = Date.now();
    saveEmotionWait('tired', now);
    saveEmotionWait('anxious', now + 1000);
    expect(getEmotionWait()?.mood).toBe('anxious');
    resolveEmotionWait();
    expect(getEmotionWait()).toBeNull();
  });

  it('僵尸清理: 超过 24h 未消解的等待被静默丢弃', () => {
    const now = Date.now();
    saveEmotionWait('tired', now);
    pruneStaleEmotionWait(now + 25 * 60 * 60 * 1000);
    expect(getEmotionWait()).toBeNull();
  });
});

describe('emotion-guard-store — 审计幂等 (同 mood 同日一次)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined); // 默认成功; mockRejectedValueOnce 只覆盖首次
    _resetEmotionGuardStoreForTest();
  });
  afterEach(() => _resetEmotionGuardStoreForTest());

  it('第一次写入, 同 mood 同日第二次静默跳过 (零额外上报)', () => {
    reportEmotionGuardEvent('tired', 'free_care');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    reportEmotionGuardEvent('tired', 'wait_passed');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(hasEmotionGuardAudit('tired')).toBe(true);
  });

  it('不同 mood 同日各自写一次', () => {
    reportEmotionGuardEvent('tired', 'free_care');
    reportEmotionGuardEvent('sad', 'free_care');
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('请求体红线: manual_adjustment 纯审计, metadata 只有 source/mood/choice, triggerId 正确, 零金额', () => {
    reportEmotionGuardEvent('tired', 'wait_passed');
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.method).toBe('POST');
    expect(init.body.eventType).toBe('manual_adjustment');
    expect(init.body.triggerSource).toBe('manual');
    expect(init.body.triggerId).toBe(`emotion-guard:${emotionGuardLocalDateKey()}:tired`);
    expect(init.body.metadata).toEqual({ source: 'emotion_guard', mood: 'tired', choice: 'wait_passed' });
    expect(JSON.stringify(init.body)).not.toMatch(/amount|price|saved/i);
    expect(init.body.description).not.toMatch(/\d/);
  });

  it('上报失败 → 本地记录回滚, 下次可重试', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network'));
    reportEmotionGuardEvent('tired', 'free_care');
    await vi.waitFor(() => expect(hasEmotionGuardAudit('tired')).toBe(false));
    reportEmotionGuardEvent('tired', 'free_care');
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
