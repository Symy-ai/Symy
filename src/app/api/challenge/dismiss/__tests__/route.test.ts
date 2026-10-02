/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// challenge dismiss + resume — 挑战关闭/恢复（此前 0 测试）
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));

const dismissChallengeMock = vi.fn();
const resumeChallengeMock = vi.fn();
vi.mock('@/lib/challenge-store', () => ({
  dismissChallenge: (...a: unknown[]) => dismissChallengeMock(...a),
  resumeChallenge: (...a: unknown[]) => resumeChallengeMock(...a),
}));
vi.mock('@/lib/api-validation', () => ({
  validateBody: async (req: NextRequest, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    let raw: unknown;
    try { raw = await req.json(); } catch {
      // safe to ignore: malformed JSON → 400 (复制 api-validation 真实实现的注释语义)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    return parsed.data;
  },
  isValidationError: (v: unknown) => v instanceof NextResponse,
}));

import { POST as dismissPOST } from '../route';
import { POST as resumePOST } from '../../resume/route';

function ctx(body: unknown, method = 'POST') {
  const request = new NextRequest('http://localhost/api/challenge/x', {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: {}, user: { id: 'u-1' }, request };
  return request;
}

describe('POST /api/challenge/dismiss', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法 id → success true 且以 (id, userId) 调 store', async () => {
    dismissChallengeMock.mockResolvedValue({ success: true });
    const res = await dismissPOST(ctx({ challengeId: 'ch-9' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(dismissChallengeMock).toHaveBeenCalledWith('ch-9', 'u-1');
  });

  it('缺 challengeId → 400', async () => {
    const res = await dismissPOST(ctx({}));
    expect(res.status).toBe(400);
    expect(dismissChallengeMock).not.toHaveBeenCalled();
  });

  it('store 失败 → 500 带 error', async () => {
    dismissChallengeMock.mockResolvedValue({ success: false, error: 'gone' });
    const res = await dismissPOST(ctx({ challengeId: 'ch-9' }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/challenge/resume', () => {
  beforeEach(() => vi.clearAllMocks());

  it('恢复成功 → snake_case→camelCase 映射返回', async () => {
    resumeChallengeMock.mockResolvedValue({
      success: true,
      challenge: { id: 'ch-7', item_name: '耳机', amount: 99, challenge_type: '24h' },
    });
    const res = await resumePOST(ctx({ challengeId: 'ch-7' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      challenge: { challengeId: 'ch-7', itemName: '耳机', amount: 99, challengeType: '24h' },
    });
  });

  it('挑战为 null → 500', async () => {
    resumeChallengeMock.mockResolvedValue({ success: true, challenge: null });
    const res = await resumePOST(ctx({ challengeId: 'ch-x' }));
    expect(res.status).toBe(500);
  });

  it('非法 body → 400', async () => {
    const res = await resumePOST(ctx('{bad'));
    expect(res.status).toBe(400);
  });
});
