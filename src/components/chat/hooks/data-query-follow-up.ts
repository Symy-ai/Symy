/**
 * data-query-follow-up — 最近一条数据问答卡的元数据提取 (纯 lib, batch59-c)
 *
 * 追问跟随 ("那上个月呢 / 那外卖呢") 需要上一条数据问答卡的窗口/维度。
 * 来源就是会话消息列表本身 (内存级, 刷新丢失可接受): 从后往前找最近一条
 * 带 savings/category/impulse 数据问答卡的 assistant 消息, 取窗口+维度。
 * 纯函数: 不读状态不抛异常; 无数据问答卡返回 null (服务端回落普通检测链)。
 */

import type { ChatMessage } from '@/components/chat-bubble';

/** 随请求体上行的追问上文 (chat-validation dataQueryContext 同形) */
export type DataQueryContextMeta =
  | {
      kind: 'savings' | 'category' | 'impulse';
      window: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
      category?: 'electronics' | 'clothing' | 'beauty' | 'home' | 'food';
      impulseWindow?: 'dawn' | 'daytime' | 'evening' | 'lateNight';
    }
  // batch62-c: 预报卡上文 — 只作 "那周六呢" 单日追问的资格标记
  | { kind: 'forecast' };

/** 最近一条数据问答卡的元数据; 会话里没有则 null */
export function lastDataQueryMeta(messages: readonly ChatMessage[]): DataQueryContextMeta | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.savingsQueryCard) {
      return { kind: 'savings', window: m.savingsQueryCard.window };
    }
    if (m.categoryQueryCard) {
      const { window, category } = m.categoryQueryCard;
      return category ? { kind: 'category', window, category } : null;
    }
    if (m.impulseTimeCard) {
      const { window, impulseWindow } = m.impulseTimeCard;
      return impulseWindow ? { kind: 'impulse', window, impulseWindow } : null;
    }
    if (m.impulseForecastCard) {
      return { kind: 'forecast' };
    }
    if (m.guardPulseCard) {
      // 🐘 batch68-c: 脉搏卡没有可追问的窗口/维度 — 就地停住 (不向前翻更旧的卡
      // 拿错账本), "那上个月呢" 这类追问回落普通检测链。
      return null;
    }
  }
  return null;
}
