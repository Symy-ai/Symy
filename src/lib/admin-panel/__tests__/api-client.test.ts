// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adminDelete,
  adminFetch,
  adminGet,
  adminPatch,
  adminPost,
  clearAdminKey,
  getAdminKey,
  registerUnauthorizedCallback,
  setAdminKey,
} from '../api-client';

/**
 * api-client.ts (158行) — Admin API 客户端封装。
 *
 * 锁定:
 * - sessionStorage key 管理 (get/set/clear)
 * - Authorization Bearer 自动附加
 * - body 存在 → Content-Type json
 * - 401 → 自动登出 + 回调触发 + 中文错误
 * - 403 → 不登出 (key 保留)
 * - 非 ok → error 字段透传 (data.error 优先)
 * - JSON 解析失败 → text 原样
 * - 网络异常 → status 0 + 网络错误前缀
 * - 四便捷方法 (GET/POST/PATCH/DELETE)
 */
describe('admin api-client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('key 管理', () => {
    it('set/get/clear 往返', () => {
      expect(getAdminKey()).toBeNull();
      setAdminKey('k-123');
      expect(getAdminKey()).toBe('k-123');
      clearAdminKey();
      expect(getAdminKey()).toBeNull();
    });
  });

  describe('adminFetch', () => {
    it('自动附加 Bearer + body 自动 Content-Type', async () => {
      setAdminKey('my-key');
      const fetchMock = vi.fn(() => Promise.resolve({
        ok: true, status: 200, text: () => Promise.resolve('{"x":1}'),
      })) as unknown as typeof fetch;
      vi.stubGlobal('fetch', fetchMock);
      await adminFetch('/api/admin/x', { method: 'POST', body: '{"a":1}' });
      const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer my-key',
        'Content-Type': 'application/json',
      });
      vi.unstubAllGlobals();
    });

    it('401 → 自动登出 + 回调 + 中文错误', async () => {
      setAdminKey('stale');
      const cb = vi.fn();
      registerUnauthorizedCallback(cb);
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
        ok: false, status: 401, text: () => Promise.resolve(''),
      })) as unknown as typeof fetch);
      const res = await adminFetch('/api/admin/x');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('认证失败，已自动登出');
      expect(getAdminKey()).toBeNull(); // key 已清
      expect(cb).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it('403 → 不登出 (key 保留)', async () => {
      setAdminKey('valid');
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
        ok: false, status: 403, text: () => Promise.resolve('{"error":"forbidden"}'),
      })) as unknown as typeof fetch);
      const res = await adminFetch('/api/admin/x');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('forbidden');
      expect(getAdminKey()).toBe('valid'); // 未清
      vi.unstubAllGlobals();
    });

    it('非 JSON 响应 → text 原样入 data', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
        ok: true, status: 200, text: () => Promise.resolve('plain text'),
      })) as unknown as typeof fetch);
      const res = await adminFetch<string>('/api/admin/x');
      expect(res.data).toBe('plain text');
      vi.unstubAllGlobals();
    });

    it('网络异常 → status 0 + 网络错误前缀', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch);
      const res = await adminFetch('/api/admin/x');
      expect(res.ok).toBe(false);
      expect(res.status).toBe(0);
      expect(res.error).toContain('网络错误');
      expect(res.error).toContain('ECONNREFUSED');
      vi.unstubAllGlobals();
    });
  });

  describe('四便捷方法', () => {
    it('adminGet 无 body 无 Content-Type; adminPost 序列化; PATCH/DELETE 方法正确', async () => {
      const calls: Array<[string, RequestInit]> = [];
      vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
        calls.push([path, init ?? {}]);
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
      }) as unknown as typeof fetch);
      await adminGet('/g');
      await adminPost('/p', { a: 1 });
      await adminPatch('/pa', { b: 2 });
      await adminDelete('/d');
      expect(calls[0][1].method).toBe('GET');
      expect(calls[0][1].headers).toEqual({});
      expect(calls[1][1].method).toBe('POST');
      expect(calls[1][1].body).toBe('{"a":1}');
      expect(calls[2][1].method).toBe('PATCH');
      expect(calls[3][1].method).toBe('DELETE');
      vi.unstubAllGlobals();
    });
  });
});
