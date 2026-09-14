/**
 * AltFootprintCardData — "我的替代足迹"卡线格式 (batch55-c)
 *
 * 用户在 chat 里召回自己的替代足迹 (alt-footprint-intent 命中) 且样本足够时:
 * - 流式路径: SSE 流最前面注入 { type: 'alt_footprint', altFootprint: ... } 事件
 * - 非流式路径: JSON 响应带 altFootprint 字段
 *
 * 金额红线: public (分享/荣誉面可用) 结构上只有次数/覆盖域数/替代名 —
 * 拿不到任何金额字段 (类型保证, 与 monthly-guard-statement 同款 public/private 分离);
 * private.savedEstimate 只渲染在 App 内私享区, 永不进分享/荣誉面。
 */

export interface AltFootprintEntryView {
  /** 替代显示名 (locale 语言, 词条表解析) */
  label: string;
  /** 采纳次数 */
  count: number;
}

/** 分享面可用字段 — 结构上无金额 (类型保证 amount-free) */
export interface AltFootprintPublic {
  totalAdoptions: number;
  last30Days: number;
  /** 覆盖的生活领域数 */
  categoriesCovered: number;
  /** Top-3 替代 (有几个给几个) */
  topEntries: AltFootprintEntryView[];
}

/** App 内私享字段 — 金额只在这里, 永不进分享/荣誉面 */
export interface AltFootprintPrivate {
  /** 累计估算节省 (adoption estSaved 汇总; 当前客户端不发送, 常为 0 → 私享行隐藏) */
  savedEstimate: number;
}

export interface AltFootprintCardData {
  public: AltFootprintPublic;
  private: AltFootprintPrivate;
}
