// @vitest-environment node

/**
 * reuse-detect 服务端测试 — detectReuseHint 的 locale 收窄/时薪透传 +
 * prependReuseHintEvent 的 SSE 注入顺序 (事件在最前, 原字节透传, cancel 传播)。
 */

import { describe, expect, it } from 'vitest';
import { detectReuseHint, prependReuseHintEvent, reuseHintSseEvent, toReuseLocale } from '../reuse-detect';

describe('toReuseLocale', () => {
  it('收窄任意 locale 字符串到 zh/en 枚举 (缺省 en)', () => {
    expect(toReuseLocale('zh')).toBe('zh');
    expect(toReuseLocale('zh-CN')).toBe('en');
    expect(toReuseLocale(undefined)).toBe('en');
  });
});

describe('detectReuseHint', () => {
  it('zh 电钻命中 (guard on 时路由调用形态)', () => {
    const hint = detectReuseHint('想买个电钻', 'zh', 30);
    expect(hint?.category).toBe('tool_rental');
    expect(hint?.hoursLabel).toBe('约省 3.2 小时自由时间');
  });

  it('en power drill 命中', () => {
    expect(detectReuseHint('thinking about a power drill', 'en')?.category).toBe('tool_rental');
  });

  it('未命中 (水杯) → null', () => {
    expect(detectReuseHint('想买个水杯', 'zh')).toBeNull();
  });
});

describe('prependReuseHintEvent — SSE 注入顺序', () => {
  function sseBytes(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
        else controller.close();
      },
    });
  }

  async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out;
  }

  it('reuse_hint 事件在字节流最前, Letta 原生事件原样透传在后', async () => {
    const hint = detectReuseHint('想买个电钻', 'zh')!;
    const upstream = sseBytes([
      'data: {"type":"token","content":"你好"}\n\n',
      'data: {"type":"token","content":"！"}\n\n',
      'data: [DONE]\n\n',
    ]);
    const out = await collect(prependReuseHintEvent(upstream, reuseHintSseEvent(hint)));

    const lines = out.split('\n\n').filter(Boolean);
    // 第一个事件必须是 reuse_hint, 且 hint 完整可解析
    expect(lines[0].startsWith('data: ')).toBe(true);
    const first = JSON.parse(lines[0].slice(6));
    expect(first.type).toBe('reuse_hint');
    expect(first.hint.category).toBe('tool_rental');
    expect(first.hint.hoursLabel).toContain('自由时间');
    // 后续字节原样透传
    expect(lines[1]).toBe('data: {"type":"token","content":"你好"}');
    expect(lines[2]).toBe('data: {"type":"token","content":"！"}');
    expect(lines[3]).toBe('data: [DONE]');
  });

  it('上游错误 (lock 竞争场景) 不向下游抛未捕获异常', async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('upstream boom'));
      },
    });
    const out = await collect(prependReuseHintEvent(upstream, reuseHintSseEvent(detectReuseHint('买教材', 'zh')!)));
    expect(out).toContain('reuse_hint');
  });
});
