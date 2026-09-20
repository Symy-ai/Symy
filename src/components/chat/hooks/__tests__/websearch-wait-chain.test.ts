/**
 * batch104-b — websearch 等待链路组合态压力测试 (纯测试, 不改产品源码)
 *
 * b80-a 修过空 SSE 流空气泡、b98-a 修过等待话术 {query} 插值, 但「搜索等待 →
 * 结果返回 → 中断 → 恢复」全链路的组合态没有系统性锁定 (单点修过, 链路没锁)。
 * 本文件把 服务端注入 (withWebSearchWaitEvent) 与 客户端消费 (consumeAIStream)
 * 接成真链路 — 注入的 canned token 按真实 SSE 字节流进消费器 — 逐组合态断言
 * 用户可见文案:
 *
 *   A. 等待话术出现 → 正常结果返回: 等待话术与 LLM 文本同气泡拼接, 卡片通道照常
 *   B. 等待 → 流中断 (error 事件): 兜底文案替换等待话术 (error 态恢复入口 onRetry);
 *      中断后迟到的 LLM token 不得再写进回复 (恢复由 retry 接管, 幽灵流截断)
 *   C. 等待 → 60s 断流超时: 等待话术非空 → streamInterrupted 兜底分支被抑制
 *      (现状行为钉死, 终态=等待话术, 见 /tmp/b104b-result.md 观察项);
 *      对照组: 无等待话术的超时 → 兜底分支命中 (b80-a 保护语义)
 *   D. query 空双形态 (98-a) 过全链: 无词降级文案 + {query} 零残留,
 *      且与结果返回 / error 中断两态再组合
 *   E. MCP 前缀工具名 (mcp__symy-hands__symy_search) 走同一条链
 *
 * 接线红线: onError/onToken 的消费方式镜像 use-chat-actions.ts sendMessage 与
 * retry-ai-response.ts 的真实接线 (errorContent = rawContent ||
 * chat.aiFallback.connectionInterrupted, 返回 true break 出流循环); 兜底文案值
 * 从真词典 (zh/en json) 取, 与运行时 t() 同源 — 词典缺失即用户看到 key 本身,
 * 故 key 存在性也一并钉死 (与 b98-a 的守卫风格一致)。
 */

import { describe, expect, it, vi } from 'vitest';
import { consumeAIStream, type ConsumeAIStreamCallbacks } from '../consume-ai-stream';
import { withWebSearchWaitEvent } from '@/app/api/chat/parts/websearch-wait-stream';
import { buildWebSearchWaitTurn } from '@/lib/websearch-wait-turn';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';
import type { ProductCardData } from '@/types/product-card';

interface ChainDict {
  aiFallback: { connectionInterrupted: string; streamInterrupted: string; hereForYou: string };
  websearch: { waiting: string };
}

const dictOf = (locale: 'zh' | 'en'): ChainDict =>
  ((locale === 'zh' ? zh : en) as { chat: ChainDict }).chat;

/** mock 工具返回按 product-tool-result.ts 既有形状 (letta.ts tool_result SSE 事件) */
const card = (ref: string): ProductCardData => ({
  product_ref: ref,
  title: `商品${ref}`,
  price_cents: 9900,
  currency: 'CNY',
});

const fallbackContent = (cards: ProductCardData[]) =>
  JSON.stringify({ data_source: 'websearch', data: { cards } });

const toolResultEvent = (content: string, tool = 'symy_search') => ({ type: 'tool_result', tool, content });

/**
 * pull 型 SSE 源。stall=true 时事件发完既不 close 也不 enqueue —
 * 模拟 Letta 卡死 (消费端只能靠 60s idle timeout 脱困)。
 */
function sseStream(events: unknown[], stall = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = encoder.encode(payload);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        if (!stall) controller.close();
        return;
      }
      controller.enqueue(bytes);
      offset = bytes.length;
    },
  });
}

/**
 * 消费侧接线 — 镜像 sendMessage / retryAiResponse 的真实消费方式:
 * onToken 直接更新气泡 (略去 rAF 节流, 终值一致); onError 按
 * `rawContent || chat.aiFallback.connectionInterrupted` 兜底并返回 true break。
 */
function wireConsumer(locale: 'zh' | 'en') {
  const state = {
    /** 到达顺序的 token 全集 (等待话术 vs LLM 文本 vs 幽灵 token) */
    tokens: [] as string[],
    /** 气泡当前内容 (onToken 累积镜像) */
    bubble: '',
    /** error 兜底后气泡文案 (isError=true 时用户实际看到的话) */
    errorBubbleCopy: '',
    errorRawContent: null as string | null | undefined,
    isError: false,
    cards: [] as ProductCardData[],
  };
  const callbacks: ConsumeAIStreamCallbacks = {
    onToken: (token, accumulatedReply) => {
      state.tokens.push(token);
      state.bubble = accumulatedReply;
    },
    onProductCards: (cards) => {
      state.cards = cards;
    },
    onError: (rawContent) => {
      state.errorRawContent = rawContent ?? null;
      state.isError = true;
      state.errorBubbleCopy = rawContent || dictOf(locale).aiFallback.connectionInterrupted;
      return true; // 与 sendMessage / retryAiResponse 一致: break 出 for + while 循环
    },
  };
  return { callbacks, state };
}

const QUERY = '不锈钢吸管';

describe('A. 等待话术出现 → 正常结果返回 (同气泡拼接 + 卡片通道)', () => {
  it('zh: 等待话术先到, LLM 文本随后拼接, {query} 插值自真词典, 卡片照常出', async () => {
    const turn = buildWebSearchWaitTurn(QUERY, 'zh');
    const answer = '这三款都符合你的要求：';
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: answer },
      { type: 'done' },
    ];
    const { callbacks, state } = wireConsumer('zh');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    // 到达顺序: 等待话术是流中第一个用户可见 token, 先于 LLM 文本
    expect(state.tokens).toEqual([turn.reply, answer]);
    // 用户可见文案 = 真词典插值形态 + LLM 文本同气泡拼接 (现状无分隔符)
    expect(result.reply).toBe(dictOf('zh').websearch.waiting.replace('{query}', QUERY) + answer);
    expect(result.reply).toContain(`「${QUERY}」`);
    expect(result.reply).not.toContain('{query}');
    // 正常态: 无 error; idleTimeout 标志在正常 done 时也置位 (含义=循环经 done 退出),
    // 调用方只看 `idleTimeout && !reply.trim()` 分支 → 有内容时不进超时兜底
    expect(result.errorDisplayed).toBe(false);
    expect(result.idleTimeout && !result.reply.trim()).toBe(false);
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]?.product_ref).toBe('p1');
  });

  it('en: 同一组合态, en 词典插值形态', async () => {
    const turn = buildWebSearchWaitTurn('straw', 'en');
    const answer = 'Here is what I found:';
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: answer },
      { type: 'done' },
    ];
    const { callbacks, state } = wireConsumer('en');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    expect(state.tokens).toEqual([turn.reply, answer]);
    expect(result.reply).toBe(dictOf('en').websearch.waiting.replace('{query}', 'straw') + answer);
    expect(result.reply).toContain('"straw"');
    expect(result.reply).not.toContain('{query}');
    expect(state.cards).toHaveLength(1);
  });
});

describe('B. 等待 → 流中断 (error 态恢复): 兜底文案替换等待话术', () => {
  it('zh: error 事件 content=null → 气泡替换为词典 connectionInterrupted, 迟到 token 被截断', async () => {
    const turn = buildWebSearchWaitTurn(QUERY, 'zh');
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'error', content: null },
      // 中断后迟到的 LLM token: 恢复由 onRetry → retryAiResponse 全新请求接管,
      // 幽灵流不得再往回复里写字
      { type: 'token', content: '迟到的幽灵文本' },
    ];
    const { callbacks, state } = wireConsumer('zh');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    // 等待话术先出现 (用户先看到等待), 随后被 error 兜底替换
    expect(state.tokens).toEqual([turn.reply]);
    expect(state.isError).toBe(true);
    expect(state.errorBubbleCopy).toBe(dictOf('zh').aiFallback.connectionInterrupted);
    expect(result.errorDisplayed).toBe(true);
    // errorDisplayed → 调用方跳过 finalMsg; 幽灵 token 未进回复
    expect(result.reply).toBe(turn.reply);
    expect(result.reply).not.toContain('幽灵');
  });

  it('en: error 事件自带 content → 服务端文案原样透传优先于词典兜底', async () => {
    const turn = buildWebSearchWaitTurn('straw', 'en');
    const serverErrorCopy = 'AI is overloaded, please retry shortly.';
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'error', content: serverErrorCopy },
    ];
    const { callbacks, state } = wireConsumer('en');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    expect(state.tokens).toEqual([turn.reply]);
    expect(state.errorRawContent).toBe(serverErrorCopy);
    expect(state.errorBubbleCopy).toBe(serverErrorCopy);
    expect(result.errorDisplayed).toBe(true);
  });

  it('词典红线: connectionInterrupted 双侧在且非空 — error 态用户可见兜底文案的 SSOT', () => {
    expect(dictOf('zh').aiFallback.connectionInterrupted).toBeTruthy();
    expect(dictOf('en').aiFallback.connectionInterrupted).toBeTruthy();
  });
});

describe('C. 等待 → 60s 断流超时: 兜底分支的抑制与命中', () => {
  // STREAM_IDLE_TIMEOUT_MS = 60_000 (consume-ai-stream.ts), fake timers 驱动
  const IDLE_TIMEOUT_MS = 60_000;

  it('等待话术在先 → idleTimeout 置位但 streamInterrupted 兜底被抑制 (现状终态=等待话术)', async () => {
    vi.useFakeTimers();
    try {
      const turn = buildWebSearchWaitTurn(QUERY, 'zh');
      // tool_result + 注入等待话术后 stall: 上游既不发 done 也不 error
      const events = [toolResultEvent(fallbackContent([card('p1')]))];
      const { callbacks, state } = wireConsumer('zh');
      let settled = false;
      const pending = consumeAIStream(
        withWebSearchWaitEvent(sseStream(events, true), turn).getReader(),
        new TextDecoder(),
        callbacks,
      ).then((r) => ((settled = true), r));

      await vi.advanceTimersByTimeAsync(0); // 让等待话术先流完
      expect(state.tokens).toEqual([turn.reply]);
      // 流真 stall (未关未错): 消费端只能挂在 read 上等 60s timer, 而非正常 done
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      const result = await pending;

      expect(result.idleTimeout).toBe(true);
      expect(result.errorDisplayed).toBe(false);
      // 等待话术占住了 accumulatedReply → use-chat-actions 的
      // `idleTimeout && !accumulatedReply.trim()` 分支不命中 → streamInterrupted
      // 不显示; 终态 = 等待话术本身 (现状行为, 钉死防无意识漂移)
      expect(result.reply).toBe(turn.reply);
      expect(result.idleTimeout && !result.reply.trim()).toBe(false);
      // 无 error 事件 → 不挂 isError/onRetry: 用户停留在等待话术终态
      expect(state.isError).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('对照组: 无等待话术的空流超时 → 兜底分支命中 (b80-a 保护语义仍在)', async () => {
    vi.useFakeTimers();
    try {
      // 无 websearch fallback 的普通流, 只有一条 reasoning 后 stall —
      // reasoning 不进 reply → accumulatedReply 为空
      const events = [{ type: 'reasoning', content: 'thinking…' }];
      const { callbacks } = wireConsumer('zh');
      const pending = consumeAIStream(sseStream(events, true).getReader(), new TextDecoder(), callbacks);

      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      const result = await pending;

      expect(result.idleTimeout).toBe(true);
      expect(result.reply).toBe('');
      // use-chat-actions: idleTimeout && !reply.trim() → 命中 → streamInterrupted 兜底显示
      expect(result.idleTimeout && !result.reply.trim()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('词典红线: streamInterrupted 双侧在且非空 — 超时兜底文案的 SSOT', () => {
    expect(dictOf('zh').aiFallback.streamInterrupted).toBeTruthy();
    expect(dictOf('en').aiFallback.streamInterrupted).toBeTruthy();
  });
});

describe('D. query 空双形态 (98-a) 过全链', () => {
  it('zh 空词 → 无词降级文案过链, {query} 与插值引号零残留, 结果照常返回', async () => {
    const turn = buildWebSearchWaitTurn('', 'zh');
    const answer = '先看看这些：';
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: answer },
      { type: 'done' },
    ];
    const { callbacks, state } = wireConsumer('zh');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    // builder → wrapper → consumer 字节保真: 用户看到的就是无词形态
    expect(state.tokens).toEqual([turn.reply, answer]);
    expect(result.reply).toBe(turn.reply + answer);
    // 无词形态的结构锚点: 降级叙事在, 插值痕迹不在
    expect(result.reply).toContain('全网搜索');
    expect(result.reply).not.toContain('{query}');
    expect(result.reply).not.toContain('「');
    expect(state.cards).toHaveLength(1);
  });

  it('en 纯空白词 → 无词降级文案过链, 零占位符残留', async () => {
    const turn = buildWebSearchWaitTurn('   ', 'en');
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: 'Found these:' },
      { type: 'done' },
    ];
    const { callbacks } = wireConsumer('en');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    expect(result.reply).toBe(turn.reply + 'Found these:');
    expect(result.reply).toContain('whole web');
    expect(result.reply).not.toContain('{query}');
  });

  it('无词形态 × error 中断: 降级等待话术同样被 connectionInterrupted 替换', async () => {
    const turn = buildWebSearchWaitTurn('', 'en');
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'error', content: null },
    ];
    const { callbacks, state } = wireConsumer('en');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    expect(state.tokens).toEqual([turn.reply]);
    expect(state.isError).toBe(true);
    expect(state.errorBubbleCopy).toBe(dictOf('en').aiFallback.connectionInterrupted);
    expect(result.errorDisplayed).toBe(true);
  });

  it('现状注记: route 对空 content 直接 400 — 线上 query 恒非空, 无词形态是 lib 层防御面', () => {
    // 防御面契约: 无论 query 空不空, wrapper 只忠实透传 turn.reply (buildWebSearchWaitTurn 已裁决形态)
    const emptyTurn = buildWebSearchWaitTurn('', 'zh');
    const blankTurn = buildWebSearchWaitTurn('   ', 'zh');
    expect(emptyTurn.reply).not.toContain('{query}');
    expect(blankTurn.reply).not.toContain('{query}');
    expect(emptyTurn.reply).toBe(blankTurn.reply); // trim 后同形
  });
});

describe('E. MCP 前缀工具名走同一条链', () => {
  it('mcp__symy-hands__symy_search 命中 fallback 触发线 → 等待话术照常注入', async () => {
    const turn = buildWebSearchWaitTurn(QUERY, 'zh');
    const events = [
      toolResultEvent(fallbackContent([card('p1')]), 'mcp__symy-hands__symy_search'),
      { type: 'token', content: '结果如下' },
      { type: 'done' },
    ];
    const { callbacks, state } = wireConsumer('zh');
    const result = await consumeAIStream(
      withWebSearchWaitEvent(sseStream(events), turn).getReader(),
      new TextDecoder(),
      callbacks,
    );

    expect(state.tokens).toEqual([turn.reply, '结果如下']);
    expect(result.reply).toContain(`「${QUERY}」`);
  });
});
