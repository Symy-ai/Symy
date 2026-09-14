/**
 * reuse-detect — 聊天消息预检的复用提示 (服务端 part, 纯函数)
 *
 * 复用优先 (reuse-first) 接入聊天的机制, 与 BNPL 预检同路数:
 * 拿到最后一条用户消息后先跑 suggestReuse 预检, 命中复用类目时
 * 在 SSE 流开头发一条 { type: 'reuse_hint', hint } 事件
 * → 前端 ChatBubble 用 "🔁 先看看已有的" 复用卡渲染。
 *
 * 绿色守护开关 (symy_green_pref) 由调用方 (chat route) 判断 —
 * off 时不调用本文件, 整卡静默。part 只负责检测与事件组装。
 */

import {
  suggestReuse,
  type ReuseHint,
} from '@/lib/reuse-advisor';

/** 把路由里的 locale (任意字符串) 收窄成 advisor 支持的双语枚举 */
export function toReuseLocale(locale: string | undefined): 'zh' | 'en' {
  return locale === 'zh' ? 'zh' : 'en';
}

/**
 * 预检用户消息, 命中复用类目返回 reuseHint payload, 未命中返回 null。
 * 纯函数包装: suggestReuse 自身对空/异常输入安全, 这里不再加防御。
 * hoursLabel 服务端算好 string 进卡 (与 challenge-prompt suggestAlternative
 * 调用模式一致), 前端不重复换算。
 */
export function detectReuseHint(
  userContent: string,
  locale: string | undefined,
  hourlyRate?: number,
): ReuseHint | null {
  return suggestReuse(userContent ?? '', toReuseLocale(locale), hourlyRate);
}

/** reuse_hint SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface ReuseHintSseEvent {
  type: 'reuse_hint';
  hint: ReuseHint;
}

export function reuseHintSseEvent(hint: ReuseHint): ReuseHintSseEvent {
  return { type: 'reuse_hint', hint };
}

/**
 * 在 SSE 字节流的最前面插入一条事件 (其余字节原样透传)。
 *
 * 用于 /api/chat: Letta 的流是已经编码好的 SSE 字节, 无法在源头插事件,
 * 所以包一层 — 先 enqueue 复用事件, 再泵透传。审计 wrapper (wrapStreamWithAudit)
 * 在内层, 只认 token 事件, 不受影响; 与 green_alt 类事件共存时顺序稳定:
 * 预注入事件永远排在 Letta 原生事件之前, 谁后包装谁更靠前。
 */
// batch46-b: event 参数放宽为 object — 预注入器本身与事件类型无关 (只 JSON.stringify),
// micro_challenge 等其它结构化卡事件复用同一注入器, 零复制。
export function prependReuseHintEvent(
  source: ReadableStream<Uint8Array>,
  event: object,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  // 🔧 ARCH fix (同 route.ts wrapStreamWithAudit 的 SSE C2 坑): reader 提升到外层 —
  //    cancel() 时 source 已被 start() 里的 reader 锁定, source.cancel() 会 reject
  //    TypeError, 必须用 reader.cancel() 才能传播到上游。
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        // 上游读失败: 关闭即可, 错误处理由内层 wrapper 负责 (它先看到错误)
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // safe to ignore: releaseLock 与 pending read 竞争时可能抛出
        }
        try {
          controller.close();
        } catch {
          // safe to ignore: 流已被调用方 cancel
        }
      }
    },
    async cancel() {
      // 调用方取消 (用户关页面/abort): 传播到上游, 让内层审计/清理逻辑正常跑
      try {
        if (reader) await reader.cancel();
      } catch {
        // safe to ignore: 上游可能已自行关闭
      }
    },
  });
}
