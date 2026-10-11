/**
 * sse-prepend-event — 卡片事件预注入器 (A 族单源, R927 收编)
 *
 * 命中时在流最前面注入一条已编码的 SSE 事件字节, 之后逐字节透传 Letta 原始流。
 * 此前 green-alt-detect / green-knowledge-context / alt-adoption-context 三处
 * with*Event 逐字同构 (R927 diff 验证 88 行/3 函数归一化后逐字节相同), 按
 * R838 提取律上收本文件。行为契约与原三处逐字节一致, 唯一改进: cancel 走
 * reader.cancel (原 inner.cancel 在 reader 已锁时 reject TypeError 的 SSE C2
 * 坑家族 — 与 reuse-detect / stream-audit 同修法, 观察 项 R923/R924 随此闭)。
 *
 * 与 reuse-detect 的 prependReuseHintEvent 是两族实现 (不并): 本族 error 语义为
 * controller.error(err) (错误透传给消费方), reuse 族为静默 close (错误由内层
 * wrapper 处理)。泵语义不同故保持两族。
 */

/** 已编码事件字节; null payload 由调用方判定, 本函数只管注入与泵。 */
export function prependCardEvent(
  inner: ReadableStream<Uint8Array>,
  event: Uint8Array,
): ReadableStream<Uint8Array> {
  // reader 提升到外层 (SSE C2): cancel() 时 start() 可能已锁流, inner.cancel 会
  // reject TypeError, 必须用 reader.cancel() 才能传播到上游。
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(event);
      const locked = inner.getReader();
      reader = locked;
      const pump = async () => {
        try {
          for (;;) {
            const { done, value } = await locked.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      };
      void pump();
    },
    cancel(reason) {
      if (reader) return reader.cancel(reason);
      return inner.cancel(reason);
    },
  });
}
