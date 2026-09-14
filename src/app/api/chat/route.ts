export const dynamic = 'force-dynamic';

import { isLettaConfigured, streamToAgent } from '@/lib/letta';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendSSEData, closeSSE, SSE_HEADERS } from '@/lib/sse';

import { getUserAgentId } from '@/lib/letta-agent-manager';
import { logAIBehavior } from '@/lib/ai-audit';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { checkRateLimit } from '@/lib/distributed-lock';
// 🔧 P1-4 fix: Guest 模式限流 — 允许未登录用户体验 1-2 次 AI 对话
import { checkGuestLimit, getClientIP } from '@/lib/guest-rate-limiter';
// C4 拆分：纯函数移到 ./parts 子目录
// 🔧 Architecture refactor: compensation 已彻底移除
// AI 通过 MCP Server (symy.ai/api/mcp) 调用工具是唯一写入 buddy_state 的路径
// Handler 内置 lock + DB trigger_id dedup 保证幂等性，无需 regex-based 补偿
// 🔧 Architecture refactor: LLM Gateway/ZAI SDK fallback 路径已移除
// Letta + GLM-5.2 是唯一路径，~250 行 callLLMWithTools + tool calling 循环已删除
import { type ChallengeContext } from './parts/types';
import { captureLLMGeneration } from '@/lib/posthog-server';
// 🧺 batch25-b (shopping-facts 提取管道): 用户消息 → 确定性提取购物事实 → 落库 →
//    每轮 context 注入摘要。提取 fire-and-forget 绝不进响应关键路径; 加载单索引
//    查询 best-effort, 表缺失/失败静默降级 (migration 140 未跑是常态不是事故)。
//    (加载半程 loadFactsForContext 随 batch26-c 拆分落 parts/letta-turn-context.ts)
import { extractAndSaveFacts, type ShoppingFactsPipelineStore } from '@/lib/shopping-facts-pipeline';
import type { EvidenceStore } from './parts/context-trust-evidence';
import { createAdminClient } from '@/lib/supabase-admin';
// 🌱 绿色替代拦截→推荐: 发 Letta 前关键词预检, 命中给前端 green_alt 卡片标记 (Letta prompt 不动)
import { withGreenAltEvent } from './parts/green-alt-detect';
// 📖 batch47-a 知识问答: 知识型提问 → 词条来源 chip (green_knowledge 事件 / JSON greenKnowledge 字段)
import { withGreenKnowledgeEvent } from './parts/green-knowledge-context';
// 🐘 batch55-c 替代足迹: 召回命中时注入 alt_footprint 事件 (足迹卡 payload)
import { withAltFootprintEvent } from './parts/alt-adoption-context';
// 🔁 复用优先 (reuse-first): 购物意图预检 → SSE 流最前注入 reuse_hint 卡 / 非流式 JSON reuseHint 字段
import { prependReuseHintEvent, reuseHintSseEvent } from './parts/reuse-detect';
// 🐞 batch46-b 微挑战: 购买意图 + 品类 + 频控预检 → SSE 流最前注入 micro_challenge 卡 / JSON microChallenge 字段
import { microChallengeSseEvent } from './parts/micro-challenge-detector';
// batch26-c 拆分: 上下文装载 + prompt 组装移至 parts/letta-turn-context.ts（纯机械搬移）
import { loadLettaTurnContext } from './parts/letta-turn-context';
import { validateChatRequest } from './parts/chat-validation';
import { wrapStreamWithAudit } from './parts/stream-audit';
import { processLettaResponse } from './parts/letta-response';
// 🌐 batch72-a 全网搜索等待话术: symy_search fallback 命中 (货架 <2 卡 + websearch
//    标记) 时, tool_result 后紧跟 canned 等待话术, 结果卡仍走既有 cards 管道出卡
import { buildWebSearchWaitTurn } from '@/lib/websearch-wait-turn';
import { withWebSearchWaitEvent } from './parts/websearch-wait-stream';

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

  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-1): 添加 rate limiting 防 Letta+OpenAI budget drain
  //    旧代码: 无 rate limit → 已认证用户/bot 可脚本化 spam → 烧 Letta+GLM-5.2 token
  //    根因修复: 按 userId (已认证) 或 IP (未认证) 限流, 30 次/小时 (正常使用足够)
  // 🔧 ARCH fix (Round 37 AUDIT-8 MEDIUM-5): 用 x-vercel-forwarded-for 优先 (Vercel 边缘设置, 不可伪造)
  // 🔧 Round 120 audit fix (AUDIT-1 P1 #5): 旧代码 fallback 'unknown' → 所有 unknown IP 共享一个 bucket
  //    一个攻击者就能用完所有 anonymous 用户的额度 (DoS)
  //    修复: unknown IP 一律拒绝 (无 IP 头的请求很可能是恶意/伪造)
  const clientIp = userId
    ? null // authenticated users are rate-limited by userId
    : req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || req.headers.get('x-real-ip');
  // 🔧 Round 120 audit fix: 未认证 + 无法识别 IP → 拒绝 (防 DoS)
  if (!userId && !clientIp) {
    return Response.json({ error: 'Unable to identify client. Please sign in to chat.' }, { status: 401 });
  }
  const rateLimitKey = userId ? `chat:user:${userId}` : `chat:ip:${clientIp}`;
  const { allowed: rateLimitAllowed } = await checkRateLimit(rateLimitKey, 30, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return Response.json(
      {
        error: 'Rate limit exceeded. Maximum 30 messages per hour. Please try again later.',
      },
      { status: 429 },
    );
  }

  // 🔧 P0 fix (marketing-improvement-suggestions.md #3): Free tier 每日聊天限制 (50 条/天)
  //    旧代码: 只有 30 条/小时 rate limit, 无每日限制 → 免费用户理论上可无限聊
  //    新代码: 已登录 free 用户每日最多 50 条, premium 用户无限
  //    实现: 复用 checkRateLimit (distributed_locks + increment_rate_limit RPC), 无需新 migration
  const FREE_TIER_DAILY_CHAT_LIMIT = 50;
  const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
  if (hasAuth && userId && supabase) {
    try {
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
      const isPremium = profile?.plan === 'premium';
      if (!isPremium) {
        const { allowed: dailyAllowed } = await checkRateLimit(`chat:daily:${userId}`, FREE_TIER_DAILY_CHAT_LIMIT, DAILY_WINDOW_MS);
        if (!dailyAllowed) {
          return Response.json(
            {
              error: 'Daily chat limit reached. Maximum 50 messages per day. Upgrade to Premium for unlimited chatting, or come back tomorrow.',
              dailyLimitReached: true,
              limit: FREE_TIER_DAILY_CHAT_LIMIT,
            },
            { status: 429 },
          );
        }
      }
    } catch (err) {
      // safe to ignore: daily limit query failure should not block chat (fail-open)
      logger.warn('[Chat API] Failed to check free tier daily chat limit:', err);
    }
  }

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
  // 🔧 P1-4 fix: Guest 模式 — 未登录用户可体验有限次数 AI 对话
  //   旧代码: 未认证用户直接返回 401，新用户无法体验核心功能
  //   新代码: 未认证用户在 Guest 限制内（每 IP 每天 2 次）可体验 AI 对话，
  //          超过限制返回 401 引导注册
  //   注意: 已登录用户 hasAuth=true，不受此 Guest 限流影响（直接跳过）
  if (isLettaConfigured()) {
    if (!hasAuth) {
      // 🔧 P1-4 fix: Guest 模式限流检查
      //   内存限流在 serverless 多实例下每个实例独立计数，这是 MVP 可接受的已知限制。
      //   后续可迁移到 Redis 或 Supabase 表实现跨实例共享计数。
      const clientIP = getClientIP(req);
      const guestCheck = checkGuestLimit(clientIP);
      if (!guestCheck.allowed) {
        return Response.json(
          {
            error: 'Guest limit reached. Sign up to continue chatting with Symy and save your conversations.',
            guestLimitReached: true,
            limit: guestCheck.limit,
          },
          { status: 401 },
        );
      }
      // Guest 模式: 使用共享 Agent ID（LETTA_AGENT_ID），不创建 per-user agent
      logger.info(`[Chat API] Guest mode: IP=${clientIP}, remaining=${guestCheck.remaining}/${guestCheck.limit}`);
    }
    const lastUserMsg = safeMessages.filter((m: { role: string }) => m.role === 'user').pop();
    const userContent = lastUserMsg?.content || safeMessages[safeMessages.length - 1]?.content || '';

    if (!userContent.trim()) {
      return Response.json({ error: 'Message content cannot be empty' }, { status: 400 });
    }

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

    // 🌱 batch68-a 绿色采纳后复盘 — 回答轮: 排在一切 detector 之前。选项点击
    //    ("手头已有" 一类短句) 是明确回答, 不得被既有购买/问账 detector 截胡;
    //    自由文本回答经让位 gate (新购买/紧急/数据问句) 判定: 未让位 → 证据
    //    落账 + 注入 Letta 收束; 让位 → 静默落回普通链路 (会话态客户端已消费,
    //    不再追问 — 温和结束)。收束文案零金额零碳数值。
    let greenAltRetroAnswerContext: import('./parts/green-alt-retro-context').GreenAltRetroAnswerPrompt | undefined;
    if (greenAltRetroAnswer) {
      const { entryId, optionId } = greenAltRetroAnswer;
      if (optionId) {
        const { buildGreenAltRetroClosingTurn, buildGreenAltRetroClosingSseStream } = await import('./parts/green-alt-retro-turn');
        const closingTurn = buildGreenAltRetroClosingTurn({ entryId, optionId, locale });
        if (closingTurn) {
          if (userId && supabase) {
            const { recordGreenAltRetroEvent } = await import('./parts/green-alt-retro-persist');
            fireAndForgetSafely(
              recordGreenAltRetroEvent({
                userId,
                store: supabase as unknown as import('./parts/green-alt-retro-persist').GreenAltRetroPersistStore,
                entryId,
                reason: optionId,
              }),
            );
          }
          logger.info('[Chat API] Green-alt retro answer (option), returning closing turn');
          if (stream) {
            return mergeCookiesOnResponse(
              new Response(buildGreenAltRetroClosingSseStream(closingTurn), { headers: { ...SSE_HEADERS } }),
            );
          }
          return mergeCookies(
            NextResponse.json({ reply: closingTurn.reply, reasoning: undefined, toolCalls: undefined }),
          );
        }
      } else {
        const { shouldDeferGreenAltRetro } = await import('./parts/green-alt-retro-gate');
        if (!shouldDeferGreenAltRetro(userContent, locale)) {
          // 自由文本回答: 只存定性词与原话 (freeform), 回复回落 Letta 但必须注入结构化复盘证据
          const { sanitizeGreenAltRetroNote } = await import('@/lib/green-alt-retro');
          const note = sanitizeGreenAltRetroNote(userContent);
          if (userId && supabase) {
            const { recordGreenAltRetroEvent } = await import('./parts/green-alt-retro-persist');
            fireAndForgetSafely(
              recordGreenAltRetroEvent({
                userId,
                store: supabase as unknown as import('./parts/green-alt-retro-persist').GreenAltRetroPersistStore,
                entryId,
                reason: 'freeform',
                note,
              }),
            );
          }
          const { buildGreenAltRetroAnswerPrompt } = await import('./parts/green-alt-retro-context');
          greenAltRetroAnswerContext = buildGreenAltRetroAnswerPrompt({ entryId, note, locale });
        }
        // 让位 (新购买/紧急/数据问句): 不当回答也不追问, 普通链路接管
      }
    }

    // 🌱 batch68-a 复盘追问轮: 上一轮采纳了绿色替代 (客户端会话态 pending 一次性
    //    上行) 且本轮不是新购买/紧急求助/数据问句/绿色替代再请求 → canned 承认 +
    //    追问一次 (4 个非羞辱选项卡 + 自由文本提示)。greenPref 'off' 整体静默;
    //    让位时 pending 客户端已消费, 不顺延 — 每条采纳只追问一次。链序红线:
    //    本块在回答块之后、reflection canned 之前, 由 source-order 测试锁定。
    if (greenAltRetroPending && greenPref !== 'off') {
      const { shouldDeferGreenAltRetro } = await import('./parts/green-alt-retro-gate');
      if (!shouldDeferGreenAltRetro(userContent, locale)) {
        const { buildGreenAltRetroAskTurn, buildGreenAltRetroAskSseStream } = await import('./parts/green-alt-retro-turn');
        const askTurn = buildGreenAltRetroAskTurn({ entryId: greenAltRetroPending.entryId, locale });
        if (askTurn) {
          logger.info('[Chat API] Green-alt retro ask turn');
          if (stream) {
            return mergeCookiesOnResponse(
              new Response(buildGreenAltRetroAskSseStream(askTurn), { headers: { ...SSE_HEADERS } }),
            );
          }
          return mergeCookies(
            NextResponse.json({
              reply: askTurn.reply,
              reasoning: undefined,
              toolCalls: undefined,
              greenAltRetro: askTurn.greenAltRetro,
            }),
          );
        }
      }
    }

    // 🔧 P0-1 fix (2026-07-20): 反思问题检测 — 直接返回 canned reply, 不调 Letta AI
    //   根因: 用户点击反思引导组件的问题后, 消息发给 Letta AI, 但 AI 的 persona
    //   (mirror, 不问探究性问题) 与反思问题冲突, 导致 AI 60s 无响应.
    //   修复: 检测到反思问题时, 直接返回 canned reply (引导用户自己回答).
    const { isReflectionQuestion, getReflectionCannedReply } = await import('./parts/reflection-detector');
    if (isReflectionQuestion(userContent)) {
      const cannedReply = getReflectionCannedReply(locale);
      logger.info('[Chat API] Reflection question detected, returning canned reply');

      if (stream) {
        // 流式模式: 通过 SSE 返回 canned reply
        const encoder = new TextEncoder();
        const cannedStream = new ReadableStream<Uint8Array>({
          start(controller) {
            // 分块发送 (模拟 typing 效果)
            const chunks = cannedReply.match(/.{1,15}/g) || [cannedReply];
            chunks.forEach((chunk) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          },
        });
        return mergeCookiesOnResponse(
          new Response(cannedStream, {
            headers: { ...SSE_HEADERS },
          }),
        );
      }
      // 非流式模式
      return mergeCookies(
        NextResponse.json({
          reply: cannedReply,
          reasoning: undefined,
          toolCalls: undefined,
        }),
      );
    }

    // 🐘 batch48-b 反驳降温: 上一轮发过守护卡 + 本轮命中反驳意图 → 不调 Letta
    //    (杜绝第二次拦截话术), 直接 canned 降温回复 + 冷静卡。与守护卡同一开关:
    //    guard-off 时客户端不会渲染守护卡 → afterGuardCard 恒 false, 此处再挡一道。
    if (greenPref !== 'off') {
      const { buildCooldownTurn, buildCooldownSseStream } = await import('./parts/cooldown-turn');
      const cooldownTurn = buildCooldownTurn({ userContent, locale, afterGuardCard: afterGuardCard === true });
      if (cooldownTurn) {
        logger.info('[Chat API] Pushback detected, returning cooldown turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildCooldownSseStream(cooldownTurn), {
              headers: { ...SSE_HEADERS },
            }),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: cooldownTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            cooldownCard: cooldownTurn.cooldownCard,
          }),
        );
      }
    }

    // 🐘 batch65-a 重复购买预检: 明确问「还要不要再买 / 家里有没有」时,
    //    先给决策卡再谈浏览比较; 比通用买前求问更具体, 因此先判。
    {
      const { buildDuplicatePurchaseTurn, buildDuplicatePurchaseSseStream } = await import('./parts/duplicate-purchase-turn');
      const duplicateTurn = buildDuplicatePurchaseTurn({ userContent, locale });
      if (duplicateTurn) {
        logger.info('[Chat API] Duplicate-purchase precheck detected');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildDuplicatePurchaseSseStream(duplicateTurn), { headers: { ...SSE_HEADERS } }),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: duplicateTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            duplicatePrecheckCard: duplicateTurn.duplicatePrecheckCard,
          }),
        );
      }
    }


    // 🐘 batch50-a 买前三问: 用户主动求问 ("该买 X 吗") → 不调 Letta 泛泛建议,
    //    直接 canned 迎接回复 + 三问决策卡 (用户自己的问题, 守护开关不挡 —
    //    与 48-b 反驳降温的被动拦截不同)。放在反驳降温之后: 两流意图互斥。
    {
      const { buildPrepurchaseTurn, buildPrepurchaseSseStream } = await import('./parts/prepurchase-turn');
      const prepurchaseTurn = buildPrepurchaseTurn({ userContent, locale });
      if (prepurchaseTurn) {
        logger.info('[Chat API] Pre-purchase question detected, returning three-questions turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildPrepurchaseSseStream(prepurchaseTurn), {
              headers: { ...SSE_HEADERS },
            }),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: prepurchaseTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            prepurchaseCard: prepurchaseTurn.prepurchaseCard,
          }),
        );
      }
    }

    // 🐘 batch53-a 绿色承诺: 用户主动口头承诺 ("这个月不买X") → 不调 Letta 泛泛
    //    鼓励, 直接 canned 迎接回复 + 承诺登记卡 (确认后才落 health_events)。
    //    放在求问/反驳之后: 三流意图互斥 (detector 内排除)。
    {
      const { buildCommitmentTurn, buildCommitmentSseStream } = await import('./parts/commitment-turn');
      const commitmentTurn = buildCommitmentTurn({ userContent, locale });
      if (commitmentTurn) {
        logger.info('[Chat API] Green commitment detected, returning commitment turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildCommitmentSseStream(commitmentTurn), {
              headers: { ...SSE_HEADERS },
            }),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: commitmentTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            commitmentCard: commitmentTurn.commitmentCard,
          }),
        );
      }
    }

    // 🐘 batch56-a 对比裁决: 用户二选一求问 ("买A还是B / A vs B") → 不调 Letta
    //    泛泛安利, 直接 canned 迎接回复 + 对比裁决卡 (三行裁决 + 选 A/B chips,
    //    点选后才落 health_events)。放在求问/反驳/承诺之后: 四流意图互斥
    //    (detector 内排除更强意图)。
    {
      const { buildCompareTurn, buildCompareSseStream } = await import('./parts/compare-turn');
      const compareTurn = buildCompareTurn({ userContent, locale });
      if (compareTurn) {
        logger.info('[Chat API] Compare intent detected, returning compare turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildCompareSseStream(compareTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: compareTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            compareCard: compareTurn.compareCard,
          }),
        );
      }
    }

    // 🐘 batch57-a 清单分诊: 购物清单批量消息 ("周末要买这些：A、B、C、D") →
    //    不调 Letta 泛泛安利, 直接 canned 迎接回复 + 清单分诊卡 (逐条三态 +
    //    就买/看替代/再想想 chips, 点选后才落 health_events)。放在反驳/求问/
    //    承诺/对比之后: 五流意图互斥 (detector 内排除更强意图)。
    {
      const { buildListTriageTurn, buildListTriageSseStream } = await import('./parts/list-triage-turn');
      const { defaultGuardScope } = await import('@/lib/guard-scope');
      const listTriageTurn = buildListTriageTurn({ userContent, locale, guardScope: guardScope ?? defaultGuardScope() });
      if (listTriageTurn) {
        logger.info('[Chat API] Shopping list detected, returning list triage turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildListTriageSseStream(listTriageTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: listTriageTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            listTriageCard: listTriageTurn.listTriageCard,
          }),
        );
      }
    }

    // 🐘 batch59-c 追问跟随: 数据问答之后的短追问 ("那上个月呢" / "那外卖呢")
    //    → 用客户端上行的最近数据问答卡元数据 (内存级会话态) 重算, 数字全部
    //    复用 57-c/58-c 聚合。排在 58-c 分类/时段与 57-c 月度检测之前: 短追问
    //    不带完整问句形态, 但 "上个月省了多少" 这类完整问句 detector 内排除
    //    (FULL_QUERY 让路) — 无上文 (dataQueryContext 缺失/形状不全) 也回落
    //    普通检测链, 绝不拿空窗口算数。
    {
      const { detectFollowUpQuery, resolveFollowUpContext } = await import('./parts/follow-up-query');
      const followUpIntent = detectFollowUpQuery(userContent);
      const resolved = followUpIntent ? resolveFollowUpContext(dataQueryContext ?? null, followUpIntent) : null;
      if (resolved) {
        const { buildFollowUpTurn, buildFollowUpSseStream } = await import('./parts/follow-up-turn');
        const { loadSavingsQueryEvents } = await import('./parts/savings-query-context');
        const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
        const [events, hourlyRate] = await Promise.all([
          loadSavingsQueryEvents({
            userId,
            store: (supabase ?? undefined) as unknown as import('./parts/savings-query-context').SavingsQueryStore | undefined,
          }),
          userId ? getUserHourlyRate(userId).catch(() => 25) : Promise.resolve(25),
        ]);
        const followUpTurn = buildFollowUpTurn({ resolved, locale, events, now: new Date(), hourlyRate });
        logger.info('[Chat API] Follow-up query detected, returning follow-up turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildFollowUpSseStream(followUpTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: followUpTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            ...(followUpTurn.savingsQueryCard ? { savingsQueryCard: followUpTurn.savingsQueryCard } : {}),
            ...(followUpTurn.categoryQueryCard ? { categoryQueryCard: followUpTurn.categoryQueryCard } : {}),
            ...(followUpTurn.impulseTimeCard ? { impulseTimeCard: followUpTurn.impulseTimeCard } : {}),
          }),
        );
      }
    }

    // 🐘 batch58-c 分类问句 ("这个月奶茶拦截了几次") — 57-c 问账的维度细化:
    //    品类词归一到五类之一才命中, 否则回落下方 57-c 月度总答。canned
    //    分类对账卡 (拦截/替代/复用计数, resolveGuardCategory 同口径), 零金额。
    {
      const { detectCategoryQuery } = await import('./parts/category-query-detector');
      if (detectCategoryQuery(userContent)) {
        const { buildCategoryQueryTurn, buildCategoryQuerySseStream } = await import('./parts/category-query-turn');
        const { loadSavingsQueryEvents } = await import('./parts/savings-query-context');
        const events = await loadSavingsQueryEvents({
          userId,
          // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
          store: (supabase ?? undefined) as unknown as import('./parts/savings-query-context').SavingsQueryStore | undefined,
        });
        const turn = buildCategoryQueryTurn({ userContent, locale, events, now: new Date() })!;
        logger.info('[Chat API] Category query detected, returning category turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildCategoryQuerySseStream(turn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: turn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            categoryQueryCard: turn.categoryQueryCard,
          }),
        );
      }
    }

    // 🐘 batch58-c 时段问句 ("我晚上冲动买的多吗") — 复用 48-c
    //    aggregateImpulseWindows 的分桶统计 (次数/天数 only), canned 回复,
    //    零金额零碳数值, 非羞辱框架 (看见规律不是认罪)。
    {
      const { detectImpulseTimeQuery } = await import('./parts/impulse-time-query-detector');
      if (detectImpulseTimeQuery(userContent)) {
        const { buildImpulseTimeQueryTurn, buildImpulseTimeSseStream } = await import('./parts/impulse-time-query-turn');
        const { loadSavingsQueryEvents } = await import('./parts/savings-query-context');
        const events = await loadSavingsQueryEvents({
          userId,
          store: (supabase ?? undefined) as unknown as import('./parts/savings-query-context').SavingsQueryStore | undefined,
        });
        const turn = buildImpulseTimeQueryTurn({ userContent, locale, events, now: new Date() })!;
        logger.info('[Chat API] Impulse time query detected, returning impulse time turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildImpulseTimeSseStream(turn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: turn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            impulseTimeCard: turn.impulseTimeCard,
          }),
        );
      }
    }

    // 🐘 batch62-c 未来 7 天冲动风险预报: 用户往前问 ("下周容易冲动吗 /
    //    这几天什么时候危险 / next week risk") → 不调 Letta, canned 回复 +
    //    预报卡 (forecastImpulseRisk 近 8 周同星期几规律, 次数/天数/时段 only,
    //    提前准备框架, 不承诺预测准确率)。同一块接住预报卡后的单日追问
    //    ("那周六呢"): 客户端上行的 dataQueryContext kind='forecast' 为资格
    //    标记, 星期词由 detectForecastDayFollowUp 归一。放在 58-c 时段问句
    //    之后、57-c 问账之前: 回顾型统计问句在 detector 内让路, 完整数据
    //    问答仍走既有链路不抢路由 (source-order 测试锁定)。
    {
      const { detectForecastQuery, detectForecastDayFollowUp } = await import('./parts/impulse-forecast-detector');
      const isForecastQuery = detectForecastQuery(userContent);
      const forecastPrev = dataQueryContext?.kind === 'forecast';
      const forecastDay = forecastPrev && !isForecastQuery ? detectForecastDayFollowUp(userContent) : null;
      if (isForecastQuery || forecastDay !== null) {
        const { buildImpulseForecastTurn, buildImpulseForecastDayTurn, buildImpulseForecastSseStream } = await import('./parts/impulse-forecast-turn');
        const { loadImpulseForecastEvents } = await import('./parts/impulse-forecast-context');
        const events = await loadImpulseForecastEvents({
          userId,
          // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
          store: (supabase ?? undefined) as unknown as import('./parts/impulse-forecast-context').ImpulseForecastStore | undefined,
        });
        const now = new Date();
        const forecastTurn = forecastDay !== null
          ? buildImpulseForecastDayTurn({ day: forecastDay, locale, events, now })
          : buildImpulseForecastTurn({ userContent, locale, events, now })!;
        logger.info('[Chat API] Impulse forecast detected, returning forecast turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildImpulseForecastSseStream(forecastTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: forecastTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            impulseForecastCard: forecastTurn.impulseForecastCard,
          }),
        );
      }
    }

    // 🐘 batch68-c 按小时守护脉搏: 用户问自己的小时级节奏 ("我什么时候最容易
    //    冲动 / my weakest shopping hour") → 不调 Letta, canned 回复 + 脉搏卡
    //    (aggregateGuardPulse 近 28 天 0-23 小时聚合, 只读 health_events +
    //    profiles.timezone, 零 DDL)。只显示小时/次数/天数, 无金额无碳数值,
    //    看见节奏不是认罪。放在 62-c 预报之后、57-c 问账之前: 前瞻词让回
    //    预报、四桶时段词让回 58-c、品类词让回分类问句 (detector 内让路 +
    //    source-order 测试锁定)。
    {
      const { detectGuardPulseQuery } = await import('./parts/guard-pulse-detector');
      if (detectGuardPulseQuery(userContent)) {
        const { buildGuardPulseTurn, buildGuardPulseSseStream } = await import('./parts/guard-pulse-turn');
        const { loadGuardPulseQueryData } = await import('./parts/guard-pulse-context');
        const { events, timezone } = await loadGuardPulseQueryData({
          userId,
          // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
          store: (supabase ?? undefined) as unknown as import('./parts/guard-pulse-context').GuardPulseStore | undefined,
        });
        const pulseTurn = buildGuardPulseTurn({ userContent, locale, events, now: new Date(), timezone })!;
        logger.info('[Chat API] Guard pulse detected, returning guard pulse turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildGuardPulseSseStream(pulseTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: pulseTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            guardPulseCard: pulseTurn.guardPulseCard,
          }),
        );
      }
    }

    // 🐘 batch57-c 问账: 用户直接问账 ("这个月省了多少 / 上周守护了几次")
    //    → 不调 Letta (它看不到聚合数字, 只能含糊或编造金额), 直接 canned
    //    对账回复 + 问账卡 (数字全部来自既有聚合 lib, 绝不经手 Letta)。
    //    放在购物类 detector 之后: 问账是提问不是购物意图, 互斥由 detector
    //    内排除 + 链序双保险。
    {
      const { detectSavingsQuery } = await import('./parts/savings-query-detector');
      if (detectSavingsQuery(userContent)) {
        const { buildSavingsQueryTurn, buildSavingsQuerySseStream } = await import('./parts/savings-query-turn');
        const { loadSavingsQueryEvents } = await import('./parts/savings-query-context');
        const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
        const [events, hourlyRate] = await Promise.all([
          loadSavingsQueryEvents({
            userId,
            // SupabaseClient 运行时满足最小结构面 (与 factsStore 同款边界收窄)
            store: (supabase ?? undefined) as unknown as import('./parts/savings-query-context').SavingsQueryStore | undefined,
          }),
          userId ? getUserHourlyRate(userId).catch(() => 25) : Promise.resolve(25),
        ]);
        const savingsQueryTurn = buildSavingsQueryTurn({
          userContent,
          locale,
          events,
          now: new Date(),
          hourlyRate,
        });
        if (savingsQueryTurn) {
          logger.info('[Chat API] Savings query detected, returning statement turn');
          if (stream) {
            return mergeCookiesOnResponse(
              new Response(buildSavingsQuerySseStream(savingsQueryTurn),
                { headers: { ...SSE_HEADERS } },
              ),
            );
          }
          return mergeCookies(
            NextResponse.json({
              reply: savingsQueryTurn.reply,
              reasoning: undefined,
              toolCalls: undefined,
              savingsQueryCard: savingsQueryTurn.savingsQueryCard,
            }),
          );
        }
      }
    }

    let suppressGuardCards = false;
    try {
      const { buildShoppingClarifyTurn, buildShoppingClarifySseStream } = await import('./parts/shopping-clarify-turn');
      const { classifyShoppingIntent } = await import('@/lib/shopping-intent-clarify');
      const clarification = buildShoppingClarifyTurn({ userContent, locale, askedSubjects: askedShoppingSubjects });
      const intent = clarification ? undefined : classifyShoppingIntent({ message: userContent, locale, askedSubjects: askedShoppingSubjects });
      suppressGuardCards = intent?.confidence === 'not_purchase';
      if (clarification) {
        if (stream) {
          return mergeCookiesOnResponse(new Response(buildShoppingClarifySseStream(clarification), { headers: { ...SSE_HEADERS } }));
        }
        return mergeCookies(NextResponse.json({
          reply: clarification.reply,
          reasoning: undefined,
          toolCalls: undefined,
          shoppingClarifyCard: clarification.shoppingClarifyCard,
        }));
      }
    } catch {
      suppressGuardCards = false;
    }

    // 🐘 batch60-c 情绪守护: 带着情绪提起购买 ("今天好累，想买点东西哄自己")
    //    → 不当普通购买挑战, canned 共情回复 + 三选项守护卡 (花钱安慰/免费安抚/
    //    先等 10 分钟, 选择权在用户)。排位红线: 数据问答 (59-c/58-c/57-c) 在前
    //    优先; 通用购买预检 (BNPL/green/reuse/micro, loadLettaTurnContext 内)
    //    在后 — BNPL/绿色品类/问答形态由 detector 内让路, 链序由 source-order
    //    测试锁定; 高风险语义 detector 内排除, 自然降级通用聊天。
    if (!suppressGuardCards) {
      const { buildEmotionGuardTurn, buildEmotionGuardSseStream } = await import('./parts/emotion-guard-turn');
      const emotionGuardTurn = buildEmotionGuardTurn({ userContent, locale, guardIntensity, greenPref });
      if (emotionGuardTurn) {
        logger.info('[Chat API] Emotion shopping detected, returning emotion guard turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildEmotionGuardSseStream(emotionGuardTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: emotionGuardTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            emotionGuardCard: emotionGuardTurn.emotionGuardCard,
          }),
        );
      }
    }

    // 🐘 batch61-b 购物场景弱信号: 生活语言里的消费决策 ("想奖励自己 / 最后三单 /
    //    快坏了"), 无标准购物关键词时既有强 detector 全部漏接 → 弱信号词表命中后
    //    按语义路由到既有能力 (情绪→60-c 情绪卡 / 促销→48-b 冷静卡 / 耗损→50-a
    //    三问 + 绿色替代), canned 短路不调 Letta。排位红线: 60-c 情绪守护等强
    //    detector 在前优先, loadLettaTurnContext (BNPL/green/reuse/micro 通用购买
    //    预检) 在后 — 数据问句/明确购物意图/纯闲聊在 detector 层让路, 链序由
    //    source-order 测试锁定。已纠正的信号词条 (会话级) 本轮不参与匹配;
    //    greenPref 'off' 视为拒绝守护, 整体静默。
    if (greenPref !== 'off' && !suppressGuardCards) {
      const { buildContextSignalTurn, buildContextSignalSseStream } = await import('./parts/context-signal-turn');
      let trustFacts;
      let trustHistory;
      let trustCorrection;
      if (userId && factsStore) {
        const [{ loadShoppingFacts }, { loadContextTrustEvidence }] = await Promise.all([
          import('@/lib/shopping-facts'),
          import('./parts/context-trust-evidence'),
        ]);
        const [loaded, evidence] = await Promise.all([
          loadShoppingFacts(userId, factsStore),
          loadContextTrustEvidence(userId, factsStore as unknown as EvidenceStore).catch(() => ({ history: [], correction: null })),
        ]);
        trustFacts = loaded.facts.slice(0, 3);
        trustHistory = evidence.history;
        trustCorrection = evidence.correction;
      }
      const contextSignalTurn = buildContextSignalTurn({
        userContent,
        locale,
        guardIntensity,
        greenPref,
        dismissedEntryIds: dismissedContextSignals,
        facts: trustFacts,
        history: trustHistory,
        correction: trustCorrection,
      });
      if (contextSignalTurn) {
        const dismissed = dismissedContextSignals ?? [];
        const correctedTrustSignals = new Set(
          trustCorrection?.topic
            ? [...dismissed, trustCorrection.topic]
            : dismissed,
        );
        if (contextSignalTurn.contextSignal.words.every((word) => correctedTrustSignals.has(word.id))) {
          contextSignalTurn.contextTrust = undefined;
        }
        logger.info('[Chat API] Shopping context signal detected, returning context signal turn');
        if (stream) {
          return mergeCookiesOnResponse(
            new Response(buildContextSignalSseStream(contextSignalTurn),
              { headers: { ...SSE_HEADERS } },
            ),
          );
        }
        return mergeCookies(
          NextResponse.json({
            reply: contextSignalTurn.reply,
            reasoning: undefined,
            toolCalls: undefined,
            contextSignal: contextSignalTurn.contextSignal,
            contextTrust: contextSignalTurn.contextTrust,
            ...(contextSignalTurn.emotionGuardCard ? { emotionGuardCard: contextSignalTurn.emotionGuardCard } : {}),
            ...(contextSignalTurn.cooldownCard ? { cooldownCard: contextSignalTurn.cooldownCard } : {}),
            ...(contextSignalTurn.prepurchaseCard ? { prepurchaseCard: contextSignalTurn.prepurchaseCard } : {}),
          }),
        );
      }
    }

    // batch26-c 拆分: 上下文装载（修身阶段/时薪/buddy 统计/RAG/挑战历史）+ BNPL/symy cart/green/reuse
    // 预检 + userContentWithStage 组装 → parts/letta-turn-context.ts（纯机械搬移，内部
    // await / fire-and-forget 顺序逐一保留）。
    // 🧺 batch25-b 接线: factsStore 由 route 侧构建后传入, 加载半程 loadFactsForContext
    //    与 symy_shopping_facts 注入随拆分落 parts/letta-turn-context.ts。
    const turnContext = await loadLettaTurnContext({
      userId,
      supabase,
      userContent,
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
    if (!userAgentId) {
      logger.error('[Chat API] No per-user agent available for user:', userId);

      // 🔧 Round 112 P0-1b fix: AI 失败时退还 See it 额度
      //    challenge create 已经 increment 了 daily_see_it_count, AI 失败时必须 decrement
      //    否则用户额度被无效消耗 (5 left → 4 left → 3 left, 但没得到服务)
      // 🔧 Round 120 audit fix (AUDIT-2 P0 #3 + AUDIT-1 refactor #3):
      //    旧代码 catch + warn + 仍告诉用户 "refunded" → 退款失败时用户被欺骗
      //    新代码: 调用 refundChallengeQuota helper, 根据结果决定文案
      let refundSucceeded = false;
      if (userId && validChallengeContext) {
        const { refundChallengeQuota } = await import('./parts/refund-challenge-quota');
        const refundResult = await refundChallengeQuota(userId);
        refundSucceeded = refundResult.refunded;
        if (!refundSucceeded) {
          logger.error('[Chat API] Refund FAILED for user (AI unavailable):', userId, refundResult.error);
        }
      }

      // 🔧 Round 120 audit fix: 退款失败时显示不同文案 (不再撒谎 "refunded")
      const refundMsg = validChallengeContext ? (refundSucceeded ? 'AI is still initializing. Your See-it was refunded — please try again in a moment.' : 'AI is still initializing. Please try again in a moment. (If your See-it quota was consumed, please contact support.)') : 'AI is still initializing. Please try again in a moment.';
      if (stream) {
        return mergeCookiesOnResponse(new Response(`data: ${JSON.stringify({ type: 'error', content: refundMsg })}\n\n`, { headers: { ...SSE_HEADERS } }));
      }
      return mergeCookies(NextResponse.json({ error: refundMsg }, { status: 503 }));
    }

    // 🔧 架构优化 Round 58: 移除死循环 (Finding 7) — agentIds 只有 1 个元素, for...of 是遗留代码
    const targetAgentId = userAgentId;

    let lettaStreamSucceeded = false;
    let streamRefundSucceeded = false; // 🔧 Round 120: hoisted to outer scope for use in error message
    try {
      // 🚀 流式模式：前端请求 stream=true 时，使用 SSE 让用户更早看到首 token
      if (stream) {
        const innerStream = await streamToAgent(userContentWithStage, impulseContext, userId || undefined, targetAgentId);
        // 🛡️ V2: Use challenge-aware compensation wrapper
        const monitoredStream = wrapStreamWithAudit(innerStream, userContent, userId, impulseContext, validChallengeContext, targetAgentId);
        // 🌐 batch72-a: 包在审计 wrapper 之外 (canned 词不计入 aiOutput)、预注入包装之内。
        //    fallback 契约未命中时原流直通；i18n key 由构建函数强制存在。
        //    非流式路径不接 (等待话术是 SSE 流式体验, 非流式保持现状)。
        const webSearchWaitStream = withWebSearchWaitEvent(monitoredStream, buildWebSearchWaitTurn(userContent, locale));
        // 🔁 复用优先: reuse_hint 预注入 (guard-off/未命中 → 原流直通, 与 green 侧零包装对称)
        let sseBody = reuseHint
          ? prependReuseHintEvent(webSearchWaitStream, reuseHintSseEvent(reuseHint))
          : webSearchWaitStream;
        // 🌱 绿色替代命中时在最前面注入 green_alt 事件 (谁后包装谁更靠前 → green_alt 排 reuse_hint 前)
        sseBody = withGreenAltEvent(sseBody, greenAltCard);
        // 📖 batch47-a 知识问答: 命中时注入 green_knowledge 事件 (最晚包装 → 排最前, chip 展示在卡片区顶部)
        sseBody = withGreenKnowledgeEvent(sseBody, greenKnowledge.card);
        // 🐘 batch55-c 替代足迹: 命中时注入 alt_footprint 事件 (最晚包装 → 排最前, 足迹卡展示在卡片区顶部)
        sseBody = withAltFootprintEvent(sseBody, altFootprintCard);
        // 🐞 batch46-b: 微挑战预注入 (最先包装 → 排最后, 与卡片渲染顺序 green → reuse → micro 一致)
        if (microChallenge) {
          sseBody = prependReuseHintEvent(sseBody, microChallengeSseEvent(microChallenge));
        }
        lettaStreamSucceeded = true;

        // 🔧 ARCH fix (Round 3 SSE H3): 用 mergeCookiesOnResponse 把刷新的 auth cookie 写回。
        //    旧代码直接返回 new Response(monitoredStream), 刷新的 cookie 丢失 → 长 SSE 后 401。
        // 🔁 复用优先: reuse_hint 预注入事件包在审计 wrapper 外层 — 事件落在 SSE 字节流最前,
        //    审计 wrapper (内层) 只认 token 事件不受影响; Letta 原生事件顺序不变。
        //    合流 (batch24-a): reuse 先包装、green 后包装 (谁后包装谁更靠前) →
        //    双命中时字节序 green_alt → reuse_hint → Letta 原生事件, 与卡片渲染顺序一致。
        const sseResponse = new Response(sseBody, {
          headers: { ...SSE_HEADERS },
        });
        return mergeCookiesOnResponse(sseResponse);
      }

      // 非流式模式（fallback / 旧版前端兼容）
      const testResult = await processLettaResponse(userContentWithStage, impulseContext, userId || undefined, targetAgentId, validChallengeContext);

      // 📋 AI 行为审计（道用四·减法 + 六·公开）— 异步写入，不阻塞响应
      // 🔧 ARCH fix (Round 22 BUG-R22-C1): 用 fireAndForgetSafely 防 Vercel kill 丢失审计日志
      if (userId) {
        const isChallenge = !!validChallengeContext;
        const auditAction = isChallenge ? 'challenge_judge' : 'tool_call';
        fireAndForgetSafely(
          logAIBehavior({
            userId,
            action: auditAction,
            userInput: userContent,
            aiOutput: testResult.reply,
            toolCalls: testResult.toolCalls?.map((tc) => ({
              name: tc.name,
              arguments: tc.args,
              result: tc.result,
              success: !!tc.result,
            })),
            context: {
              impulseContext,
              challengeContext: validChallengeContext,
              reasoning: testResult.reasoning,
              cultivationStage: lettaCultivationStage,
              ragContexts: lettaUserHistory ? lettaUserHistory.length : 0,
            },
            aiPath: 'letta',
            agentId: targetAgentId,
          }),
        );
      }

      // PostHog GenAI: capture LLM generation (non-stream)
      fireAndForgetSafely(
        captureLLMGeneration({
          distinctId: userId || 'guest',
          input: String(userContent).substring(0, 2000),
          output: String(testResult.reply).substring(0, 2000),
          model: 'letta-glm-5.2',
          latencyMs: Math.max(0, Date.now() - requestStartTime),
          properties: {
            $ai_trace_id: targetAgentId,
            mode: 'non-stream',
            hasChallenge: !!validChallengeContext,
          },
        }),
      );

      return Response.json({
        reply: testResult.reply,
        reasoning: testResult.reasoning,
        toolCalls: testResult.toolCalls,
        // 🌱 绿色替代卡片 (未命中为 null → 前端不渲染)
        greenAlt: greenAltCard ?? undefined,
        // 🔁 复用优先: 非流式 fallback 也带 reuseHint 字段 (未命中/守卫关闭时缺省)
        ...(reuseHint ? { reuseHint } : {}),
        // 🐞 batch46-b: 非流式 fallback 也带 microChallenge 字段 (未命中/守卫关闭时缺省)
        ...(microChallenge ? { microChallenge } : {}),
        // 📖 batch47-a: 非流式 fallback 也带 greenKnowledge 字段 (未命中/守卫关闭时缺省)
        ...(greenKnowledge.card ? { greenKnowledge: greenKnowledge.card } : {}),
        // 🐘 batch55-c: 非流式 fallback 也带 altFootprint 字段 (未命中/样本不足时缺省)
        ...(altFootprintCard ? { altFootprint: altFootprintCard } : {}),
      });
    } catch (lettaError: unknown) {
      // 🔧 架构优化 Round 69 (Finding 10): 错误分类 — 区分配置错误/限流/服务故障
      const errMsg = lettaError instanceof Error ? lettaError.message : String(lettaError);
      const errorStatus = (lettaError as { status?: number }).status;
      if (errorStatus === 401 || errorStatus === 403) {
        logger.error(`[Chat API] Letta auth error (${errorStatus}):`, errMsg);
      } else if (errorStatus === 429) {
        logger.warn(`[Chat API] Letta rate limited:`, errMsg);
      } else if (errorStatus && errorStatus >= 500) {
        logger.error(`[Chat API] Letta server error (${errorStatus}):`, errMsg);
      } else {
        logger.warn(`[Chat API] Letta agent failed:`, errMsg);
      }

      // 🔧 Round 115 P0 fix: AI 失败时退还 See it 额度 (与 no-agent 路径一致)
      //    challenge create 已经 increment 了 daily_see_it_count, AI 失败时必须 decrement
      // 🔧 Round 120 audit fix (AUDIT-2 P0 #3): 用 refundChallengeQuota helper, 根据结果决定文案
      if (userId && validChallengeContext) {
        const { refundChallengeQuota } = await import('./parts/refund-challenge-quota');
        const refundResult = await refundChallengeQuota(userId);
        streamRefundSucceeded = refundResult.refunded;
        if (!streamRefundSucceeded) {
          logger.error('[Chat API] Refund FAILED (stream fail):', userId, refundResult.error);
        }
      }

      // PostHog GenAI: capture LLM error (non-stream)
      fireAndForgetSafely(
        captureLLMGeneration({
          distinctId: userId || 'guest',
          input: String(userContent).substring(0, 2000),
          output: '',
          model: 'letta-glm-5.2',
          latencyMs: Math.max(0, Date.now() - requestStartTime),
          isError: true,
          errorMessage: errMsg,
          properties: {
            $ai_trace_id: targetAgentId,
            mode: 'non-stream-error',
          },
        }),
      );
    }

    // 🔧 BUG-188 fix: 流式请求所有 Letta Agent 失败时，返回 SSE 错误而非 JSON
    if (stream && !lettaStreamSucceeded) {
      // 🔧 Round 120 audit fix: 退款失败时显示不同文案 (不再撒谎 "refunded")
      const streamErrMsg = validChallengeContext ? (streamRefundSucceeded ? 'AI service temporarily unavailable. Your See-it was refunded — please try again.' : 'AI service temporarily unavailable. Please try again. (If your See-it quota was consumed, please contact support.)') : 'AI service temporarily unavailable. Please try again.';
      const errorStream = new ReadableStream({
        start(ctrl) {
          sendSSEData(ctrl, { type: 'error', content: streamErrMsg });
          sendSSEData(ctrl, '[DONE]');
          closeSSE(ctrl);
        },
      });
      // 🔧 ARCH fix (Round 23 H4 — SSE fallback 缺 mergeCookiesOnResponse, token 刷新丢失):
      //    根因修复: 所有 Response 都用 mergeCookiesOnResponse 包裹。
      return mergeCookiesOnResponse(
        new Response(errorStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        }),
      );
    }
  }

  // 🔧 Architecture refactor: LLM Gateway / ZAI SDK fallback 路径已移除
  // 新架构下 Letta + GLM-5.2 是唯一路径。如果 Letta 整体不可用，返回 503 让前端提示用户重试。
  // 之前的 callLLMWithTools + 二次 LLM 调用 + tool calling 循环（~250 行）已删除。
  if (!hasAuth) {
    return mergeCookies(NextResponse.json({ error: 'Authentication required. Please sign in to chat with Symy.' }, { status: 401 }));
  }

  return mergeCookies(NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 503 }));
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
