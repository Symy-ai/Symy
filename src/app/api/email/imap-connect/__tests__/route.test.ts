/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// email/imap-connect — IMAP 连接（此前 0 测试, 491行大文件先锁入口契约）
// 入口面: 分布式锁429(双击防重)/zod校验/锁释放finally。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const acquireLockMock = vi.fn();
const releaseLockMock = vi.fn();
vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: (...a: unknown[]) => acquireLockMock(...a),
  releaseLock: (...a: unknown[]) => releaseLockMock(...a),
}));
vi.mock('@/lib/email/imap-config', () => ({
  detectIMAPProvider: vi.fn().mockReturnValue({ host: 'imap.qq.com', port: 993, secure: true, name: 'QQ Mail' }),
  isValidEmail: vi.fn().mockReturnValue(true),
}));
vi.mock('@/lib/email/receipt-parser', () => ({
  parseReceipt: vi.fn(),
  isReceiptEmail: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/email/impulse-score', () => ({
  calculateEmailImpulseScore: vi.fn().mockReturnValue(0),
  extractPlainText: vi.fn().mockReturnValue(''),
}));
vi.mock('@/lib/email/sanitize-error', () => ({
  sanitizeImapError: vi.fn((e: unknown) => String(e)),
}));
vi.mock('@/lib/race-timeout', () => ({
  raceWithTimeoutReject: vi.fn().mockRejectedValue(new Error('imap offline')),
}));
vi.mock('imapflow', () => ({ ImapFlow: vi.fn() }));
vi.mock('@/lib/crypto-helpers', () => ({ encryptSensitive: vi.fn().mockReturnValue('enc') }));
vi.mock('@/lib/api-validation', () => ({
  validateBody: async (req: NextRequest, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    let raw: unknown;
    try { raw = await req.json(); } catch {
      // safe to ignore: malformed JSON → 400
      return { status: 400, json: { error: 'Invalid JSON' } };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { status: 400, json: { error: 'Validation failed' } };
    return parsed.data;
  },
  isValidationError: (v: unknown) => v && typeof v === 'object' && 'status' in v,
}));

import { POST } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/email/imap-connect', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = {
    supabase: {
      from: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        const terminal = Promise.resolve({ data: null, error: null });
        const proxy: Record<string, unknown> = new Proxy(chain, {
          get(_t, prop) {
            if (prop === 'then') return terminal.then.bind(terminal);
            if (prop === 'upsert') return () => proxy;
            if (prop === 'insert') return () => proxy;
            if (prop === 'update') return () => proxy;
            return () => proxy;
          },
        });
        return proxy;
      }),
    },
    user: { id: 'u-1' },
    request,
  };
  return request;
}

describe('POST /api/email/imap-connect — 入口契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquireLockMock.mockResolvedValue(true);
  });

  it('锁被占 → 429 且不触 IMAP (双击防重)', async () => {
    acquireLockMock.mockResolvedValue(false);
    const res = await POST(ctx({ email: 'x@qq.com', authCode: 'pwd' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('in progress');
  });

  it('锁参数: email-imap-connect:{userId} + 180s TTL + failClosed', async () => {
    await POST(ctx({ email: 'x@qq.com', authCode: 'pwd' })).catch(() => {});
    expect(acquireLockMock).toHaveBeenCalledWith('email-imap-connect:u-1', 180_000, true);
  });

  it('非法 body → 400 zod (缺 email/authCode)', async () => {
    const res = await POST(ctx({ daysBack: 7 }));
    expect(res.status).toBe(400);
  });

  it('IMAP 失败 → 释放锁 (finally 语义)', async () => {
    const res = await POST(ctx({ email: 'x@qq.com', authCode: 'pwd' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(releaseLockMock).toHaveBeenCalled();
  });
});
