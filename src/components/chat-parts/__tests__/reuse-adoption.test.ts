// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.resolve({})) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  _resetReuseAdoptionForTest,
  isReuseAdoptionReported,
  reportReuseAdoption,
} from '../reuse-adoption';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

/**
 * reuse-adoption.ts (78行) — 复用采纳上报 (batch56-c, green-alt 同款)。
 *
 * 锁定:
 * - 同类目去重: 首报 reported, 重报 duplicate 零请求
 * - 本地先记账后上报 (失败静默仍 reported — UI 不阻塞)
 * - 200 条上限裁剪 (老 id 淘汰)
 * - 坏 localStorage 静默降级
 */
describe('reuse-adoption 复用采纳', () => {
  beforeEach(() => {
    _resetReuseAdoptionForTest();
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => window.localStorage.clear());

  it('首报 reported + POST body; 重报 duplicate 零请求', async () => {
    const r1 = await reportReuseAdoption('ketchup', 12);
    expect(r1.status).toBe('reported');
    expect(mockApi).toHaveBeenCalledTimes(1);
    const [url, init] = mockApi.mock.calls[0] as [string, { method?: string; body?: Record<string, unknown> }];
    expect(url).toBe('/api/reuse/adoption');
    expect(init.method).toBe('POST');
    expect(init.body).toEqual({ categoryId: 'ketchup', estSaved: 12 });

    const r2 = await reportReuseAdoption('ketchup');
    expect(r2.status).toBe('duplicate');
    expect(mockApi).toHaveBeenCalledTimes(1); // 未追加
  });

  it('isReuseAdoptionReported 反映本地账本', async () => {
    expect(isReuseAdoptionReported('lamp')).toBe(false);
    await reportReuseAdoption('lamp');
    expect(isReuseAdoptionReported('lamp')).toBe(true);
  });

  it('上报失败 → 静默仍 reported (本地已记账, UI 不阻塞)', async () => {
    mockApi.mockRejectedValueOnce(new Error('net') as never);
    const r = await reportReuseAdoption('chair', 5);
    expect(r.status).toBe('reported');
    expect(isReuseAdoptionReported('chair')).toBe(true);
  });

  it('200 条上限: 超限后老 id 被裁剪可重报', async () => {
    for (let i = 0; i < 201; i++) {
      await reportReuseAdoption(`cat-${i}`);
    }
    // cat-0 应已被裁 (201 条 → slice(-200) 保留 cat-1..cat-200)
    expect(isReuseAdoptionReported('cat-0')).toBe(false);
    expect(isReuseAdoptionReported('cat-200')).toBe(true);
  });

  it('坏 localStorage → 降级不炸', () => {
    window.localStorage.setItem('symy-reuse-adopted-ids', '{bad json');
    expect(() => isReuseAdoptionReported('x')).not.toThrow();
    expect(isReuseAdoptionReported('x')).toBe(false);
  });
});
