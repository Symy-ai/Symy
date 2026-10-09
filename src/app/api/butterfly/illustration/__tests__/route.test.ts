import { beforeEach, describe, expect, it, vi } from 'vitest';

let _body: unknown = { sessionId: '11111111-1111-1111-1111-111111111111', chapterIndex: 1 };
let _row: unknown = {
  id: 'sess-1',
  decisionDescription: 'desc',
  decisionType: 'what_if',
  chapters: [
    { index: 0, title: 'Ch0', tone: 'hopeful', timeSpan: '2026', content: 'aaa' },
    { index: 1, title: 'Ch1', tone: 'calm', timeSpan: '2027', content: 'bbb'.repeat(300) },
  ],
};

const M = vi.hoisted(() => ({
  checkRateLimit: vi.fn((): Promise<{ allowed: boolean }> => Promise.resolve({ allowed: true })),
  generate: vi.fn((_input: Record<string, unknown>): Promise<string | null> => Promise.resolve('https://sb.test/img.png')),
  dbToSession: vi.fn(),
}));

const captured = vi.hoisted(() => ({ handler: undefined as ((args: unknown) => unknown) | undefined }));
vi.mock('@/lib/with-auth', () => ({
  withAuth: (fn: (args: unknown) => unknown) => {
    captured.handler = fn; // 捕获被包裹的 handler 供测试直接调用
    return fn;
  },
}));
vi.mock('@/lib/distributed-lock', () => ({ checkRateLimit: M.checkRateLimit }));
vi.mock('@/features/butterfly/lib/illustration-engine', () => ({
  generateAndPersistIllustration: M.generate,
}));
vi.mock('@/features/butterfly/lib/db-mappers', () => ({ dbToSession: M.dbToSession }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api-validation', () => ({
  // 简化: 由测试注入 body (_body 模块级 let)
  validateBody: vi.fn((_req: unknown, _schema: unknown) => Promise.resolve(_body)),
  isValidationError: () => false,
}));
_body = { sessionId: '11111111-1111-1111-1111-111111111111', chapterIndex: 1 };

import { POST } from '../route';

function makeArgs(over: Partial<Record<string, unknown>> = {}) {
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  _row === null
                    ? { data: null, error: null }
                    : { data: _row, error: null },
                ),
            }),
          }),
        }),
      }),
    },
    user: { id: 'u1' },
    request: {},
    ...over,
  };
}
/**
 * butterfly/illustration route (119行) — 章节插图再生 (Round 24 H3 限额+C3 所有权)。
 *
 * 锁定:
 * - 限流 429 (30/h, Round 24 H3 — OpenAI 配额防线)
 * - 会话不存在/非本人 → 403
 * - 章节不存在 → 404
 * - 成功 → illustrationUrl; 生成失败 → null 优雅降级 (故事不受影响)
 */
describe('POST /api/butterfly/illustration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _body = { sessionId: '11111111-1111-1111-1111-111111111111', chapterIndex: 1 };
    _row = {
      id: 'sess-1',
      decisionDescription: 'desc',
      decisionType: 'what_if',
      chapters: [
        { index: 0, title: 'Ch0', tone: 'hopeful', timeSpan: '2026', content: 'aaa' },
        { index: 1, title: 'Ch1', tone: 'calm', timeSpan: '2027', content: 'bbb'.repeat(300) },
      ],
    };
    M.checkRateLimit.mockResolvedValue({ allowed: true });
    M.generate.mockResolvedValue('https://sb.test/img.png');
    M.dbToSession.mockImplementation((row: unknown) => row);
  });

  it('限流 → 429 (Round 24 H3 配额防线)', async () => {
    M.checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const res = (await POST(makeArgs() as never)) as Response;
    expect(res.status).toBe(429);
    expect(M.generate).not.toHaveBeenCalled();
    // key 形状: 按用户隔离
    expect(M.checkRateLimit).toHaveBeenCalledWith('illust-auth:u1', 30, 3600_000);
  });

  it('会话不存在/非本人 → 403', async () => {
    _row = null;
    const res = (await POST(makeArgs() as never)) as Response;
    expect(res.status).toBe(403);
  });

  it('章节不存在 → 404', async () => {
    _body = { sessionId: '11111111-1111-1111-1111-111111111111', chapterIndex: 99 };
    const res = (await POST(makeArgs() as never)) as Response;
    expect(res.status).toBe(404);
  });

  it('成功 → illustrationUrl + 内容截 500 字传引擎', async () => {
    _body = { sessionId: '11111111-1111-1111-1111-111111111111', chapterIndex: 1 };
    const res = (await POST(makeArgs() as never)) as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).illustrationUrl).toBe('https://sb.test/img.png');
    const call = M.generate.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(String(call.contentSnippet).length).toBeLessThanOrEqual(500);
    expect(call.title).toBe('Ch1');
  });

  it('生成失败 → null 优雅降级 (故事不受影响)', async () => {
    M.generate.mockRejectedValueOnce(new Error('zai down'));
    const res = (await POST(makeArgs() as never)) as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).illustrationUrl).toBeNull();
  });
});
