import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  isReflection: vi.fn(() => false),
  cannedReply: vi.fn(() => '这个答案只有你自己知道，试试写下第一反应'),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../reflection-detector', () => ({
  isReflectionQuestion: M.isReflection,
  getReflectionCannedReply: M.cannedReply,
}));

import { tryReflectionBlock } from '../reflection-block';

const baseInput = {
  userContent: '我买这个东西是为了填补什么空虚？',
  locale: 'zh' as const,
  stream: false,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * reflection-block.ts (60行) — P0-1 反思问题短路 (b137 拆解第十二刀)。
 *
 * 背景: mirror persona 不问探究性问题 → 反思问题 60s 无响应 → canned 引导自答。
 *
 * 锁定:
 * - 非反思问题 → null (链序不变)
 * - 命中 → JSON canned reply (无卡, 只有 reply)
 * - 命中 → SSE: 分块 token 流 (15 字/块) + done 终结
 */
describe('tryReflectionBlock (反思问题)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.isReflection.mockReturnValue(false);
    M.cannedReply.mockReturnValue('这个答案只有你自己知道，试试写下第一反应');
  });

  it('非反思问题 → null', async () => {
    expect(await tryReflectionBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON canned reply (locale 传递)', async () => {
    M.isReflection.mockReturnValueOnce(true);
    const r = await tryReflectionBlock(baseInput as never);
    expect(r).toBeInstanceOf(Response);
    const body = await (r as Response).json();
    expect(body.reply).toBe('这个答案只有你自己知道，试试写下第一反应');
    expect(M.cannedReply).toHaveBeenCalledWith('zh');
  });

  it('命中 → SSE 分块 token 流+done 终结', async () => {
    M.isReflection.mockReturnValueOnce(true);
    const r = await tryReflectionBlock({ ...baseInput, stream: true } as never);
    expect(r?.headers.get('content-type')).toBe('text/event-stream');
    const text = await r?.text();
    const events = text?.split('\n\n').filter((l) => l.startsWith('data: ')) ?? [];
    // 22 字回复 → ceil(22/15)=2 token 块 + 1 done
    expect(events.length).toBe(3);
    const first = JSON.parse(events[0].slice(6));
    expect(first.type).toBe('token');
    expect(first.content.length).toBe(15); // 15 字/块
    const last = JSON.parse(events[events.length - 1].slice(6));
    expect(last).toEqual({ type: 'done' }); // 终结事件
  });

  it('超长回复 → 每块恒 15 字+完整拼接还原', async () => {
    M.isReflection.mockReturnValueOnce(true);
    const long = '一'.repeat(47); // 47 字 → 4 块
    M.cannedReply.mockReturnValueOnce(long);
    const r = await tryReflectionBlock({ ...baseInput, stream: true } as never);
    const text = await r?.text();
    const tokens = text?.split('\n\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)))
      .filter((e) => e.type === 'token') ?? [];
    expect(tokens.length).toBe(4);
    expect(tokens.map((t: { content: string }) => t.content).join('')).toBe(long); // 完整还原
  });
});
