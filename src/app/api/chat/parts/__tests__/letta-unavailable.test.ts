/**
 * letta-unavailable — 刀20 相位级单测
 *
 * mock 边界 = mergeCookies (恒等包装)。断言 hasAuth 两态: 未登录 401 / 已登录 503，
 * 文案逐字锁定（拆相位前后字节等价的核心契约）。模式抄 daily-limit-guard.test.ts。
 */
import { describe, expect, it, vi } from 'vitest';

import { lettaUnavailableResponse } from '../letta-unavailable';

const identity = <T extends object>(res: T): T => res;

describe('letta-unavailable', () => {
  it('未登录 (hasAuth=false) → 401 Authentication required', async () => {
    const response = lettaUnavailableResponse(false, identity);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required. Please sign in to chat with Symy.' });
  });

  it('已登录 (hasAuth=true) → 503 AI service temporarily unavailable', async () => {
    const response = lettaUnavailableResponse(true, identity);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'AI service temporarily unavailable. Please try again.' });
  });

  it('mergeCookies 包装被调用一次 (cookie 回写语义不丢)', () => {
    const mergeCookies = vi.fn((res: object) => res) as never;
    lettaUnavailableResponse(false, mergeCookies);
    expect(mergeCookies).toHaveBeenCalledTimes(1);
  });
});
