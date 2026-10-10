import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sse', () => ({
  sendSSEData: vi.fn((controller: { enqueue: (c: unknown) => void }, event: unknown) => {
    // ReadableStream<Uint8Array> 须字节块 (真 sse 同款 TextEncoder)
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  }),
  closeSSE: vi.fn((controller: { close: () => void }) => controller.close()),
}));

import { createSSEStream } from '../create-sse-stream';

/**
 * create-sse-stream.ts (32行) — Butterfly story 共享 SSE helper (Round 79 拆分)。
 *
 * 锁定:
 * - send 代理: 每次调用即写一条事件
 * - onTick 完成后 closeSSE 关流 (单事件自动关闭契约)
 * - 返回 ReadableStream (真流读取还原全序)
 */
describe('createSSEStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('单事件流: send→close 全序', async () => {
    const stream = createSSEStream(async (send) => {
      await Promise.resolve(send({ type: 'story_complete', data: { summary: 'done' } }));
    });
    const text = await new Response(stream).text();
    expect(text).toContain('story_complete');
    expect(text).toContain('done');
    const { closeSSE } = await import('@/lib/sse');
    expect(closeSSE).toHaveBeenCalledTimes(1);
  });

  it('多事件保序: N 次 send 按调用序写入', async () => {
    const stream = createSSEStream(async (send) => {
      await Promise.resolve();
      send({ type: 'chapter' as never, data: 1 });
      send({ type: 'chapter' as never, data: 2 });
      send({ type: 'choice' as never, data: 3 });
    });
    const text = await new Response(stream).text();
    const events = text.split('\n\n').filter((l) => l.startsWith('data: '));
    expect(events).toHaveLength(3);
    expect(JSON.parse(events[0].slice(6)).data).toBe(1);
    expect(JSON.parse(events[2].slice(6)).data).toBe(3);
  });

  it('零事件: 直接关流', async () => {
    const stream = createSSEStream(async () => {});
    const text = await new Response(stream).text();
    expect(text).toBe('');
    const { closeSSE } = await import('@/lib/sse');
    expect(closeSSE).toHaveBeenCalledTimes(1);
  });
});
