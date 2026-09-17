// @vitest-environment happy-dom

/**
 * useAvatarUpload tests (batch78-c — testgap v9 §十五.3 观察名单, 纯测试)
 *
 * 覆盖 (断言与现状对齐):
 *  - 类型校验拒绝: 非 PNG/JPEG/WebP/GIF MIME → avatarError 文案 + fetch 零调用 +
 *    isUploadingAvatar 全程 false + input value 复位
 *  - 大小校验拒绝: > 5MB → 文案 + fetch 零调用; 恰好 5MB 边界通过 (`>` 严格大于,
 *    与 API 口径一致)
 *  - 上传失败回滚不留脏状态: res!ok / 网络异常 → finally 复位 isUploadingAvatar,
 *    localAvatarUrl 不落脏值 (effectiveAvatarUrl 回退 user_metadata.avatar_url),
 *    input 复位允许重传同一文件
 *  - 错误消息回退链: 服务端 error 字段优先 → json 不可解析时 `Upload failed (${status})`
 *  - 成功对照: localAvatarUrl 立即生效 (不等 onAuthStateChange 回流)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { useAvatarUpload } from '../use-avatar-upload';

const fetchMock = vi.hoisted(() => vi.fn());

const authMock = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: { avatar_url: 'https://cdn.test/old.png' } },
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => authMock,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown> & { defaultValue?: string }) =>
      values?.defaultValue ?? key,
    locale: 'en',
  }),
}));

const loggerErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: { error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

const OLD_AVATAR_URL = 'https://cdn.test/old.png';

/** 构造 change 事件; size 用 defineProperty 覆盖, 免建 5MB 真 buffer */
function fileEvent(type: string, size: number): ChangeEvent<HTMLInputElement> {
  const file = new File(['x'], 'avatar.bin', { type });
  Object.defineProperty(file, 'size', { value: size });
  return {
    target: { files: [file], value: 'C:\\fake\\avatar.bin' },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

describe('useAvatarUpload 客户端校验拒绝分支', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('非白名单 MIME → 拒绝文案, fetch 零调用, 不进入上传态, input 复位', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    const ev = fileEvent('image/svg+xml', 100);

    await act(async () => {
      await result.current.handleAvatarUpload(ev);
    });

    expect(result.current.avatarError).toBe('Please select a PNG, JPEG, WebP, or GIF image');
    expect(result.current.isUploadingAvatar).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ev.target.value).toBe('');
    expect(result.current.effectiveAvatarUrl).toBe(OLD_AVATAR_URL);
  });

  it('> 5MB → 超限文案, fetch 零调用, input 复位', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    const ev = fileEvent('image/png', 5 * 1024 * 1024 + 1);

    await act(async () => {
      await result.current.handleAvatarUpload(ev);
    });

    expect(result.current.avatarError).toBe('Image must be under 5MB');
    expect(result.current.isUploadingAvatar).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ev.target.value).toBe('');
  });

  it('恰好 5MB 边界通过校验 (`>` 严格大于), 进入上传', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => ({ success: true, avatarUrl: 'https://cdn.test/new.png' }),
    });
    const ev = fileEvent('image/png', 5 * 1024 * 1024);

    await act(async () => {
      await result.current.handleAvatarUpload(ev);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.avatarError).toBeNull();
  });
});

describe('useAvatarUpload 上传失败回滚 (不留脏状态)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('res !ok → finally 复位上传态, localAvatarUrl 不落脏值 (回退 user_metadata), input 复位', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    // json 桩须返回 Promise 对齐真实 Response (生产走 res.json().catch)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: () => Promise.resolve({ error: 'Payload too large' }),
    });
    const ev = fileEvent('image/png', 100);

    await act(async () => {
      await result.current.handleAvatarUpload(ev);
    });

    expect(result.current.isUploadingAvatar).toBe(false);
    expect(result.current.avatarError).toBe('Payload too large');
    expect(result.current.effectiveAvatarUrl).toBe(OLD_AVATAR_URL);
    expect(ev.target.value).toBe('');
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('错误 json 不可解析 → 回退 `Upload failed (${status})` 文案', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    });

    await act(async () => {
      await result.current.handleAvatarUpload(fileEvent('image/png', 100));
    });

    expect(result.current.avatarError).toBe('Upload failed (500)');
    expect(result.current.effectiveAvatarUrl).toBe(OLD_AVATAR_URL);
  });

  it('在途 isUploadingAvatar=true; 网络异常落地后复位且不抛出', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    let rejectFn!: (err: unknown) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFn = reject; }),
    );
    const ev = fileEvent('image/png', 100);

    let upload!: Promise<void>;
    act(() => {
      upload = result.current.handleAvatarUpload(ev);
    });
    await waitFor(() => expect(result.current.isUploadingAvatar).toBe(true));

    await act(async () => {
      rejectFn(new Error('Network down'));
      await upload; // hook 内部 catch, 不向调用方抛
    });

    expect(result.current.isUploadingAvatar).toBe(false);
    expect(result.current.avatarError).toBe('Network down');
    expect(result.current.effectiveAvatarUrl).toBe(OLD_AVATAR_URL);
  });
});

describe('useAvatarUpload 成功路径 (失败回滚的对照组)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('成功 → localAvatarUrl 立即生效, 无错误, 上传态复位, input 复位可重传', async () => {
    const { result } = renderHook(() => useAvatarUpload());
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => ({ success: true, avatarUrl: 'https://cdn.test/new.png' }),
    });
    const ev = fileEvent('image/png', 100);

    await act(async () => {
      await result.current.handleAvatarUpload(ev);
    });

    expect(result.current.effectiveAvatarUrl).toBe('https://cdn.test/new.png');
    expect(result.current.avatarError).toBeNull();
    expect(result.current.isUploadingAvatar).toBe(false);
    expect(ev.target.value).toBe('');
  });
});
