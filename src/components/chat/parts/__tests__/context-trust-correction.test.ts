// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { readTrustCorrections, reportTrustCorrection } from '../context-trust-correction';

/**
 * context-trust-correction.ts (57行) — 上下文信任卡纠错上报。
 *
 * 锁定:
 * - read: 坏 JSON/非数组/坏元素 → [] (防御式过滤)
 * - report: 本地留痕 (sessionStorage) + 远端上报 (health-events)
 * - 本地留痕裁剪至 LOG_LIMIT=20
 * - 远端失败 → 静默 (warn), 本地已留痕不回滚
 */
describe('readTrustCorrections 防御式读取', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    apiFetchMock.mockClear();
  });

  it('空/坏 JSON/非数组 → []', () => {
    expect(readTrustCorrections()).toEqual([]);
    window.sessionStorage.setItem('symy-context-trust-corrections', '{bad json');
    expect(readTrustCorrections()).toEqual([]);
    window.sessionStorage.setItem('symy-context-trust-corrections', '"a string"');
    expect(readTrustCorrections()).toEqual([]);
  });

  it('坏元素被滤掉, 合法元素保留', () => {
    window.sessionStorage.setItem('symy-context-trust-corrections', JSON.stringify([
      { signalId: 's1', reason: 'not_me', at: 1 },
      null,
      { signalId: 123, reason: 'x', at: 2 },
      'garbage',
      { signalId: 's2', reason: 'different_context', at: 3 },
    ]));
    const out = readTrustCorrections();
    expect(out).toHaveLength(2);
    expect(out[0].signalId).toBe('s1');
    expect(out[1].signalId).toBe('s2');
  });
});

describe('reportTrustCorrection 上报', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    apiFetchMock.mockClear();
  });

  it('本地留痕 + 远端上报 (health-events, metadata 带 signalId/reason)', async () => {
    await reportTrustCorrection('sig-1', 'not_me');
    const stored = readTrustCorrections();
    expect(stored).toHaveLength(1);
    expect(stored[0].signalId).toBe('sig-1');
    expect(stored[0].reason).toBe('not_me');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0] as unknown as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.method).toBe('POST');
    expect(init.body.eventType).toBe('manual_adjustment');
    expect((init.body.metadata as { signalId: string }).signalId).toBe('sig-1');
  });

  it('远端失败 → 静默; 本地留痕不回滚', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(reportTrustCorrection('sig-2', 'different_context')).resolves.toBeUndefined();
    expect(readTrustCorrections()).toHaveLength(1); // 本地已留痕
  });

  it('LOG_LIMIT=20 裁剪', async () => {
    apiFetchMock.mockClear();
    for (let i = 0; i < 25; i++) {
      await reportTrustCorrection(`sig-${i}`, 'not_me');
    }
    const stored = readTrustCorrections();
    expect(stored).toHaveLength(20);
    expect(stored[0].signalId).toBe('sig-5'); // 头部裁掉最早 5 条
    expect(stored[19].signalId).toBe('sig-24');
  });
});
