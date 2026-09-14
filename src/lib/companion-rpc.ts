/**
 * P1-5 Companion RPC Helpers — 统一调用 daily_needs / intimacy / proactive_message RPC
 *
 * 设计原则:
 * 1. 所有调用用 createAdminClient (admin service), 绕过 RLS
 * 2. fire-and-forget 模式 — 失败只 log warn, 不阻塞主流程
 * 3. 幂等 — 同一 triggerId 不会重复写入 (add_proactive_message 内部有去重)
 *
 * 使用场景:
 * - complete_challenge.ts: 挑战通过/失败后调 replenish_daily_need + bump_intimacy
 * - healing-kit/route.ts: Pet Symy 后调 replenish_daily_need + bump_intimacy
 * - complete-story.ts: Gacha 完成后调 replenish_daily_need + bump_intimacy
 * - auth-provider / page.tsx: 登录后调 bump_intimacy(daily_login)
 */

import 'server-only';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type { NeedType, ProactiveMessageTrigger } from '@/types/buddy-state';
// eslint-disable-next-line no-duplicate-imports
import type { ProactiveMessage } from '@/types/buddy-state';

/**
 * 补充某个日常需求 (fire-and-forget)
 * @param userId - 用户 ID
 * @param needType - 'clarity' | 'connection'
 * @param amount - 补充量 (默认用 NEED_REPLENISH_AMOUNT)
 */
export async function fireReplenishDailyNeed(
  userId: string,
  needType: NeedType,
  amount?: number,
): Promise<void> {
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      logger.warn('[Companion] replenish_daily_need: admin client unavailable:', error);
      return;
    }
    const { error: rpcError } = await supabase.rpc('replenish_daily_need', {
      p_user_id: userId,
      p_need_type: needType,
      p_amount: amount ?? (needType === 'clarity' ? 20 : needType === 'connection' ? 15 : 25),
    });
    if (rpcError) {
      logger.warn(`[Companion] replenish_daily_need(${needType}) RPC error:`, rpcError.message);
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Companion] replenish_daily_need(${needType}) threw:`, err);
  }
}

/**
 * 增加亲密度 (fire-and-forget)
 * @param userId - 用户 ID
 * @param delta - 增量 (正数增加, 负数减少)
 */
export async function fireBumpIntimacy(userId: string, delta: number): Promise<void> {
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      logger.warn('[Companion] bump_intimacy: admin client unavailable:', error);
      return;
    }
    const { error: rpcError } = await supabase.rpc('bump_intimacy', {
      p_user_id: userId,
      p_delta: delta,
    });
    if (rpcError) {
      logger.warn(`[Companion] bump_intimacy(${delta}) RPC error:`, rpcError.message);
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Companion] bump_intimacy(${delta}) threw:`, err);
  }
}

/**
 * 添加主动留言 (fire-and-forget)
 * @param userId - 用户 ID
 * @param trigger - 触发类型
 * @param textKey - i18n key
 * @param textFallback - i18n 缺失时的 fallback
 */
export async function fireAddProactiveMessage(
  userId: string,
  trigger: ProactiveMessageTrigger,
  textKey: string,
  textFallback: string,
): Promise<void> {
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      logger.warn('[Companion] add_proactive_message: admin client unavailable:', error);
      return;
    }
    const { error: rpcError } = await supabase.rpc('add_proactive_message', {
      p_user_id: userId,
      p_trigger: trigger,
      p_text_key: textKey,
      p_text_fallback: textFallback,
    });
    if (rpcError) {
      logger.warn(`[Companion] add_proactive_message(${trigger}) RPC error:`, rpcError.message);
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Companion] add_proactive_message(${trigger}) threw:`, err);
  }
}

/**
 * 批量添加主动留言 (fire-and-forget)
 * 接收 generateProactiveMessages 返回的数组, 并行调 RPC
 *
 * 🔧 2026-07-15 (ARCH-4 #20 修复): 串行 → 并行 (Promise.allSettled)
 *    旧代码: for loop 串行 await → 4 条消息 = 4 × RPC 延迟 (~200ms each = 800ms)
 *    修复: Promise.allSettled 并行 → 4 条消息 = 1 × RPC 延迟 (~200ms)
 *    add_proactive_message RPC 内部用 FOR UPDATE 锁, 不怕并发
 */
export async function fireAddProactiveMessages(
  userId: string,
  messages: ProactiveMessage[],
): Promise<void> {
  if (!messages || messages.length === 0) return;
  await Promise.allSettled(
    messages.map(msg => fireAddProactiveMessage(userId, msg.trigger, msg.textKey, msg.textFallback))
  );
}

/**
 * 🔧 message-variety fix: 添加主动留言 (自动选文案 + 防重复)
 *
 * 旧代码 (complete_challenge.ts 等调用方) 硬编码 textKey='buddy.proactiveMessages.completed_1'
 *   → 每次完成挑战都生成同一句 "You saw it. That's the whole thing."
 *   → 用户连续看 5 条一样的, 失去陪伴感
 *
 * 修复: 这个 helper 内部查询用户最近 10 条 proactive messages 的 textKey,
 *       调 pickMessageTextKey() 选一个没用过的文案, 再调 fireAddProactiveMessage
 *
 * 注意: proactive_messages 不是独立表, 而是 buddy_state.proactive_messages jsonb 列
 *       结构: [{id, trigger, textKey, textFallback, createdAt, read}]
 *       所以查询用 buddy_state 表 + jsonb_array_elements 解构
 *
 * @param userId - 用户 ID
 * @param trigger - 触发类型
 */
export async function fireAddProactiveMessageWithVariety(
  userId: string,
  trigger: ProactiveMessageTrigger,
): Promise<void> {
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      logger.warn('[Companion] fireAddProactiveMessageWithVariety: admin client unavailable:', error);
      // 降级: 直接用 fireAddProactiveMessage + 硬编码 (维持旧行为)
      const { MESSAGE_FALLBACK } = await import('@/lib/buddy-proactive-messages');
      const fallback = MESSAGE_FALLBACK[trigger];
      const defaultTextKey = `buddy.proactiveMessages.${trigger}_1`;
      await fireAddProactiveMessage(userId, trigger, defaultTextKey, fallback);
      return;
    }

    // 1. 查询用户 buddy_state.proactive_messages (jsonb 数组, 取最近 10 条 textKey)
    //    proactive_messages 结构: [{id, trigger, textKey, textFallback, createdAt, read}, ...]
    //    用 jsonb_array_elements 解构, 按createdAt desc 排序取前 10
    const { data: buddyRow, error: queryError } = await supabase
      .from('buddy_state')
      .select('proactive_messages')
      .eq('user_id', userId)
      .maybeSingle();

    if (queryError) {
      logger.warn(`[Companion] fireAddProactiveMessageWithVariety(${trigger}): query buddy_state failed:`, queryError.message);
      // 降级: 用硬编码
      const { MESSAGE_FALLBACK } = await import('@/lib/buddy-proactive-messages');
      const fallback = MESSAGE_FALLBACK[trigger];
      const defaultTextKey = `buddy.proactiveMessages.${trigger}_1`;
      await fireAddProactiveMessage(userId, trigger, defaultTextKey, fallback);
      return;
    }

    // 2. 解析 proactive_messages jsonb, 提取 textKey
    type ProactiveMessageRow = { textKey?: string; text_key?: string; createdAt?: string };
    const messagesRaw = (buddyRow as { proactive_messages?: ProactiveMessageRow[] | null })?.proactive_messages ?? [];
    const sortedMessages = [...messagesRaw].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    const recentTextKeys = sortedMessages
      .slice(0, 10)
      .map(m => m.textKey ?? m.text_key ?? '')
      .filter(k => k);

    // 3. 用 pickMessageTextKey 选一个没用过的文案
    const { pickMessageTextKey, MESSAGE_FALLBACK } = await import('@/lib/buddy-proactive-messages');
    const textKey = pickMessageTextKey(trigger, recentTextKeys);
    const textFallback = MESSAGE_FALLBACK[trigger];

    // 4. 调原函数写入
    await fireAddProactiveMessage(userId, trigger, textKey, textFallback);
  } catch (err) {
    // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Companion] fireAddProactiveMessageWithVariety(${trigger}) threw:`, err);
    // 降级: 用硬编码 (保证功能不挂)
    try {
      const { MESSAGE_FALLBACK } = await import('@/lib/buddy-proactive-messages');
      const fallback = MESSAGE_FALLBACK[trigger];
      const defaultTextKey = `buddy.proactiveMessages.${trigger}_1`;
      await fireAddProactiveMessage(userId, trigger, defaultTextKey, fallback);
    } catch (fallbackErr) {
      // 🔧 2026-07-21 audit fix (root-cause P2): 原代码完全静默 (连 logger 都没有) —
      //   若 buddy-proactive-messages 模块本身坏了 (导入路径改/MESSAGE_FALLBACK 缺键),
      //   用户永远收不到 proactive message 且无任何日志线索。陪伴感是 Symy 核心卖点, 不能悄悄死。
      //   修复: 至少记录 fallback 也失败, 便于 ops 排查。
      //   safe to ignore: 非关键功能, 已尽力降级两次, 此处仅记录不再传播错误
      logger.error(
        `[Companion] fireAddProactiveMessageWithVariety(${trigger}) fallback ALSO failed — proactive message lost:`,
        fallbackErr,
      );
    }
  }
}

/**
 * 觉醒个性 (非 fire-and-forget, 调用方需要知道结果)
 * @param userId - 用户 ID
 * @param personality - 个性类型
 * @returns success: boolean
 */
export async function awakenPersonality(
  userId: string,
  personality: 'sage' | 'playmate' | 'guardian' | 'ascetic',
): Promise<boolean> {
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      logger.warn('[Companion] awaken_buddy_personality: admin client unavailable:', error);
      return false;
    }
    const { data, error: rpcError } = await supabase.rpc('awaken_buddy_personality', {
      p_user_id: userId,
      p_personality: personality,
    });
    if (rpcError) {
      logger.warn(`[Companion] awaken_buddy_personality(${personality}) RPC error:`, rpcError.message);
      return false;
    }
    logger.info(`[Companion] awaken_buddy_personality success: ${data} for user ${userId.substring(0, 8)}`);
    return true;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Companion] awaken_buddy_personality(${personality}) threw:`, err);
    return false;
  }
}
