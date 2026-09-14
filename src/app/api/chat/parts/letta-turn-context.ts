/**
 * Letta 单轮上下文装载 + 最终 prompt 组装。
 *
 * 职责：按固定顺序完成「加载用户状态（修身阶段 / 时薪 / buddy 统计 / RAG 历史 / 挑战历史）
 * → BNPL / symy cart / green pref / green_alt / reuse_hint 预检 → 拼装最终
 * userContentWithStage」，返回 Letta 调用与审计所需的全部产物。所有 side effect
 * （await 顺序与 fire-and-forget 触发点）与 route.ts 原实现逐一对应，永不阻塞的降级语义原样保留。
 *
 * 纯机械搬移自 route.ts batch26-c（行为逐字节等价；唯一调整：
 * './parts/user-history-context' 相对导入随文件落位改为 './user-history-context'）。
 * batch27-a 合并注记: batch25-b 的加载半程（factsStore 入参 → loadFactsForContext →
 * symy_shopping_facts 拼入 symyFields）按合并地图并入本文件, 语义与时序与 25-b 原版一致。
 */

import { logger } from '@/lib/logger';
import { retrieveUserContext, formatContextForPrompt } from '@/lib/rag';
import { triggerLazyBackfillIfNeeded } from '@/lib/embed-backfill';
import { getUserCultivationStage, triggerReassessIfNeeded, type CultivationStage } from '@/lib/cultivation';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
import { randomUUID } from 'crypto';
// 🔧 P0-3 fix (2026-07-18): sanitize challenge/impulse context fields before prompt interpolation
import { sanitizeItemName, sanitizePlatform, sanitizeReasons, sanitizeChallengeId } from './prompt-sanitizer';
import { getSymyCartTotalCents, getSymyGreenContext, sanitizeShoppingFactsForPrompt } from './context-builder';
// 🧺 batch25-b (shopping-facts 加载半程, 随 batch26-c 拆分从 route.ts 并入此文件):
//    每轮 context 注入购物事实摘要。单索引查询 best-effort, 表缺失/失败静默降级。
import { loadFactsForContext, type ShoppingFactsPipelineStore } from '@/lib/shopping-facts-pipeline';
// 🌱 绿色替代拦截→推荐: 发 Letta 前关键词预检, 命中给前端 green_alt 卡片标记 (Letta prompt 不动)
import { detectGreenAltCard } from './green-alt-detect';
// 🔁 复用优先 (reuse-first): 购物意图预检 → 命中复用类目时给 reuse_hint（与绿色守护同一开关）
import { detectReuseHint } from './reuse-detect';
// 🐞 batch46-b 微挑战预检: 购买意图 + 品类命中 + 7 天频控 → micro_challenge 提案
import { detectMicroChallenge } from './micro-challenge-detector';
// 📖 batch47-a 知识问答: 知识型提问 → 词条内容注入 Letta 上下文 + 来源 chip payload
import { buildGreenKnowledge } from './green-knowledge-context';
// 🧭 batch52-c 冲动触发画像: 独立注入点 — 聚合拦截原因画像, 单行摘要拼入 symyFields
import { loadImpulseProfileContextLine, type ImpulseProfileStore } from './impulse-profile-context';
// 🔮 batch62-c 冲动风险预报: 独立注入点 — 未来 7 天风险单行摘要拼入 symyFields
import { loadImpulseForecastContextLine, type ImpulseForecastStore } from './impulse-forecast-context';
// 🌱 batch53-a 绿色承诺: 独立注入点 — 进行中承诺单行摘要拼入 symyFields
import { loadGreenCommitmentContextLine, type GreenCommitmentStore } from './green-commitment-context';
// 🏅 batch54-a 小象高光记忆: 独立注入点 — 近 14 天高光单行摘要拼入 symyFields
import { loadRecentWinsContextLine, type RecentWinsStore } from './recent-wins-context';
// 🐘 batch55-c 替代足迹: 独立注入点 — adoption 聚合单行摘要拼入 symyFields + 足迹召回卡
import { loadAltAdoptionContext, type AltAdoptionStore } from './alt-adoption-context';
// 🎨 batch56-c 守护风格: 独立注入点 — 三轨聚合风格单行摘要拼入 symyFields
import { loadGuardStyleContext, type GuardStyleStore } from './guard-style-context';
import { loadSpendingCapContext, type SpendingCapStore } from './spending-cap-context';
// 🐘 batch62-b 拒绝偏好: 独立注入点 — 有效偏好摘要拼入 symyFields + 卡片候选排序降频
import { loadGreenAltPreferenceContext, type GreenAltPreferenceStore } from './green-alt-preference-context';
// 🌱 batch68-a 绿色采纳后复盘: 独立注入点 — 复盘证据行拼入 symyFields + 偏好 gap-fill 合并
import { loadGreenAltRetroContext, mergeGreenAltRetroPreference, type GreenAltRetroStore } from './green-alt-retro-context';
import type { MicroChallengeHistoryEntry } from '@/types/micro-challenge';
// 🔧 ARCH fix (Round 56 R56-Bug8): 用共享 getChallengeType 替代内联阈值
import { getChallengeType } from '@/lib/challenge-rules';
// 🛡️ batch48-a: 守护强度三档 → prompt 档位指令行 (balanced = 空串, 现状逐字节一致)
import { buildGuardIntensityPromptLine, greenAltIdToMicroChallengeCategory, normalizeGuardIntensity, type GuardIntensity } from '@/lib/guard-intensity';
// 🗺️ batch53-b: 守护范围三态 — scope 指令行注入 + 豁免品类拦截卡静默
import { buildGuardScopePromptLine, isCategoryExempt, normalizeGuardScope } from '@/lib/guard-scope';
import { type ChallengeContext } from './types';
import type { createAuthenticatedClient } from '@/lib/supabase-api';

type AuthedSupabase = NonNullable<Awaited<ReturnType<typeof createAuthenticatedClient>>['supabase']>;

export interface LettaTurnContextInput {
  userId: string | undefined;
  supabase: AuthedSupabase | null;
  userContent: string;
  locale: 'en' | 'zh';
  greenPref: 'on' | 'off' | undefined;
  /** 🛡️ batch48-a: 守护强度档位 (客户端 localStorage 透传); undefined = balanced (不注入指令行) */
  guardIntensity?: GuardIntensity | undefined;
  /** 🗺️ batch53-b: 守护范围三态 (客户端 localStorage 透传); 缺失/损坏 = 全默认 (行为与现状一致) */
  guardScope?: unknown;
  impulseContext: { platform?: string; amount?: number; reasons?: string[]; time?: string } | undefined;
  validChallengeContext: ChallengeContext | undefined;
  /** 🧺 batch25-b: route 侧构建的 shopping-facts store (service-key admin client), undefined 时摘要字段省略 */
  factsStore: ShoppingFactsPipelineStore | undefined;
  /** 🐞 batch46-b: 客户端 localStorage 维护的最近微挑战记录 (频控输入, 零信任形状已在 zod 收窄)。可选 — 旧测试/调用方缺省即无频控 */
  microChallengeHistory?: MicroChallengeHistoryEntry[] | undefined;
  suppressGuardCards?: boolean;
  /** 🌱 batch68-a: 自由文本复盘回答的证据行 + 收束指令 (仅回答轮; 缺省 = 现状行为) */
  greenAltRetroAnswerContext?: { evidenceLine: string; promptLine: string };
}

export async function loadLettaTurnContext(input: LettaTurnContextInput) {
  const { userId, supabase, userContent, locale, greenPref, guardIntensity, guardScope: guardScopeRaw, impulseContext, validChallengeContext, factsStore, microChallengeHistory, suppressGuardCards = false, greenAltRetroAnswerContext } = input;

  // 🧠 加载用户修身阶段（道体二·共生：AI 根据用户阶段调整风格）
  // 永不阻塞主流程 — 失败时用默认 zhi_yu
  let lettaCultivationStage: CultivationStage = 'zhi_yu';
  if (userId) {
    try {
      lettaCultivationStage = await getUserCultivationStage(userId);
      // 异步触发重新评估（1 小时缓存）
      triggerReassessIfNeeded(userId).catch((err) => logger.warn('[Chat API] triggerReassessIfNeeded failed:', err));
      if (lettaCultivationStage !== 'zhi_yu') {
        logger.info(`[Chat API] 🧠 Letta path cultivation stage: ${lettaCultivationStage}`);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
      // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Chat API] Failed to get cultivation stage:', err);
    }
  }

  // 💰 P0 fix: 加载用户时薪 — 用于 Freedom Translation (金钱↔生命时间换算)
  //    旧代码: AI prompt 用 hardcoded $20/hr → 用户改了时薪后 AI 仍用旧值
  //    根因修复: 从 profiles.hourly_rate 读取, 注入 context header, AI 用此 rate 换算
  //    永不阻塞主流程 — 失败时用默认 20
  let userHourlyRate = 20;
  if (userId) {
    try {
      userHourlyRate = await getUserHourlyRate(userId);
      if (userHourlyRate !== 20) {
        logger.info(`[Chat API] 💰 User hourly rate: $${userHourlyRate}/hr`);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
      // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Chat API] Failed to get user hourly rate:', err);
    }
  }

  // 🔧 P2-1 fix (2026-07-11): 加载用户 buddy_state 统计数据 — 用于 Look back 等功能
  //    旧代码: AI 不知道用户的真实统计 (total_saved, challenges_completed, streak, vitality)
  //    → Look back 回复中出现与 Buddy 页面不一致的数字 (如 "56 days" vs "10 days seeing")
  //    根因修复: 从 buddy_state 表读取真实数据, 注入 context header, AI 用此数据回复
  //    永不阻塞主流程 — 失败时跳过 (AI 仍能回复, 只是数字可能不准确)
  let buddyStatsInfo = '';
  let weeklyStreak = 0;
  if (supabase && userId) {
    try {
      const { data: buddyState } = await supabase.from('buddy_state').select('vitality, tokens, level, streak, total_saved, challenges_completed, health').eq('user_id', userId).maybeSingle();

      if (buddyState) {
        // 🔧 P1-2.2 fix (2026-07-21): challenges_completed 可能与 active_challenges 表不同步
        //   buddy_state.challenges_completed 是计数器字段 (RPC +1), active_challenges 是实时数据
        //   取 Math.max 确保注入 AI 的数字与 UI 显示一致 (UI 用 Math.max)
        let accurateChallengesCompleted = buddyState.challenges_completed ?? 0;
        try {
          const [{ count: passedCount }, { count: failedCount }] = await Promise.all([supabase.from('active_challenges').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'passed'), supabase.from('active_challenges').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'failed')]);
          const totalSaw = (passedCount ?? 0) + (failedCount ?? 0);
          accurateChallengesCompleted = Math.max(accurateChallengesCompleted, totalSaw);
        } catch {
          // safe to ignore: fallback to buddy_state.challenges_completed
        }

        weeklyStreak = buddyState.streak ?? 0;
        // 🔧 P2-2 fix: 用 "mood" 替代 "vitality" (与 Buddy 页面 UI 一致)
        buddyStatsInfo = ` | user_stats: mood ${buddyState.vitality}/100 (${buddyState.health}), level ${buddyState.level}, ${buddyState.streak}-day streak, total saved $${buddyState.total_saved}, challenges completed ${accurateChallengesCompleted}. Use these EXACT numbers when referencing the user's progress.`;
        logger.info(`[Chat API] 📊 Buddy stats injected: mood=${buddyState.vitality}, streak=${buddyState.streak}, saved=$${buddyState.total_saved}, challenges=${accurateChallengesCompleted}`);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
      // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Chat API] Failed to fetch buddy stats:', err);
    }
  }

  // 🧠 batch44-a: 加载用户盲区地图 — AI 记住用户当前的薄弱环节
  //    旧代码: AI 不知道用户的 blind spot (如"深夜 67%"), 回复泛化 ("Keep challenging!")
  //    根因修复: 从 /api/blind-spot-map 取 show=true 且 sample_count>=10 的前 1-2 条
  //    永不阻塞主流程 — 失败时静默降级 (AI 仍能回复)
  let blindSpotInfo = '';
  if (userId) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/blind-spot-map`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const visible = (data.blind_spots || [])
          .filter((b: { show: boolean; sample_count: number }) => b.show && b.sample_count >= 10)
          .slice(0, 2);
        if (visible.length > 0) {
          blindSpotInfo = ' | ' + visible.map((b: { type: string; rate: number | null }) => `blind_spot: ${b.type} ${b.rate ?? 0}%`).join(', ');
        }
      }
    } catch {
      // safe to ignore: non-critical profile data fetch failed; AI still replies
    }
  }

  // 🌱 RAG: 检索用户历史上下文（道体二·共生）+ 触发懒加载回填
  // 永不阻塞主流程 — 失败时 lettaUserHistory 为空
  let lettaUserHistory: string | undefined;
  if (userId) {
    // 异步触发懒加载回填（不等待）
    triggerLazyBackfillIfNeeded(userId).catch((err) => logger.warn('[Chat API] triggerLazyBackfillIfNeeded failed:', err));

    // 同步检索用户上下文（top-5 相关记录）
    if (userContent.trim().length > 0) {
      try {
        const ragResult = await retrieveUserContext(userId, userContent, 5);
        if (!ragResult.skipped && ragResult.contexts.length > 0) {
          lettaUserHistory = formatContextForPrompt(ragResult.contexts);
          logger.info(`[Chat API] 🌱 Letta path RAG retrieved ${ragResult.contexts.length} contexts (tokens: ${ragResult.queryEmbeddingTokens})`);
        } else if (ragResult.skipped) {
          logger.info(`[Chat API] 🌱 Letta path RAG skipped: ${ragResult.skipReason}`);
        }
        // safe to ignore: non-critical background operation, error already logged
      } catch (err) {
        // safe to ignore: non-critical background operation, error already logged
        logger.warn('[Chat API] Letta path RAG failed:', err);
      }
    }
  }

  // 🔧 PM-V3-4 fix: 注入用户挑战历史 — AI 从"镜子"变"教练"
  //   旧代码: AI 只有 buddyStatsInfo (总量统计) + RAG (语义检索)
  //   问题: AI 无法引用具体挑战历史 (商品名/金额/结果), 回复是通用模板
  //   修复: 注入近 5 次挑战明细 + 7 天失败模式, AI 可个性化回复
  //   例: "你上次买了 Nike Air Max $159, 这次又是鞋子——看到模式了吗?"
  let userChallengeHistory = '';
  if (userId) {
    try {
      const { getUserHistoryContext } = await import('./user-history-context');
      userChallengeHistory = (await getUserHistoryContext(userId)) || '';
      if (userChallengeHistory) {
        logger.info(`[Chat API] 📊 User challenge history injected (${userChallengeHistory.length} chars)`);
      }
    } catch (err) {
      // safe to ignore: non-critical error, logged for observability
      logger.warn('[Chat API] Failed to fetch user challenge history:', err);
    }
  }

  // 把阶段信息 + RAG 历史上下文作为 user message 的 context prefix 注入
  // 格式:
  //   [Context: user_id: UUID | cultivation_stage: zhi_zhi | challenge: itemName $amount | impulse: platform $amount]
  //   <user_history>...</user_history>
  //   <message>actual user message</message>
  // N46 fix: 注入 challengeContext 到 context header, 让 AI 知道当前在挑战中 (即使是非投降消息)
  // 🔧 状态外置: 同时注入 challengeId, 让 AI 调 complete_challenge 时只需传 challenge_id + status
  // 🔧 状态外置: 同时注入 impulseContext, 让 AI 调 record_impulse 时能从 context 取 platform/amount
  // 🔧 P0-3 fix (2026-07-18): sanitize itemName + challengeId + platform + reasons
  //    via prompt-sanitizer helpers (prevents prompt injection via newlines/control chars)
  const challengeInfo = validChallengeContext ? ` | challenge: ${sanitizeItemName(validChallengeContext.itemName)} $${validChallengeContext.amount} (tier: ${getChallengeType(validChallengeContext.amount)})${validChallengeContext.challengeId ? ` | challenge_id: ${sanitizeChallengeId(validChallengeContext.challengeId)}` : ''}` : '';
  // 🔧 ARCH fix (Round 69 BUG-AUDIT-69-7): impulseContext.amount 加 Number.isFinite 校验
  //    旧代码: impulseContext.amount?.toFixed(2) || 'unknown' — NaN.toFixed(2)="NaN" (truthy) → prompt 出现 "$NaN"
  //    根因修复: 显式检查 Number.isFinite, 否则用 'unknown'
  const impulseAmountStr = typeof impulseContext?.amount === 'number' && Number.isFinite(impulseContext.amount) ? impulseContext.amount.toFixed(2) : 'unknown';
  const impulseInfo = impulseContext ? ` | impulse_signal: ${sanitizePlatform(impulseContext.platform)} $${impulseAmountStr}${impulseContext.reasons?.length ? ` (signals: ${sanitizeReasons(impulseContext.reasons).join(', ')})` : ''} — NOTE: This is a DETECTED inducement signal (user is browsing/considering), NOT a confirmed purchase. Do NOT assume the user bought anything.` : '';
  // 🔧 ARCH fix (Round 22 BUG-R22-M3 — 注入 user_id 到 LLM prompt → PII 泄露到 Letta 对话历史):
  //    旧代码 [Context: user_id: ${userId} | ...] — UUID 被存入 Letta agent 长期记忆。
  //    UUID 本身不是直接 PII, 但与 Letta agent_id 1:1 映射, 若 Letta 数据泄露可关联到用户。
  //    根因修复: 移除 user_id 注入 (Letta agent 已通过 agentId 知道用户身份, 不需要 prompt 中的 user_id)。
  // 🔧 P0 fix: 注入 hourly_rate 到 context — AI 用此 rate 计算 Freedom Translation
  //    格式: hourly_rate: $50/hr (8 hr/day, 22 days/month)
  //    AI 应该用此 rate 把价格换算成小时数, 而不是默认 $20/hr
  const hourlyRateInfo = ` | hourly_rate: $${userHourlyRate}/hr (use THIS rate for Freedom Translation — convert prices to hours by dividing by ${userHourlyRate}. Do NOT use $20/hr unless this rate is 20.)`;

  // 🔧 P0-K-1 fix: BNPL (Buy Now Pay Later) 诱导检测
  //    斩杀线用户最常被 BNPL 诱导 (Klarna/Afterpay/Affirm/Zip/"4 payments"/"pay in 4")
  //    检测到 BNPL 时, 注入警告上下文让 AI 反映风险
  const { detectBNPL, buildBNPLContextPrefix } = await import('@/lib/bnpl-detector');
  const bnplMessage = userContent + ' ' + (validChallengeContext?.itemName || '');
  const bnplResult = detectBNPL(bnplMessage, validChallengeContext?.amount);
  const bnplPrefix = bnplResult.detected ? buildBNPLContextPrefix(bnplResult, userHourlyRate) : '';
  const symyUserRef = userId;
  const symyCartTotalCents = await getSymyCartTotalCents(symyUserRef);
  // 🌱 绿色守护开关: 请求级 body.greenPref 优先于 profiles 探测 (green_pref 列尚不存在,
  //    零 DDL)。关闭时脑侧收 symy_green_pref: off → 不再做绿色替代拦截。
  const symyGreenContext = await getSymyGreenContext(symyUserRef, greenPref);
  if (symyGreenContext.greenPref === 'off') {
    logger.info('[Chat API] symy_green_pref: off (client green guardian toggle)');
  }
  // 🧺 batch25-b: 读取购物事实摘要 — 与绿色上下文同级 best-effort。单索引查询
  //    (idx_shopping_facts_user_updated), 表缺失/失败静默 undefined → 字段省略,
  //    绝不阻塞聊天。
  const symyShoppingFacts = userId && factsStore
    ? await loadFactsForContext({ userId, store: factsStore })
    : undefined;
  // 🧭 batch52-c: 冲动触发画像摘要 — 与 shopping-facts 同级 best-effort。
  //    factsStore 即 route 侧 service-key admin client, 结构面满足只读查询;
  //    任何失败/样本不足在模块内静默降级为 undefined (字段省略), 绝不阻塞聊天。
  const symyImpulseProfile = await loadImpulseProfileContextLine({
    userId,
    store: factsStore as unknown as ImpulseProfileStore | undefined,
  });
  // 🔮 batch62-c: 未来 7 天冲动风险预报摘要 — 同级 best-effort。失败在模块内
  //    静默降级为 undefined (字段省略); 样本不足输出明确降级行, 绝不阻塞聊天。
  const symyImpulseForecast = await loadImpulseForecastContextLine({
    userId,
    store: factsStore as unknown as ImpulseForecastStore | undefined,
  });
  // 🌱 batch53-a: 进行中绿色承诺摘要 — 同级 best-effort, 失败/无承诺静默 undefined
  const symyGreenCommitment = await loadGreenCommitmentContextLine({
    userId,
    store: factsStore as unknown as GreenCommitmentStore | undefined,
  });
  // 🏅 batch54-a: 近 14 天高光摘要 — 同级 best-effort, 失败/无高光静默 undefined
  const symyRecentWins = await loadRecentWinsContextLine({
    userId,
    store: factsStore as unknown as RecentWinsStore | undefined,
  });
  // 🐘 batch55-c 替代足迹摘要 + 足迹召回卡 — 同级 best-effort, 失败/样本不足静默降级
  const altAdoption = await loadAltAdoptionContext({
    userId,
    store: factsStore as unknown as AltAdoptionStore | undefined,
    userContent,
    locale,
  });
  // 🎨 batch56-c 守护风格摘要 — 同级 best-effort, 失败/样本不足静默 undefined
  const guardStyle = await loadGuardStyleContext({
    userId,
    store: factsStore as unknown as GuardStyleStore | undefined,
  });
  const spendingCap = await loadSpendingCapContext(userId, supabase as unknown as SpendingCapStore | undefined);
  // 🐘 batch62-b 拒绝偏好摘要 — 同级 best-effort, 失败/无有效偏好静默降级 (空状态 = 现状行为)
  const greenAltPreference = await loadGreenAltPreferenceContext({
    userId,
    store: factsStore as unknown as GreenAltPreferenceStore | undefined,
    locale,
  });
  // 🌱 batch68-a 复盘证据 — 同级 best-effort: 历史复盘行 → 定性证据行 + 偏好 gap-fill
  //    合并 (显式拒绝偏好优先, already_have/rent_borrow 才产冷却)。失败静默降级为
  //    空事件, 合并后状态与 base 一致 = 现状行为。
  const greenAltRetro = await loadGreenAltRetroContext({
    userId,
    store: factsStore as unknown as GreenAltRetroStore | undefined,
    locale,
  });
  const greenAltPreferenceState = mergeGreenAltRetroPreference(greenAltPreference.state, greenAltRetro.events);
  // 🌱 绿色替代预检: 开关关/未命中 → null (零开销, 流原样透传); 命中 → SSE 最前注入 green_alt 事件
  //    偏好状态参与候选排序: 冷却词条后置但不减员 (显式问起仍返回), 无偏好时与基线一致
  let greenAltCard = suppressGuardCards || spendingCap.exceeded
    ? null
    : detectGreenAltCard(userContent, locale, symyGreenContext.greenPref, greenAltPreferenceState);
  // 🗺️ batch53-b: 豁免品类不再触发拦截卡 (检测链路其余照旧 — 事件记录不受影响,
  //    只是不打扰); normalizeGuardScope 对缺失/损坏输入降级全默认 = 现状行为
  const guardScope = normalizeGuardScope(guardScopeRaw);
  if (greenAltCard && isCategoryExempt(guardScope, greenAltIdToMicroChallengeCategory(greenAltCard.id))) {
    greenAltCard = null;
  }
  if (greenAltCard) {
    logger.info(`[Chat API] 🌱 Green alt card attached: ${greenAltCard.id}`);
  }
  // 🔁 复用优先预检 (batch23-c): 与绿色守护同一开关 — guard-off → null (整卡静默, 不注入)。
  //    命中复用类目时: 流式 → SSE 流最前注入 reuse_hint 事件; 非流式 → JSON reuseHint 字段。
  const reuseHint = symyGreenContext.greenPref === 'off' || suppressGuardCards || spendingCap.exceeded
    ? null
    : detectReuseHint(userContent, locale, userHourlyRate);
  // 🐞 batch46-b 微挑战预检: 与绿色守护同一开关 — guard-off → null (整卡静默, 不注入)。
  //    品类来自守护账本词表 (normalizeInterceptCategory), 频控吃客户端历史。
  const microChallenge = symyGreenContext.greenPref === 'off' || suppressGuardCards || spendingCap.exceeded
    ? null
    : detectMicroChallenge({ userContent, recentMicroChallenges: microChallengeHistory });
  // 📖 batch47-a 知识问答检索注入: 开关关/购买意图/未命中 → 双 null; 命中 → 上下文块 + chip
  const greenKnowledge = buildGreenKnowledge(userContent, locale, symyGreenContext.greenPref);
  const symyFields = [symyUserRef ? ` | symy_user_ref: ${symyUserRef}` : '', ` | symy_session_ref: ${randomUUID()}`, ` | symy_lang: ${locale === 'zh' ? 'zh' : 'en'}`, ' | symy_currency: ' + (locale === 'zh' ? 'CNY' : 'USD'), symyCartTotalCents !== null && symyCartTotalCents !== undefined && Number.isInteger(symyCartTotalCents) && symyCartTotalCents >= 0 ? ` | symy_cart_total_cents: ${symyCartTotalCents}` : '', ` | symy_green_pref: ${symyGreenContext.greenPref}`, symyShoppingFacts ? ` | symy_shopping_facts: ${sanitizeShoppingFactsForPrompt(symyShoppingFacts)}` : '', symyImpulseProfile ? ` | ${symyImpulseProfile}` : '', symyImpulseForecast ? ` | ${symyImpulseForecast}` : '', symyGreenCommitment ? ` | ${symyGreenCommitment}` : '', symyRecentWins ? ` | ${symyRecentWins}` : '', altAdoption.line ? ` | ${altAdoption.line}` : '', guardStyle.line ? ` | ${guardStyle.line}` : '', greenAltPreference.line ? ` | ${greenAltPreference.line}` : '', greenAltRetro.line ? ` | ${greenAltRetro.line}` : '', greenAltRetroAnswerContext ? ` | ${greenAltRetroAnswerContext.evidenceLine}` : '', spendingCap.line || ''].join('');

  const userContentWithStage = [
    // 🔧 Brief C P0 (C1c) fix: 保留 [Context: 标记 (AI 按 prompt L180 格式识别),
    //    但在 locale 后紧跟强语言锁, 让 AI 无法忽略。
    `[Context: cultivation_stage: ${lettaCultivationStage} | locale: ${locale}${symyFields}]`,
    // 🔧 Brief C P0 (C1c) fix: 新增 LANGUAGE LOCK — 高优先级语言指令, 与下方 INSTRUCTION 双重保险。
    //    根因: 旧代码单条 INSTRUCTION 在长上下文中权重不足, Letta agent 记忆的历史中文对话会覆盖。
    //    修复: 用 [LANGUAGE LOCK] 标签 + 大写 MUST/NEVER 强化, 紧贴 Context 头部 (最高权重位置)。
    locale === 'zh' ? `[LANGUAGE LOCK: The user's locale is zh. You MUST reply in Chinese only. Zero English words allowed (except proper nouns and currency symbols like $45). NEVER mix languages. This overrides any memory of past conversations in another language.]` : `[LANGUAGE LOCK: The user's locale is en. You MUST reply in English only. Zero Chinese characters allowed. NEVER mix languages. This overrides any memory of past conversations in another language.]`,
    // 🔧 2026-07-15 P1-A09 fix (方案 B): event_type 标注 — 把 challenge/impulse/buddyStats 信息
    //   从全局 Context 合并改为独立 [CURRENT TURN EVENTS] 块, 与静态 context 分离
    //   旧代码: 所有信息混在一个 [Context: ...] 里 → AI 混淆"本轮事件"和"历史事件"
    //   修复: 明确标注 CURRENT TURN, 并加 INSTRUCTION 禁止引用历史事件
    // 🧺 batch44-a: 注入 weekly_streak + blind_spot
    `[CURRENT TURN EVENTS${challengeInfo}${impulseInfo}${hourlyRateInfo}${buddyStatsInfo}${weeklyStreak ? ` | weekly_streak: ${weeklyStreak} days` : ''}${blindSpotInfo}]`,
    // 🔧 2026-07-15 P1-A09 fix (方案 B): 禁止 AI 引用历史 turn 的事件数据
    //   根因: Letta in_context_messages 里有上一轮的工具调用结果 (含 $1099), AI 误引用
    //   修复: 明确告诉 AI "Only reference events from THIS turn's CURRENT TURN EVENTS block"
    "[EVENT REFERENCE RULE: Only reference amounts, items, or events from THIS turn's CURRENT TURN EVENTS block above. Do NOT reference specific dollar amounts or purchase items from previous conversation turns unless the user explicitly mentions them in their current message. If you are unsure whether an event happened this turn, do not mention it.]",
    // 🌐 Bug 5 fix: Explicit language instruction so Letta agent respects UI language
    // 🔧 2026-07-15 P1-A04 fix: 中文模式补对称 instruction
    // 🔧 Brief C P0 (C1c) fix: 强化措辞 — "Zero Chinese characters" / "Zero English words"
    locale === 'zh' ? "[INSTRUCTION: The user's preferred language is Chinese (Simplified). You MUST reply in Chinese only. Zero English words (except proper nouns and currency symbols). Do NOT use English unless the user explicitly writes in English. Never mix languages in a single response.]" : "[INSTRUCTION: The user's preferred language is English. You MUST reply in English only. Zero Chinese characters. Do NOT use Chinese unless the user explicitly writes in Chinese. Never mix languages in a single response.]",
    // 🧺 batch44-a: 让 AI 记住用户刚看过的 profile 数据 (盲区 / streak)，语气轻松不 shame
    locale === 'zh' ? '[PROFILE AWARENESS: If relevant, naturally reference the user\'s blind spots or weekly guard streak. Example: "我注意到你的夜间盲区是 67% — 要不要试试把手机放在卧室外充电？" 绝不 shame 用户，只给具体的、友好的小建议。]' : '[PROFILE AWARENESS: If relevant, naturally reference the user\'s blind spots or weekly guard streak. Example: "I saw your night blind spot is at 67% — have you tried charging your phone outside the bedroom?" 绝不 shame 用户，只给具体的、友好的小建议。]',
    // 🔧 2026-07-15 P1-A05 fix: 语气一致性
    // 🐘 人设转型 (2026-09-05): TONE 指令对齐绿色环保小象 persona
    '[TONE: You are Symy, a warm little elephant companion who guards the wallet AND the planet. Compassionate, lightly playful, never accusatory, never preachy. The manipulator is the merchant, not the user. Never shame the user for any purchase decision or imply they cannot afford something. Celebrate resisted impulses warmly; respect decided purchases and stay with the user. Offer greener alternatives (secondhand/rental/repair/reuse) as friendly options, never as lectures — and never invent carbon numbers.]',
    // N73 fix: 告诉 AI 调用 MCP 工具时传 locale 参数
    `[TOOL LOCALE: When calling any MCP tool, include "locale": "${locale}" in the tool arguments. This ensures event descriptions are generated in the user's language.]`,
    // 🛡️ batch48-a: 守护强度档位指令 (gentle/strict 各一行; balanced 空串被 filter 掉,
    //    默认档 prompt 与改动前逐字节一致)
    buildGuardIntensityPromptLine(normalizeGuardIntensity(guardIntensity)),
    // 🌱 batch68-a: 自由文本复盘回答的收束指令 (仅回答轮注入; 缺省 = 现状行为)
    greenAltRetroAnswerContext?.promptLine || '',
    // 🗺️ batch53-b: 守护范围指令行 (全默认空串被 filter 掉, 默认范围 prompt 与现状逐字节一致)
    buildGuardScopePromptLine(guardScope),
    bnplPrefix, // 🔧 P0-K-1: BNPL 警告上下文
    greenKnowledge.contextBlock || '', // 📖 batch47-a: 绿色知识词条内容 (未命中为空, filter 掉)
    userChallengeHistory, // 🔧 PM-V3-4: 用户挑战历史 (近5次 + 7天失败模式)
    lettaUserHistory || '',
    `<message>${userContent}</message>`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    userContentWithStage,
    lettaCultivationStage,
    lettaUserHistory,
    greenAltCard,
    reuseHint,
    microChallenge,
    greenKnowledge,
    // 🐘 batch55-c: 足迹召回卡 (未命中/样本不足/失败为 null)
    altFootprintCard: altAdoption.card,
  };
}
