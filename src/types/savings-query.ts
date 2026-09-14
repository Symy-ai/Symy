/**
 * savings-query 类型 — "这个月省了多少" 问账卡 payload (batch57-c)
 *
 * 检测 (savings-query-detector) 命中后服务端用既有聚合 lib 纯函数
 * (weeklyGuardCompare / buildMonthlyStatement / aggregateGuardStyleProfile)
 * 算出时间窗结算数字, canned 生成 (绝不经过 Letta — AI 报假账比不报更伤信任),
 * 随 SSE savings_query_card 事件 / 非流式 JSON savingsQueryCard 字段附带。
 *
 * 红线:
 * - 金额 (private.estSavedTotal) 只在 App 内私享卡展示, 永不进分享面;
 *   shareFace 是结构上的 amount-free 变体 (类型层与 private 分离)。
 * - 无数据窗 status='noData' → 前端渲染引导态, 绝不显示 0 元假账。
 * - 无碳数值; 卡层数字全部来自聚合 lib 输出, 不再自行计算口径。
 */

/** 问账时间窗 — 周界与 weekly-guard-compare 同约定 (本地周一 00:00 起算) */
export type SavingsQueryWindow = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

/** 三轨次数 — 与 guard-style-profile 同轨道语义 (guard=拦截 / alt=替代 / reuse=复用) */
export interface SavingsQueryTrackCounts {
  guard: number;
  alt: number;
  reuse: number;
}

/** amount-free 分享面 — 只有次数与自由小时, 结构上拿不到金额 */
export interface SavingsQueryShareFace {
  zh: string;
  en: string;
}

export interface SavingsQueryCardData {
  window: SavingsQueryWindow;
  /** 'noData' = 该窗无任何守护/替代/复用数据, 前端渲染引导态 (不造 0 结论) */
  status: 'ok' | 'noData';
  /** 拦截轮次 (有结局的局数, 与周对比/月账单同口径) */
  intercepts: number;
  /** 通过率 0..1; 窗内 settled 为 0 时 null (无结论, 不是 0%) */
  passRate: number | null;
  /** 三轨次数; 样本不足 (三轨聚合 <5) 时 tracksAvailable=false, 前端不渲染三轨行 */
  trackCounts: SavingsQueryTrackCounts;
  tracksAvailable: boolean;
  /** 守护自由小时 (换算自转存金额, 但只有小时数无金额) */
  hoursReclaimed: number;
  /** locale 感知的自由时间标签 (如 '37 小时' / '37 hours') */
  hoursLabel: string;
  /** App 内私享金额 — 该窗转存合计, 永不进分享/荣誉面 */
  private: { estSavedTotal: number };
  /** amount-free 分享面变体 ("12 次守护、挽回 9 小时自由时间" 式) */
  shareFace: SavingsQueryShareFace;
}
