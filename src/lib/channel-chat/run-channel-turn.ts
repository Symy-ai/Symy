/**
 * 渠道回合核心 — 渠道无关编排（设计 §6.2）
 *
 * 输入 { userId, locale, text } → 输出 { outcome, replyText }。
 * 编排序（全部复用 Web chat parts 现有导出）：
 *   1. getUserAgentId — 渠道用户绑定时已 getOrCreateAgentId 预建, 此处查询; null → agent_unavailable
 *   2. 配额与 Web 同键共享: chat:daily:${userId} (免费档 50/24h, premium 豁免) +
 *      chat:user:${userId} (30/1h) — 键名从 daily-limit-guard 导出的 helper 引用, 防字面量双写漂移
 *   3. loadLettaTurnContext (supabase 传 admin client, factsStore 边界收窄先例)
 *   4. processLettaResponse (非流式) → reply
 *   5. stripLeakedReasoning 兜底 — reasoning 绝不外发 (铁律: 只取 text 通道)
 *   6. 审计 logAIBehavior + PostHog captureLLMGeneration — fireAndForgetSafely, 不阻塞回合
 *
 * 不 import 任何平台 SDK/URL — 平台知识全部在适配器层。
 */
import 'server-only'; // 架构守卫: admin client 引用文件须防客户端 bundle 泄漏
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { stripLeakedReasoning } from '@/lib/agent-stream';
import { logAIBehavior } from '@/lib/ai-audit';
import { channelGlobalBudget } from '@/lib/channels/config';
import { checkRateLimit } from '@/lib/distributed-lock';
import { getUserAgentId } from '@/lib/letta-agent-manager';
import { logger } from '@/lib/logger';
import { captureLLMGeneration } from '@/lib/posthog-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  chatDailyKey,
  chatUserHourlyKey,
} from '@/app/api/chat/parts/daily-limit-guard';
import { getChatProfileSnapshot } from '@/app/api/chat/parts/chat-profile-snapshot';
import { loadLettaTurnContext } from '@/app/api/chat/parts/letta-turn-context';
import { processLettaResponse } from '@/app/api/chat/parts/letta-response';

export interface ChannelTurnInput {
  userId: string;
  locale: 'zh' | 'en';
  text: string;
}

export interface ChannelTurnResult {
  outcome: 'replied' | 'limit_daily' | 'limit_hourly' | 'limit_global' | 'agent_unavailable' | 'error';
  /** 已本地化、可直接发送的纯文本（无平台标记, reasoning 已剥离） */
  replyText?: string;
}

/** 与 Web 端同值的配额参数（daily-limit-guard / rate-guard 现行行为） */
const FREE_TIER_DAILY_CHAT_LIMIT = 50;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOURLY_CHAT_LIMIT = 30;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

export const CHANNEL_TURN_TEXTS: Record<'zh' | 'en', Record<'limit_daily' | 'limit_hourly' | 'limit_global' | 'agent_unavailable' | 'error', string>> = {
  zh: {
    limit_daily: '今日额度已用完，明天再来。升级 Premium 可不限次数聊天。',
    limit_hourly: '消息有点密集，稍作休息，一小时后再聊。',
    limit_global: '今日服务繁忙，请明天再来看看。',
    agent_unavailable: 'AI 助手仍在初始化中，请稍后再试。',
    error: '处理消息时遇到了问题，请稍后再试。',
  },
  en: {
    limit_daily: "You've reached today's chat limit. Come back tomorrow, or upgrade to Premium for unlimited chats.",
    limit_hourly: "That's a lot of messages in a short time. Please take a break and try again in an hour.",
    limit_global: 'Service is busy today — please come back tomorrow.',
    agent_unavailable: 'Your AI companion is still initializing. Please try again in a moment.',
    error: 'Something went wrong while processing your message. Please try again later.',
  },
};

export async function runChannelTurn(input: ChannelTurnInput): Promise<ChannelTurnResult> {
  const { userId, locale, text } = input;
  const texts = CHANNEL_TURN_TEXTS[locale];
  const startedAt = Date.now();

  // 1. agent 查询 — 绑定时已预建, null = 初始化未完成
  const agentId = await getUserAgentId(userId);
  if (!agentId) {
    logger.error('[Channel] turn_error outcome=agent_unavailable user=%s', userId.substring(0, 8));
    return { outcome: 'agent_unavailable', replyText: texts.agent_unavailable };
  }

  // 2. 配额 — 与 Web 同键共享 (premium 判定复用 chat-profile-snapshot, 快照失败 fail-closed)
  let isPremium = false;
  try {
    const snapshot = await getChatProfileSnapshot(userId);
    isPremium = snapshot?.plan === 'premium';
  } catch {
    // safe to ignore: 渠道侧有意 fail-closed — 影子用户滥用面更大, 快照失败按免费档从严; limit_global 是反滥用兜底
  }
  if (!isPremium) {
    const { allowed: dailyAllowed } = await checkRateLimit(chatDailyKey(userId), FREE_TIER_DAILY_CHAT_LIMIT, DAILY_WINDOW_MS);
    if (!dailyAllowed) {
      logger.warn('[Channel] daily_limit user=%s', userId.substring(0, 8));
      return { outcome: 'limit_daily', replyText: texts.limit_daily };
    }
  }
  const { allowed: hourlyAllowed } = await checkRateLimit(chatUserHourlyKey(userId), HOURLY_CHAT_LIMIT, HOURLY_WINDOW_MS);
  if (!hourlyAllowed) {
    logger.warn('[Channel] hourly_limit user=%s', userId.substring(0, 8));
    return { outcome: 'limit_hourly', replyText: texts.limit_hourly };
  }

  // 2.5 全局日预算熔断（§8 兜底防线）— 任何人都能开 TG 号白嫖影子账号, 这是最后闸门。
  //     放在 user 闸之后 = 只对「即将烧 token 的回合」计数, 预算即 LLM 支出的精确代理
  const { allowed: globalAllowed } = await checkRateLimit('channel:global:daily', channelGlobalBudget(), DAILY_WINDOW_MS);
  if (!globalAllowed) {
    logger.warn('[Channel] global_budget_hit budget=%d', channelGlobalBudget());
    return { outcome: 'limit_global', replyText: texts.limit_global };
  }

  // 3+4. 上下文装载 + 非流式 LLM 回合
  const { supabase } = createAdminClient();
  try {
    const turnContext = await loadLettaTurnContext({
      userId,
      supabase: supabase as never,
      userContent: text,
      locale,
      greenPref: undefined,
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
      microChallengeHistory: undefined,
      suppressGuardCards: undefined,
      greenAltRetroAnswerContext: undefined,
    });
    const { userContentWithStage } = turnContext as { userContentWithStage: string };

    const llmResult = await processLettaResponse(userContentWithStage, undefined, userId, agentId, undefined);

    // 5. text-only 铁律: stripLeakedReasoning 兜底, reasoning 字段从不下发
    const reply = stripLeakedReasoning(llmResult.reply ?? '').trim();
    if (!reply) {
      logger.error('[Channel] turn_error outcome=empty_reply user=%s', userId.substring(0, 8));
      return { outcome: 'error', replyText: texts.error };
    }

    // 6. 审计 + PostHog — fire-and-forget, 绝不 await 进响应关键路径
    fireAndForgetSafely(
      logAIBehavior({
        userId,
        action: 'tool_call',
        userInput: text,
        aiOutput: reply,
        aiPath: 'letta',
        agentId,
      }),
    );
    fireAndForgetSafely(
      captureLLMGeneration({
        distinctId: userId,
        input: text.substring(0, 2000),
        output: reply.substring(0, 2000),
        model: 'letta-glm-5.2',
        latencyMs: Date.now() - startedAt,
        properties: { trigger_source: 'channel_turn', mode: 'channel' },
      }),
    );

    return { outcome: 'replied', replyText: reply };
  } catch (err) {
    // safe to ignore: 回合异常已转带内错误文案 outcome=error + logger.error (自动进 Sentry), 不向平台抛出 (恒 200 铁律)
    logger.error('[Channel] turn_error outcome=error user=%s', userId.substring(0, 8), err);
    return { outcome: 'error', replyText: texts.error };
  }
}
