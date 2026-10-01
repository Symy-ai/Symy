/**
 * canned-chain — 18 块 canned 短路块链（拆相位第25刀，批4方案B）
 *
 * 🔧 拆相位第25刀 (2026-09-30): 自 route.ts:116-383 (e47d427, 268 行块链段) 纯机械
 *    搬移。18 块的 `await import → 解构 → tryXxx({...}) → if return` 样板原文照搬，
 *    唯二改写类: ① 相对 import 路径 ./parts/canned/* → ./canned/* (含块1 的
 *    green-alt-retro-context 类型引用) ② 每块多行排位注释瘦身为一行角色注
 *    (完整排位红线在各块头注释, 已核实逐句重复, 不搬家不复制)。
 *    route 侧换成 runCannedBlockChain(ctx) 单调用 (route 500 → ~250 行)。
 *
 * 链序总纲 (调用顺序=链序, 由 route-structure-lock 18 数组锁 + 外围 source-order 锁定):
 *   强意图在前 (batch68-a 复盘回答/追问 → reflection → 48-b 反驳降温 → 购物流互斥链
 *   65-a/50-a/53-a/56-a/57-a) → 数据问答 (59-c 追问跟随 → 58-c 分类/时段 →
 *   62-c 预报 → 68-c 脉搏 → 57-c 问账) → clarify 澄清 → 60-c 情绪守护 →
 *   61-b 弱信号。让路互斥原则: detector 内排除 + 链序双保险。
 *
 * 懒加载双层红线 (方案 §1.4, 不可"顺手优化"):
 *   外层 = 本文件逐块 await import ./canned/* 壳模块 — 短路请求不加载后续块模块
 *   (route-structure-lock 锁 count===18); 内层 = 块文件内再动态 import
 *   detector/turn-builder (重依赖全在内层)。外层改静态 import 属于行为变更, 禁止。
 *
 * 两缝建模 (18 块间仅有的两条数据依赖, 方案 §1.2/§3.3 — 返回值管道而非可变 ctx):
 *   缝1 (链内): suppressGuardCards 由块16 clarify 产出 (let 初始化在块16 前, 原位
 *     保留) → 块17/18 消费 → 出口随结果返回, route 侧随 loadLettaTurnContext 下传。
 *   缝2 (链后): greenAltRetroAnswerContext 由块1 产出 (let 声明原位保留) → 出口
 *     返回, route 侧随 loadLettaTurnContext 下传注入 prompt。
 *   18 处 `if (xxx) return xxx` 短路语句逐字保留 (内层闭包承载搬移体), fall-through
 *   跑到链尾时一次性打包 {response: null, 两缝} 返回。
 */

import type { NextResponse } from 'next/server';

/** 链上下文 — 核心 6 字段 + 13 个异构字段超集 (route 侧组装, 块自取所需) */
export interface CannedBlockChainCtx {
  // —— 核心 6 字段 (全部 18 块共有) ——
  userContent: string;
  locale: 'zh' | 'en';
  stream?: boolean;
  mergeCookies: (res: NextResponse) => NextResponse;
  mergeCookiesOnResponse: (res: Response) => Response;
  SSE_HEADERS: Record<string, string>;
  // —— 13 个异构字段 (按块首现序) ——
  userId?: string | null;          // 块1/10-15/18
  supabase: unknown;               // 块1/10-15 (块接口面即 unknown)
  greenAltRetroAnswer: { entryId: string; optionId?: string } | null | undefined; // 块1 (缝2输入)
  fireAndForgetSafely: (p: Promise<unknown>) => void; // 块1 (复盘证据落账 fire-and-forget)
  greenAltRetroPending: { entryId: string } | null | undefined; // 块2
  greenPref?: 'on' | 'off';        // 块2/4/17/18
  afterGuardCard?: boolean;        // 块4
  guardScope?: import('@/lib/guard-scope').GuardScope | null; // 块9
  dataQueryContext: { kind?: string } | null | undefined; // 块10/13
  askedShoppingSubjects?: readonly string[]; // 块16 (形参名 askedSubjects)
  guardIntensity?: string;         // 块17/18
  dismissedContextSignals: string[] | null | undefined; // 块18
  factsStore: unknown;             // 块18
  timeZone?: string | null;        // 块13 (冲动预报 — 用户时区分桶)
}

/** 链出口 — response 非 null = 某块短路 (route 直接 return); 两缝随结果返回 */
export interface CannedBlockChainResult {
  response: Response | null;
  /** 缝1: 块16 clarify 产出 (init false) — route 侧随 loadLettaTurnContext 下传 */
  suppressGuardCards: boolean;
  /** 缝2: 块1 复盘回答产出 — route 侧随 loadLettaTurnContext 下传注入 prompt */
  answerContext: import('./green-alt-retro-context').GreenAltRetroAnswerPrompt | undefined;
  /** 缝3: 块16 快问卡应答转译后的自然语言意图 */
  effectiveUserContent?: string;
}

export async function runCannedBlockChain(ctx: CannedBlockChainCtx): Promise<CannedBlockChainResult> {
  const {
    userContent, locale, stream, userId, supabase, greenAltRetroAnswer, fireAndForgetSafely,
    greenAltRetroPending, greenPref, afterGuardCard, guardScope, dataQueryContext,
    askedShoppingSubjects, guardIntensity, dismissedContextSignals, factsStore,
    mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
  } = ctx;

  // 内层闭包承载搬移体: 18 处短路 `return response` 语句逐字保留 (返回值管道, 方案 §3.3)。
  // 短路出口的两缝值恒为 {false, undefined} (suppressGuardCards=true 时块17/18 guard
  // 必返 null 不短路; 块1 短路时 answerContext 必为 undefined), 打包语义等价。
  const runChain = async (): Promise<Response | CannedBlockChainResult> => {
    // 🌱 batch68-a 采纳后复盘回答 — 一切 detector 之前 (选项点击是明确回答不让截胡; 自由文本经让位 gate, 让位则静默回落)
    let greenAltRetroAnswerContext: import('./green-alt-retro-context').GreenAltRetroAnswerPrompt | undefined;
    {
      const { runGreenAltRetroAnswerBlock } = await import('./canned/green-alt-retro-answer-block');
      const retroAnswerResult = await runGreenAltRetroAnswerBlock({
        userContent, locale, stream, userId, supabase, greenAltRetroAnswer, fireAndForgetSafely,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (retroAnswerResult.response) return retroAnswerResult.response;
      greenAltRetroAnswerContext = retroAnswerResult.answerContext;
    }

    // 🌱 batch68-a 复盘追问 — 回答块之后、reflection 之前 (pending 一次性, greenPref off 静默; 排位红线见块头注释)
    {
      const { tryGreenAltRetroAskBlock } = await import('./canned/green-alt-retro-ask-block');
      const retroAskResponse = await tryGreenAltRetroAskBlock({
        userContent, locale, stream, greenAltRetroPending, greenPref,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (retroAskResponse) return retroAskResponse;
    }

    // 🔧 P0-1 反思问题 — canned reply 不调 Letta (persona 冲突致 60s 无响应的根因修复)
    {
      const { tryReflectionBlock } = await import('./canned/reflection-block');
      const reflectionResponse = await tryReflectionBlock({
        userContent, locale, stream,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (reflectionResponse) return reflectionResponse;
    }

    // 🐘 batch48-b 反驳降温 — 上一轮守护卡 + 本轮反驳 → canned 降温回复 (guard-off 时 afterGuardCard 恒 false, 双保险)
    {
      const { tryCooldownBlock } = await import('./canned/cooldown-block');
      const cooldownResponse = await tryCooldownBlock({
        userContent, locale, stream, greenPref, afterGuardCard,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (cooldownResponse) return cooldownResponse;
    }

    // 🐘 batch65-a 重复购买预检 — 比 50-a 通用买前求问更具体, 因此先判
    {
      const { tryDuplicatePurchaseBlock } = await import('./canned/duplicate-purchase-block');
      const duplicateResponse = await tryDuplicatePurchaseBlock({
        userContent, locale, stream,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (duplicateResponse) return duplicateResponse;
    }

    // 🐘 batch50-a 买前三问 — 反驳降温之后 (两流意图互斥; 用户主动求问, 守护开关不挡)
    {
      const { tryPrepurchaseBlock } = await import('./canned/prepurchase-block');
      const prepurchaseResponse = await tryPrepurchaseBlock({
        userContent, locale, stream,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (prepurchaseResponse) return prepurchaseResponse;
    }

    // 🐘 batch53-a 绿色承诺 — 求问/反驳之后 (三流互斥; 确认后才落 health_events)
    {
      const { tryCommitmentBlock } = await import('./canned/commitment-block');
      const commitmentResponse = await tryCommitmentBlock({
        userContent, locale, stream,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (commitmentResponse) return commitmentResponse;
    }

    // 🐘 batch56-a 对比裁决 — 求问/反驳/承诺之后 (四流互斥; 点选后才落 health_events)
    {
      const { tryCompareBlock } = await import('./canned/compare-block');
      const compareResponse = await tryCompareBlock({
        userContent, locale, stream,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (compareResponse) return compareResponse;
    }

    // 🐘 batch57-a 清单分诊 — 反驳/求问/承诺/对比之后 (五流互斥)
    {
      const { tryListTriageBlock } = await import('./canned/list-triage-block');
      const listTriageResponse = await tryListTriageBlock({
        userContent, locale, stream, guardScope,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (listTriageResponse) return listTriageResponse;
    }

    // 🐘 batch59-c 追问跟随 — 58-c/57-c 之前 (短追问不带完整问句形态; FULL_QUERY 让路在 detector 内, 无上文回落)
    {
      const { tryFollowUpBlock } = await import('./canned/follow-up-block');
      const followUpResponse = await tryFollowUpBlock({
        userContent, locale, stream, userId, supabase, dataQueryContext,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (followUpResponse) return followUpResponse;
    }

    // 🐘 batch58-c 分类问句 — 品类词归一五类才命中, 否则回落 57-c 月度总答 (零金额)
    {
      const { tryCategoryQueryBlock } = await import('./canned/category-query-block');
      const categoryQueryResponse = await tryCategoryQueryBlock({
        userContent, locale, stream, userId, supabase,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (categoryQueryResponse) return categoryQueryResponse;
    }

    // 🐘 batch58-c 时段问句 — 复用 48-c 分桶统计, 零金额零碳数值
    {
      const { tryImpulseTimeQueryBlock } = await import('./canned/impulse-time-block');
      const impulseTimeResponse = await tryImpulseTimeQueryBlock({
        userContent, locale, stream, userId, supabase,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (impulseTimeResponse) return impulseTimeResponse;
    }

    // 🐘 batch62-c 冲动风险预报 — 58-c 之后、57-c 之前 (回顾型问句 detector 内让路; dataQueryContext kind='forecast' 为单日追问资格)
    {
      const { tryImpulseForecastBlock } = await import('./canned/impulse-forecast-block');
      const forecastResponse = await tryImpulseForecastBlock({
        userContent, locale, stream, userId, supabase, dataQueryContext,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS, timeZone: ctx.timeZone,
      });
      if (forecastResponse) return forecastResponse;
    }

    // 🐘 batch68-c 守护脉搏 — 62-c 预报之后、57-c 问账之前 (前瞻词让预报/时段词让 58-c/品类词让分类, 全在 detector 内)
    {
      const { tryGuardPulseBlock } = await import('./canned/guard-pulse-block');
      const guardPulseResponse = await tryGuardPulseBlock({
        userContent, locale, stream, userId, supabase,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (guardPulseResponse) return guardPulseResponse;
    }

    // 🐘 batch57-c 问账 — 购物类 detector 之后 (问账是提问不是购物意图; 数字全来自既有聚合 lib)
    {
      const { trySavingsQueryBlock } = await import('./canned/savings-query-block');
      const savingsQueryResponse = await trySavingsQueryBlock({
        userContent, locale, stream, userId, supabase,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (savingsQueryResponse) return savingsQueryResponse;
    }

    // 🔧 b137 第21刀 shopping-clarify 三态块 — response 短路 / suppressGuardCards 旗标 (not_purchase) / null 直通
    let suppressGuardCards = false;
    let effectiveUserContent: string | undefined;
    {
      const { tryShoppingClarifyBlock } = await import('./canned/shopping-clarify-block');
      const clarifyResult = await tryShoppingClarifyBlock({
        userContent, locale, stream, askedSubjects: askedShoppingSubjects,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      suppressGuardCards = clarifyResult.suppressGuardCards;
      if (clarifyResult.response) return clarifyResult.response;
      effectiveUserContent = clarifyResult.effectiveUserContent;
    }

    // 🐘 batch60-c 情绪守护 — 数据问答之后、通用购买预检之前 (消费 suppressGuardCards; BNPL/绿色品类 detector 内让路)
    {
      const { tryEmotionGuardBlock } = await import('./canned/emotion-guard-block');
      const emotionGuardResponse = await tryEmotionGuardBlock({
        userContent, locale, stream, guardIntensity, greenPref, suppressGuardCards,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (emotionGuardResponse) return emotionGuardResponse;
    }

    // 🐘 batch61-b 购物场景弱信号 — 强 detector 之后、Letta 之前 (消费 suppressGuardCards; dismissed 词条会话级排除)
    {
      const { tryContextSignalBlock } = await import('./canned/context-signal-block');
      const contextSignalResponse = await tryContextSignalBlock({
        userContent, locale, stream, userId, greenPref, suppressGuardCards,
        dismissedContextSignals, guardIntensity, factsStore,
        mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
      });
      if (contextSignalResponse) return contextSignalResponse;
    }

    return { response: null, suppressGuardCards, answerContext: greenAltRetroAnswerContext, effectiveUserContent };
  };
  const outcome = await runChain();
  return outcome instanceof Response
    ? { response: outcome, suppressGuardCards: false, answerContext: undefined }
    : outcome;
}
