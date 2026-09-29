/**
 * shopping-clarify turn + 三态块测试
 *
 * 🔧 b137 拆解第21刀 (2026-09-30): 扩展三态块用例 — tryShoppingClarifyBlock 是
 * canned `Response | null` 惯例的唯一三态扩展 (clarify 除短路外还产出
 * suppressGuardCards 旗标), 三态各锁一例:
 * ① 短路 response (clarify 追问轮, 流式/非流式双通道)
 * ② null + suppressGuardCards=true (意图判 not_purchase)
 * ③ null 直通 (高置信购买意图, 旗标 false)
 */
import { describe, expect, it } from 'vitest';
import { buildShoppingClarifySseStream, buildShoppingClarifyTurn, isShoppingClarifyAnswer } from '../shopping-clarify-turn';
import { tryShoppingClarifyBlock } from '../canned/shopping-clarify-block';

describe('shopping clarify turn', () => {
  it('returns no turn for machine answers', () => {
    expect(buildShoppingClarifyTurn({ userContent: '[symy-clarify:gift] For her', locale: 'en' })).toBeNull();
    expect(isShoppingClarifyAnswer(' [symy-clarify:skip] ')).toBe(true);
  });

  it('builds a short stream with card and done event', async () => {
    const turn = buildShoppingClarifyTurn({ userContent: '买点给孩子的东西', locale: 'zh' });
    expect(turn?.shoppingClarifyCard.slot).toBe('category');
    const reader = buildShoppingClarifySseStream(turn!).getReader();
    const decoder = new TextDecoder();
    const first = JSON.parse(decoder.decode((await reader.read()).value!).split('data: ')[1]);
    expect(first.type).toBe('shopping_clarify_card');
    await reader.cancel();
  });
});

describe('shopping-clarify 三态块 (tryShoppingClarifyBlock, 刀21)', () => {
  const identity = <T>(res: T): T => res;
  const base = {
    locale: 'zh' as const,
    mergeCookies: identity,
    mergeCookiesOnResponse: identity,
  };

  it('态① 意图不明 → 短路 response (非流式 JSON 卡片 / 流式 SSE 头透传), 旗标恒 false', async () => {
    // 非流式: JSON body 形状与拆分前 route 内联段逐字段一致 (字节级契约)
    const json = await tryShoppingClarifyBlock({
      ...base, userContent: '买点给孩子的东西', stream: false, SSE_HEADERS: {},
    });
    expect(json.response).not.toBeNull();
    expect(json.suppressGuardCards).toBe(false);
    const body = await json.response!.json();
    expect(body).toEqual({
      reply: '我先确认一下，避免会错意。',
      reasoning: undefined,
      toolCalls: undefined,
      shoppingClarifyCard: { subject: '点给孩子的东西', slot: 'category', answers: expect.any(Array) },
    });

    // 流式: SSE_HEADERS 透传到 Response 头 (mergeCookiesOnResponse 为恒等)
    const sse = await tryShoppingClarifyBlock({
      ...base, userContent: '买点给孩子的东西', stream: true, SSE_HEADERS: { 'x-sse-test': '1' },
    });
    expect(sse.response).not.toBeNull();
    expect(sse.suppressGuardCards).toBe(false);
    expect(sse.response!.headers.get('x-sse-test')).toBe('1');
    const firstEvent = (await sse.response!.text()).split('data: ')[1];
    expect(JSON.parse(firstEvent).type).toBe('shopping_clarify_card');
  });

  it('态② 非购买闲聊 (not_purchase) → null 直通 + suppressGuardCards=true (下游守护卡静默)', async () => {
    const result = await tryShoppingClarifyBlock({
      ...base, userContent: '今天天气真不错', stream: false, SSE_HEADERS: {},
    });
    expect(result.response).toBeNull();
    expect(result.suppressGuardCards).toBe(true);
  });

  it('态③ 高置信购买意图 → null 直通 + 旗标 false (不误伤正常守护链)', async () => {
    const result = await tryShoppingClarifyBlock({
      ...base, userContent: '我想买耳机', stream: false, SSE_HEADERS: {},
    });
    expect(result.response).toBeNull();
    expect(result.suppressGuardCards).toBe(false);
  });
});
