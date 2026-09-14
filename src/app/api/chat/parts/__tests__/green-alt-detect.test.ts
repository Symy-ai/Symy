import { describe, expect, it } from 'vitest';

import { detectGreenAltCard, greenAltSseEvent, withGreenAltEvent } from '../green-alt-detect';
import type { GreenAltCardData } from '@/types/green-alt-card';

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
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

const payload: GreenAltCardData = {
  id: 'fur',
  why: 'Real fur carries a heavy load.',
  options: ['High-quality faux fur', 'Heavyweight fleece'],
  reuse: 'You may already have a heavy coat.',
  reuseChannel: 'Secondhand racks have plenty of warm options.',
};

describe('detectGreenAltCard (发 Letta 前关键词预检)', () => {
  it('命中: zh 查询返回卡片 payload', () => {
    const card = detectGreenAltCard('想买个貂皮围巾', 'zh', 'on');
    expect(card).not.toBeNull();
    expect(card?.id).toBe('fur');
    expect(typeof card?.why).toBe('string');
    expect(card?.options.length).toBeGreaterThanOrEqual(2);
    expect(card?.reuse).toContain('手头');
    expect(card?.reuseChannel).toContain('闲鱼'); // zh 场景给平台名
  });

  it('命中: en 查询返回 en 话术 (无中文)', () => {
    const card = detectGreenAltCard('should I get a fur coat?', 'en', 'on');
    expect(card?.id).toBe('fur');
    expect(card?.why).not.toMatch(/[\u4e00-\u9fff]/);
    expect(card?.reuseChannel).not.toMatch(/[\u4e00-\u9fff]/); // 平台名仅 zh 场景
  });

  it('命中: 二手书查询被 gifting 词条拦截 (batch53-c 起不再为 null)', () => {
    expect(detectGreenAltCard('想买一本二手书', 'zh', 'on')?.id).toBe('secondhand_book_gift');
  });

  it('未命中: 低环境影响查询返回 null (零开销)', () => {
    expect(detectGreenAltCard('a plain notebook', 'en', 'on')).toBeNull();
  });

  it('绿色守护关闭: 命中也不给卡片', () => {
    expect(detectGreenAltCard('想买个貂皮围巾', 'zh', 'off')).toBeNull();
    expect(detectGreenAltCard('buy ivory bracelet', 'en', 'off')).toBeNull();
  });

  it('开关未传 (undefined): 默认开启, 命中给卡片', () => {
    expect(detectGreenAltCard('buy ivory bracelet', 'en', undefined)?.id).toBe('ivory_bone_carving');
  });
});

describe('greenAltSseEvent', () => {
  it('产出合法 SSE data 行 (data: {...}\\n\\n)', () => {
    const text = new TextDecoder().decode(greenAltSseEvent(payload));
    expect(text.startsWith('data: ')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(true);
    const parsed = JSON.parse(text.slice(6).trim());
    expect(parsed).toEqual({ type: 'green_alt', greenAlt: payload });
  });
});

describe('withGreenAltEvent (SSE 流注入)', () => {
  it('未命中: 原样返回同一个流实例 (零包装)', () => {
    const stream = sseStream(['data: {"type":"token","content":"hi"}\n\n']);
    expect(withGreenAltEvent(stream, null)).toBe(stream);
  });

  it('命中: 流最前面是 green_alt 事件, 之后逐字节透传', async () => {
    const wrapped = withGreenAltEvent(
      sseStream(['data: {"type":"token","content":"hi"}\n\n', 'data: [DONE]\n\n']),
      payload,
    );
    const lines = (await readAll(wrapped)).split('\n\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    const first = JSON.parse(lines[0].slice('data: '.length));
    expect(first.type).toBe('green_alt');
    expect(first.greenAlt).toEqual(payload);
    expect(lines[1]).toBe('data: {"type":"token","content":"hi"}');
    expect(lines[2]).toBe('data: [DONE]');
  });
});
