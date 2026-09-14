/**
 * compare 类型 — A vs B 对比裁决卡 payload (batch56-a)
 *
 * 检测 (compare-detector) 命中后服务端把两侧对象词 + 各侧 green-alt 词条
 * 命中结果 (未命中为 null, 卡面走中性引导, 不编造环保声明) 带给前端,
 * 用户点选 A/B 或再想想后才落 health_events (零 DDL)。
 */

export interface CompareSideMatch {
  /** 命中的 green-alt 词条 id (triggerId 式 key, 落账 metadata 对齐) */
  id: string;
  /** 词条 why (locale 文案, 只读引用不改词条) */
  why: string;
  /** 词条 alternative 建议句 */
  alternative: string;
  /** 词条 reuse 提示 (耐用/二手可得性行用) */
  reuse: string;
}

export interface CompareCardData {
  /** 连接词前一侧对象原词 */
  sideA: string;
  /** 连接词后一侧对象原词 */
  sideB: string;
  /** sideA 的 green-alt 词条命中; 无据为 null */
  matchA: CompareSideMatch | null;
  /** sideB 的 green-alt 词条命中; 无据为 null */
  matchB: CompareSideMatch | null;
}
