export const dynamic = 'force-dynamic';

import { isLettaConfigured } from '@/lib/letta';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { SSE_HEADERS } from '@/lib/sse';

import { getUserAgentId } from '@/lib/letta-agent-manager';
import { fireAndForgetSafely } from '@/lib/admin-audit';
// 🔧 P1-4 fix: Guest 模式限流 — 允许未登录用户体验 1-2 次 AI 对话
// （第19刀: 限流门本体已下沉 parts/guest-gate.ts，此处仅留 parts 装配 imports）
// C4 拆分：纯函数移到 ./parts 子目录
// 🔧 Architecture refactor: compensation 已彻底移除
// AI 通过 MCP Server (symy.ai/api/mcp) 调用工具是唯一写入 buddy_state 的路径
// Handler 内置 lock + DB trigger_id dedup 保证幂等性，无需 regex-based 补偿
// 🔧 Architecture refactor: LLM Gateway/ZAI SDK fallback 路径已移除
// Letta + GLM-5.2 是唯一路径，~250 行 callLLMWithTools + tool calling 循环已删除
// （第23刀: SSE 包装栈 import 全部随搬移落 parts/sse-pipeline.ts）
import { type ChallengeContext } from './parts/types';
// 🧺 batch25-b (shopping-facts 提取管道): 用户消息 → 确定性提取购物事实 → 落库 →
//    每轮 context 注入摘要。提取 fire-and-forget 绝不进响应关键路径; 加载单索引
//    查询 best-effort, 表缺失/失败静默降级 (migration 140 未跑是常态不是事故)。
//    (加载半程 loadFactsForContext 随 batch26-c 拆分落 parts/letta-turn-context.ts)
import { extractAndSaveFacts, type ShoppingFactsPipelineStore } from '@/lib/shopping-facts-pipeline';
import { createAdminClient } from '@/lib/supabase-admin';
// batch26-c 拆分: 上下文装载 + prompt 组装移至 parts/letta-turn-context.ts（纯机械搬移）
import { loadLettaTurnContext } from './parts/letta-turn-context';
import { validateChatRequest } from './parts/chat-validation';
import { checkChatRateLimit } from './parts/rate-guard';
import { checkDailyChatLimit } from './parts/daily-limit-guard';
// 拆相位第19刀: guest 限流门 + 用户消息提取下沉 parts/（纯机械搬移）
import { checkGuestChatLimit } from './parts/guest-gate';
import { extractUserMessage } from './parts/user-message-extract';
// 拆相位第20刀: isLettaConfigured 门外兜底出口下沉 parts/（纯机械搬移）
import { lettaUnavailableResponse } from './parts/letta-unavailable';
// 拆相位第22刀: no-agent 503 出口下沉 parts/（纯机械搬移, 退款分文案 + 双通道）
import { buildAgentUnavailableResponse } from './parts/agent-unavailable-response';
// 拆相位第23刀: SSE 包装栈下沉 parts/sse-pipeline.ts（纯函数, 字节序核心; 第24刀起由 letta-dispatch 消费）
// 拆相位第24刀: Letta 分发整段 (流式/非流式/审计/错误分类/退款/SSE错误流) 下沉 parts/letta-dispatch.ts（纯机械搬移, 收官刀）
import { dispatchLettaTurn } from './parts/letta-dispatch';
// 拆相位第25刀 (批4方案B): 18 块 canned 短路块链 (原 route.ts:116-383) 整段搬移
// parts/canned-chain.ts（纯机械搬移, 懒加载双层结构与链序位级不变）
import { runCannedBlockChain } from './parts/canned-chain';
// ============================================================
// LLM 配置已移至 src/lib/llm-client.ts（统一调用层）
// ============================================================

// ============================================================
// Letta Agent 模式 — 信任 Letta 自己的工具调用能力
// ============================================================

// batch26-c 拆分: processLettaResponse（非流式 Letta 响应处理）→ parts/letta-response.ts（纯机械搬移）。

// batch26-c 拆分: wrapStreamWithAudit（SSE 审计流包装）→ parts/stream-audit.ts（纯机械搬移）。

// ============================================================
// POST /api/chat
// ============================================================

async function handleChatRequest(req: NextRequest) {
  const requestStartTime = Date.now();
  // batch26-c 拆分: 请求体解析与校验（content-type/大小/zod/locale 与 null 归一化/safeMessages）
  // → parts/chat-validation.ts（纯机械搬移，错误响应逐字节保留）。
  const validation = await validateChatRequest(req);
  if (!validation.ok) {
    return validation.response;
  }
  const { safeMessages, impulseContext, challengeContext, locale, stream, greenPref, guardIntensity, guardScope, microChallengeHistory, afterGuardCard, dataQueryContext, dismissedContextSignals, askedShoppingSubjects, greenAltRetroPending, greenAltRetroAnswer } = validation.parsed;

  // 获取认证信息（fallback 路径需要，Letta 路径不需要）
  const { supabase, user, mergeCookies, mergeCookiesOnResponse } = await createAuthenticatedClient(req);
  const userId = user?.id;
  const hasAuth = !!(supabase && userId);

  const rateLimitResponse = await checkChatRateLimit(req, userId);
  if (rateLimitResponse) return rateLimitResponse;
  const dailyLimitResponse = await checkDailyChatLimit(hasAuth, userId, supabase);
  if (dailyLimitResponse) return dailyLimitResponse;

  // 🛡️ challengeContext 已被 zod 验证 (含 Number.isFinite)
  // 🔧 ARCH fix (Round 69 BUG-AUDIT-69-7): zod z.number().finite() 已防 NaN
  const validChallengeContext: ChallengeContext | undefined = challengeContext
    ? {
        itemName: challengeContext.itemName,
        amount: challengeContext.amount,
        challengeId: challengeContext.challengeId,
      }
    : undefined;

  // === 优先: Letta Agent 模式 ===
  // 🔧 P1-4 fix: Guest 模式 — 未登录用户可体验有限次数 AI 对话（第19刀拆出
  //    parts/guest-gate.ts；已登录用户 hasAuth=true 直接跳过）
  if (isLettaConfigured()) {
    const guestGateResponse = checkGuestChatLimit(req, hasAuth);
    if (guestGateResponse) return guestGateResponse;
    // 第19刀拆出 parts/user-message-extract.ts（最后一条 user 消息提取 + 空内容 400）
    const extractedMessage = extractUserMessage(safeMessages);
    if (!extractedMessage.ok) return extractedMessage.response;
    const userContent = extractedMessage.userContent;

    // 🧺 batch25-b: shopping-facts 提取 — 确定性模式匹配 (零 LLM), 只吃 role='user'
    //    纯文本 (userContent 即最后一条 user 消息, assistant/tool 载荷天然进不来)。
    //    fire-and-forget (waitUntil): 绝不 await 进响应关键路径; 42P01 表缺失/任何
    //    异常在 pipeline 内静默降级, 聊天零感知。store 通道契约照 shopping-facts.ts
    //    头注释: createAdminClient() 结果 (service key)。
    const { supabase: factsAdminClient } = createAdminClient();
    // SupabaseClient 运行时满足 shopping-facts 最小结构面 (stub 测试已验证契约),
    // 直接赋值触发 supabase-js 泛型 TS2589 — 边界处一次性收窄。
    const factsStore = factsAdminClient
      ? (factsAdminClient as unknown as ShoppingFactsPipelineStore)
      : undefined;
    if (userId && factsStore) {
      fireAndForgetSafely(
        extractAndSaveFacts({ userId, text: userContent, locale, store: factsStore })
      );
    }

    // 🔧 拆相位第25刀 (2026-09-30, 批4方案B): 18 块 canned 短路块链 (原 route.ts:116-383,
    //    268 行样板) 整段纯机械搬移 parts/canned-chain.ts — 调用样板原文照搬, 懒加载
    //    双层结构与链序位级不变 (structure-lock 18 数组锁 + 懒加载 count===18 机器锁)。
    //    两缝随链结果返回: suppressGuardCards (clarify→下游守护卡) 与
    //    greenAltRetroAnswerContext (复盘回答→letta-turn-context prompt 注入)。
    //    链序总纲与两缝建模详见 parts/canned-chain.ts 头注释。
    const chainResult = await runCannedBlockChain({
      userContent, locale, stream, userId, supabase,
      greenAltRetroAnswer, fireAndForgetSafely, greenAltRetroPending, greenPref,
      afterGuardCard, guardScope, dataQueryContext, askedShoppingSubjects,
      guardIntensity, dismissedContextSignals, factsStore,
      mergeCookies, mergeCookiesOnResponse, SSE_HEADERS,
    });
    if (chainResult.response) return chainResult.response;
    const { suppressGuardCards, answerContext: greenAltRetroAnswerContext, effectiveUserContent } = chainResult;
    const modelUserContent = effectiveUserContent ?? userContent;

    // batch26-c 拆分: 上下文装载（修身阶段/时薪/buddy 统计/RAG/挑战历史）+ BNPL/symy cart/green/reuse
    // 预检 + userContentWithStage 组装 → parts/letta-turn-context.ts（纯机械搬移，内部
    // await / fire-and-forget 顺序逐一保留）。
    // 🧺 batch25-b 接线: factsStore 由 route 侧构建后传入, 加载半程 loadFactsForContext
    //    与 symy_shopping_facts 注入随拆分落 parts/letta-turn-context.ts。
    const turnContext = await loadLettaTurnContext({
      userId,
      supabase,
      userContent: modelUserContent,
      locale,
      greenPref,
      // 🛡️ batch48-a: 守护强度三档 → letta-turn-context 注入档位指令行
      guardIntensity,
      // 🗺️ batch53-b: 守护范围三态 → scope 指令行注入 + 豁免品类拦截卡静默
      guardScope,
      impulseContext,
      validChallengeContext,
      factsStore,
      microChallengeHistory,
      suppressGuardCards,
      // 🌱 batch68-a: 自由文本复盘回答的证据行 + 收束指令 (缺省 = 现状行为)
      greenAltRetroAnswerContext,
    });
    const { userContentWithStage, lettaCultivationStage, lettaUserHistory, greenAltCard, reuseHint, microChallenge, greenKnowledge, altFootprintCard } = turnContext;

    // 🔧 Per-user agent: 获取用户专属 Agent ID（仅查询，不惰性创建！）
    let userAgentId: string | undefined;
    if (userId) {
      try {
        const agentId = await getUserAgentId(userId);
        // T3 fix (2026-09-04): chat is the only per-message touchpoint for existing agents;
        // run idempotent tool sync here so legacy agents pick up symy-hands tools.
        if (agentId) {
          try {
            const { syncAgentSymyTools } = await import('@/lib/letta-agent-tools');
            await syncAgentSymyTools(agentId);
          } catch (syncErr) {
            // safe to ignore: tool sync is idempotent best-effort; next message retries it and chat itself must never fail due to attach issues
            logger.warn('[Chat API] hands tool sync failed (non-blocking):', syncErr instanceof Error ? syncErr.message : String(syncErr));
          }
        }
        if (agentId) userAgentId = agentId;
        // safe to ignore: non-critical background operation, error already logged
      } catch (err) {
        // safe to ignore: non-critical background operation, error already logged
        logger.warn('[Chat API] Failed to get user agent_id:', err);
      }
    }

    // 🔧 ARCH fix: 移除全局 LETTA_AGENT_ID fallback — 强制 per-user agent
    //    旧代码: userAgentId 为 null 时 fallback 到全局 LETTA_AGENT_ID → 跨用户记忆污染
    //    现在: userAgentId 为 null 时返回 503, 提示用户"AI 正在初始化, 请稍后重试"
    //    (auth-provider.tsx 的 ensureAgentForUser 会在登录后自动创建 per-user agent)
    // 🔧 拆相位第22刀 (2026-09-30): no-agent 503 出口 (退款分文案 + 双通道)
    //    自本段拆出 parts/agent-unavailable-response.ts (纯机械搬移)。
    if (!userAgentId) {
      return buildAgentUnavailableResponse({
        userId, validChallengeContext, stream, mergeCookies, mergeCookiesOnResponse,
      });
    }

    // 🔧 架构优化 Round 58: 移除死循环 (Finding 7) — agentIds 只有 1 个元素, for...of 是遗留代码
    const targetAgentId = userAgentId;

    // 🔧 拆相位第24刀 (2026-09-30, 收官刀): Letta 分发整段 (流式 SSE / 非流式 JSON /
    //    审计落库 / 401/403/429/5xx 错误分类 / catch 退款 / SSE 错误流) 自本段拆出
    //    parts/letta-dispatch.ts (纯机械搬移)。lettaStreamSucceeded / streamRefundSucceeded
    //    两个跨 try/catch 可变状态已内部化, 不再暴露在 route 顶层。
    //    返回 null 的唯一情形: 非流式 catch → 下方 P6 兜底 (与搬移前隐式跌出语义一致)。
    const dispatchResponse = await dispatchLettaTurn({
      userContent: modelUserContent,
      userContentWithStage,
      userId,
      locale,
      stream,
      impulseContext,
      validChallengeContext,
      targetAgentId,
      requestStartTime,
      mergeCookiesOnResponse,
      lettaCultivationStage,
      lettaUserHistory,
      greenAltCard,
      reuseHint,
      microChallenge,
      greenKnowledge,
      altFootprintCard,
    });
    if (dispatchResponse) return dispatchResponse;
  }

  // 🔧 Architecture refactor: LLM Gateway / ZAI SDK fallback 路径已移除
  // 新架构下 Letta + GLM-5.2 是唯一路径。如果 Letta 整体不可用，返回 503 让前端提示用户重试。
  // 之前的 callLLMWithTools + 二次 LLM 调用 + tool calling 循环（~250 行）已删除。
  // 第20刀拆出 parts/letta-unavailable.ts（hasAuth 两态: 未登录 401 / 已登录 503）
  return lettaUnavailableResponse(hasAuth, mergeCookies);
}

// Vercel platform-level timeout
// 🔧 2026-07-20 (P0 fix): letta/auto 非 reasoning 模式更快, 60s 足够
//    旧代码: maxDuration=300 (GLM-5.2 reasoning 需要 60s+)
//    修复: 降回 60s (letta/auto 非 reasoning 模式通常 5-15s 响应)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 🔧 Architecture refactor: 移除应用层 55s timeout + Promise.race + 伪装 AI 回复
  // Vercel maxDuration=60 是唯一硬兜底。失败时返回 503 让前端处理（chat-tab.tsx 已有 !response.ok 分支）
  try {
    return await handleChatRequest(req);
    // safe to ignore: non-critical background operation, error already logged
  } catch (error) {
    // safe to ignore: non-critical background operation, error already logged
    logger.error('[Chat API] Error:', error);
    return Response.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
