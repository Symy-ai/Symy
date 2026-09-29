/**
 * canned-chain 链级测试 (拆相位第25刀, 批4方案B §3.5)
 *
 * 18 块链整段搬 parts/canned-chain.ts 后, 链出口形状与两缝数据流的路由级快照
 * 补丁 — route-sse-bytes 三链输入全 'Hi' 不命中任何块 (方案 §1.5 盲区), canned
 * 短路路径此前无 route 级测试。三测锁:
 *   T1 fall-through: 不命中任何 detector → {response:null, suppress:false, answerContext:undefined}
 *   T2 缝1 (链内): clarify 判 not_purchase → suppressGuardCards=true 透传出口
 *   T3 缝2 (链后): 复盘自由文本回答 (让位 gate 放行) → answerContext 定义
 *
 * mock 边界仿 shopping-clarify-turn.test.ts 最小面: 零 vi.mock (块内重依赖全在
 * 内层动态 import, 非命中路径不触发; 命中路径亦为纯函数), supabase 传 null
 * (块接口面即 unknown, 未登录链路同形)。
 */
import { describe, expect, it } from 'vitest';
import type { NextResponse } from 'next/server';
import { runCannedBlockChain } from '../canned-chain';

const identity = <T>(res: T): T => res;

/** 最小链上下文 — 覆盖 18 块的字段全集, 未登录形态 (userId/supabase 缺省) */
function baseCtx(overrides: Partial<Parameters<typeof runCannedBlockChain>[0]> = {}) {
  return {
    userContent: 'Hi',
    locale: 'zh' as const,
    stream: false,
    userId: undefined,
    supabase: null,
    greenAltRetroAnswer: undefined,
    fireAndForgetSafely: (_p: Promise<unknown>) => {},
    greenAltRetroPending: undefined,
    greenPref: undefined,
    afterGuardCard: undefined,
    guardScope: undefined,
    dataQueryContext: undefined,
    askedShoppingSubjects: [],
    guardIntensity: undefined,
    dismissedContextSignals: undefined,
    factsStore: undefined,
    mergeCookies: identity as (res: NextResponse) => NextResponse,
    mergeCookiesOnResponse: identity,
    SSE_HEADERS: {},
    ...overrides,
  };
}

describe('runCannedBlockChain — 链出口形状与两缝 (批4方案B T1-T3)', () => {
  it('T1 fall-through: 高置信购买意图不命中任何 canned 块 → 三字段全空/零直通 (route-sse-bytes 同族 fall-through)', { timeout: 30_000 }, async () => {
    // '我想买耳机' = shopping-clarify 态③ fixture (高置信购买, 旗标 false) —
    // 链内 18 块 detector 全不命中 (购买意图走 loadLettaTurnContext 通用预检,
    // 不在 canned 链职责内), 链以 no-op 形态跑完
    const result = await runCannedBlockChain(baseCtx({ userContent: '我想买耳机' }));
    expect(result.response).toBeNull();
    expect(result.suppressGuardCards).toBe(false);
    expect(result.answerContext).toBeUndefined();
  });

  it('T2 缝1 (链内): clarify 判 not_purchase → suppressGuardCards=true 透传链出口 (下游守护卡静默旗标)', async () => {
    // fixture 抄 shopping-clarify-turn.test.ts 态② — '今天天气真不错' 意图判
    // not_purchase, 且不命中链内任何更早的块 (纯闲聊)
    const result = await runCannedBlockChain(baseCtx({ userContent: '今天天气真不错' }));
    expect(result.response).toBeNull();
    expect(result.suppressGuardCards).toBe(true);
    expect(result.answerContext).toBeUndefined();
  });

  it('T3 缝2 (链后): 复盘自由文本回答 (让位 gate 放行) → answerContext 定义 (evidenceLine + promptLine 注入面)', async () => {
    // fixture 抄 green-alt-retro-gate.test.ts 不让位用例 — '哈哈确实' 不让位,
    // block1 走自由文本路径产出结构化复盘证据; 未登录 (userId undefined) 跳过落账。
    // evidenceLine 带词条显示名 (milk_tea → 奶茶), 不透出 entryId 原文
    const result = await runCannedBlockChain(baseCtx({
      userContent: '哈哈确实',
      greenAltRetroAnswer: { entryId: 'milk_tea' },
    }));
    expect(result.response).toBeNull();
    expect(result.answerContext).toBeDefined();
    expect(typeof result.answerContext!.evidenceLine).toBe('string');
    expect(result.answerContext!.evidenceLine).toContain('奶茶');
    expect(typeof result.answerContext!.promptLine).toBe('string');
  });
});
