/**
 * green-alt-types — 绿色替代话术库的类型定义 (纯类型, 零依赖)
 *
 * 从 green-alternatives.ts 拆出: 词条数据按主题拆到
 * green-alt-entries-wear.ts (穿戴/工艺品) + green-alt-entries-home.ts (家居/日用),
 * 避免单文件超 200 行 (代码原则: 一个文件一个职责)。
 */

export type GreenLocale = "zh" | "en";

export interface GreenAlternativeEntry {
  /** 品类 id (测试/日志/埋点用) */
  id: string;
  /** trigger 词表 — zh/en 双语, 匹配时两个语言都查 */
  triggers: Record<GreenLocale, readonly string[]>;
  /** 为什么环境影响高 (一句, 陈述事实, 不说教, 无碳数值) */
  why: Record<GreenLocale, string>;
  /** 2-3 个具体绿色替代选项 (卡片列表用) */
  options: Record<GreenLocale, readonly string[]>;
  /** 二手/租赁渠道建议 (仅 zh 场景给平台名, 如闲鱼) */
  reuseChannel: Record<GreenLocale, string>;
  /** 替代建议文案 (脑侧 message 用, "植物象牙"式) */
  alternative: Record<GreenLocale, string>;
  /** 复用建议文案 ("你手头可能已有X", 脑侧 message 用) */
  reuse: Record<GreenLocale, string>;
  /** 省钱换算话术 (含 {hours} 占位, 由调用方按时薪替换) */
  savingsHint: Record<GreenLocale, string>;
}

export interface GreenAlternativeSuggestion {
  /** 命中的品类 id */
  id: string;
  /** 替代建议文案 (locale 语言) */
  alternative: string;
  /** 复用建议文案 (locale 语言) */
  reuse: string;
  /** 拼好的完整话术 (alternative + reuse), 调用方可直接用 */
  message: string;
  /** 为什么环境影响高 (locale 语言) */
  why: string;
  /** 2-3 个具体绿色替代选项 (locale 语言) */
  options: readonly string[];
  /** 二手/租赁渠道建议 (locale 语言) */
  reuseChannel: string;
}
