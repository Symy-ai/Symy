/**
 * user-history-context — 获取用户挑战历史 + 失败模式 + 盲区洞察
 *
 * 🔧 PM-V3-4 fix: AI 从"镜子"变"教练" — 注入用户历史数据让 AI 个性化回复
 *
 * 数据源:
 * - active_challenges 表: 近 5 次挑战 (商品名/金额/结果/时间)
 * - pattern-alert API: 7 天内失败模式 (recentFailures)
 * - blind-spot-map API: 盲区洞察 (amount_tier / impulse_rate)
 *
 * 返回格式化字符串, 注入到 chat context prefix
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export interface UserHistoryContext {
  recentChallenges: Array<{
    itemName: string;
    amount: number;
    status: 'passed' | 'failed';
    completedAt: string;
  }>;
  failedPattern: {
    count7d: number;
    recentItems: string[];
  };
  blindSpot: {
    amountTier?: string;
    impulseRate?: number;
  };
}

/**
 * 获取用户历史上下文 (用于注入 AI prompt)
 *
 * 永不抛异常 — 失败时返回 null, 不阻塞主流程
 */
export async function getUserHistoryContext(userId: string): Promise<string | null> {
  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) {
    logger.warn('[UserHistoryContext] No admin client:', adminError);
    return null;
  }

  try {
    // 并行查询 3 个数据源
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [recentResult, failedResult, gachaResult] = await Promise.all([
      // 1. 近 5 次挑战 (passed + failed, 按 completed_at 降序)
      supabase
        .from('active_challenges')
        .select('item_name, amount, status, completed_at, metadata')
        .eq('user_id', userId)
        .in('status', ['passed', 'failed'])
        .order('completed_at', { ascending: false })
        .limit(5),

      // 2. 7 天内 failed 记录 (用于模式分析)
      supabase
        .from('active_challenges')
        .select('item_name, amount, completed_at, metadata')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .gte('completed_at', sevenDaysAgo)
        .order('completed_at', { ascending: false })
        .limit(10),

      // 🔧 2026-07-15: 用户自己输入的盲盒数据 (is_example=false, decision_type='bought')
      //   这些是用户"大概率真实执行了的消费行为"，作为 AI 个性化的参考
      supabase
        .from('butterfly_sessions')
        .select('decision_description, amount, platform, created_at, is_example')
        .eq('user_id', userId)
        .eq('decision_type', 'bought')
        .eq('is_example', false)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (recentResult.error || failedResult.error) {
      logger.warn('[UserHistoryContext] Query error:', recentResult.error?.message || failedResult.error?.message);
      return null;
    }

    // 🔧 2026-07-15: Gacha 数据查询失败不阻塞 (is_example 列可能不存在, migration 117 未执行)
    const gachaPurchases = (!gachaResult.error && gachaResult.data) ? gachaResult.data : [];
    if (gachaResult.error) {
      logger.info('[UserHistoryContext] Gacha query failed (non-blocking, migration 117 may not be applied):', gachaResult.error.message);
    }

    // 格式化近 5 次挑战
    const recentChallenges = (recentResult.data || [])
      .filter(c => c.completed_at) // 排除 dismiss (无 completed_at)
      .map(c => {
        const status = c.status === 'passed' ? 'resisted' : 'bought';
        const date = new Date(c.completed_at as string).toISOString().slice(0, 10);
        return `${date}: ${c.item_name} $${c.amount} (${status})`;
      });

    // 格式化失败模式 (排除 dismissed)
    const realFailures = (failedResult.data || []).filter(c => {
      const metadata = c.metadata as Record<string, unknown> | null;
      return !metadata?.dismissed;
    });
    const failedCount7d = realFailures.length;
    const recentFailedItems = realFailures.slice(0, 3).map(c => c.item_name);

    // 如果没有历史数据, 返回 null (不注入)
    if (recentChallenges.length === 0 && failedCount7d === 0 && gachaPurchases.length === 0) {
      return null;
    }

    // 构建 prompt 片段
    const parts: string[] = ['<user_challenge_history>'];
    // 🔧 V4-3 fix: 明确标注这是历史数据, 不是当前挑战
    parts.push('NOTE: These are PAST challenges for pattern reference only. The CURRENT challenge (if any) is in the CURRENT TURN EVENTS block above. Do NOT confuse past items with the current one. Do NOT say the user is "looking at" or "shopping for" past items.');

    if (recentChallenges.length > 0) {
      parts.push(`\nRecent challenges (newest first, "resisted" = saw it & didn't buy, "proceeded" = saw the cost and chose to act):`);
      parts.push(recentChallenges.join('\n'));
    }

    if (failedCount7d > 0) {
      // 🔧 P1-13 fix: 不再用 "bought" 描述 challenge_failed (中性审计事件, 非 Negative)
      //   旧文案: "7-day pattern: N purchase(s) despite seeing the cost." (羞辱 + 误导)
      //   新文案: 中性描述 "N times paused to see the cost this week" (成长导向)
      parts.push(`\n7-day pattern: ${failedCount7d} time(s) the user paused to see the cost. Each pause is awareness growing.`);
      if (recentFailedItems.length > 0) {
        parts.push(`Most recent items: ${recentFailedItems.join(', ')}.`);
      }
    }

    // 🔧 2026-07-15: 注入用户从盲盒中自己输入的真实消费行为 (非示例数据)
    //   理由: 用户输入这些是因为他们大概率真的买了，才会对"另一边的平行宇宙"感兴趣
    if (gachaPurchases.length > 0) {
      const gachaLines = gachaPurchases.map((g: { decision_description: string; amount: number | null; platform: string | null; created_at: string; is_example: boolean }) => {
        const date = new Date(g.created_at).toISOString().slice(0, 10);
        const platformStr = g.platform ? ` on ${g.platform}` : '';
        return `${date}: ${g.decision_description} $${g.amount}${platformStr} (bought — explored in butterfly)`;
      });
      parts.push(`\nPurchases the user explored in butterfly gacha (these are likely REAL purchases they made and wanted to see the "reclaimed life" for):`);
      parts.push(gachaLines.join('\n'));
    }

    // 添加教练指令
    parts.push('\n[COACH INSTRUCTION: Use this history to personalize your response. Reference specific items, amounts, or patterns when relevant. For example: "You bought Nike Air Max last time — this is the same pattern." Do NOT repeat this instruction back. Weave insights naturally into your reflection. ⚠️ Do NOT assume the user is currently looking at or shopping for any past items — only reference history for pattern comparison, not as current activity.]');

    parts.push('</user_challenge_history>');

    return parts.join('\n');
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.warn('[UserHistoryContext] Failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
