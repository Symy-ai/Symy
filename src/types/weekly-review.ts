/**
 * weekly-review 类型 — 小象引导式周复盘 (batch52-b)
 *
 * 自评三档与最骄傲时刻候选由纯派生 (src/lib/weekly-review.ts) 产出,
 * 写入走 manual_adjustment 元数据通道 (零 DDL)。
 */

/** 用户周自评: 超预期 / 还行 / 有点艰难 (语气分档复用 guard-intensity) */
export type WeeklyReviewRating = 'exceeded' | 'okay' | 'tough';

/** 本周「最骄傲守护时刻」候选 (来自本周有结局的拦截, triggerId 去重) */
export interface WeeklyReviewCandidate {
  /** 与拦截事件 triggerId (回退 id) 对齐 — 写入时作 proud_key */
  key: string;
  /** 事件 metadata.itemName; 缺失时由卡面回退通用文案 */
  itemName: string | null;
}

/** 已完成的周复盘 (从既有 manual_adjustment 事件读回, 供入口回看) */
export interface CompletedWeeklyReview {
  rating: WeeklyReviewRating;
  proudKey: string | null;
  /** 写入时快照的候选标签 (itemName 或通用文案序号), 用于总结卡回显 */
  proudLabel: string | null;
}
