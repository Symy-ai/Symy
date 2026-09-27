/**
 * annotation-schema — DecisionGate 语义判定评测的标注集数据结构（纯类型 + 常量，零依赖）
 *
 * 背景: doc/Jev-引入方案-v2.md §3 Wave 0 验收线要求「冻结行为基准」——
 * 现有 green-rules 词表管线的三档输出是基准, Jev/DecisionGate 语义层的输出要
 * 拿人工标注做对照（一致率 ≥90%）。本文件是那份对照表的**行结构**定义。
 *
 * 两条纪律:
 *   1. ruleLabel 由现行词表管线机械算出, 任何人都不许手改（冻结基准）。
 *   2. humanLabel 只允许人工填, 生成脚本**不得**写入（不虚构标注值）。
 *      字段缺席 = 尚未标注; 'unknown' = 已标注但人工判不出/存疑, 二者语义不同。
 *
 * 数据文件在 doc/green-annotation-seed.json（数据不入 src/）,
 * 由 scripts/gen-green-annotation-seed.ts 生成, 人工回填后冻结。
 */

/** 绿色档位四值: 词表三档（high/medium/unknown）+ 人工「判不出/存疑」。 */
export type GreenAnnotationLabel = 'high' | 'medium' | 'low' | 'unknown';

export interface GreenAnnotationEntry {
  id: string;                  // ann-0001 起
  locale: 'zh' | 'en';
  title: string;               // 商品卡标题（真实样本）
  category?: string;
  subcategory?: string;
  queryContext?: string;       // 搜索时的用户 query（可空）
  ruleLabel: 'high' | 'medium' | 'low' | 'unknown';  // 现行词表给出的档（冻结基准用）
  humanLabel?: 'high' | 'medium' | 'low' | 'unknown'; // 人工标注，待填
  source: 'seed-fixture' | 'manual';                    // 来源
  notes?: string;
}

/** 标注语言: 中英各半是 Wave 0 验收线要求（防止英文泛化好、中文翻车的 Cupertino 陷阱）。 */
export type GreenAnnotationLocale = 'zh' | 'en';

/** 样本来源: seed-fixture=从现有测试夹具/词表冷启动; manual=owner 抽检补录的真实搜索结果。 */
export type GreenAnnotationSource = 'seed-fixture' | 'manual';

/** 标注集目标量与配额（Wave 0 验收线 ≥200 条, 中英各半 → 每侧 ≥100）。 */
export const GREEN_ANNOTATION_TARGET_TOTAL = 200;
export const GREEN_ANNOTATION_TARGET_PER_LOCALE = 100;

/**
 * 冷启动超额系数 —— 生成器实际按 目标 × 1.1 铺样本（每侧 110, 共 220）。
 * 理由: 夹具抽出的真实样本只占约 1/3, 余下为词表合成; 留 10% 缓冲给
 * 下一轮 symy_search 真实结果样本替换掉最弱的合成条目, 避免标注员一开始
 * 就抽到全是合成条目的批次。
 */
export const GREEN_ANNOTATION_SEED_OVERSHOOT = 1.1;

/**
 * notes 里区分冷启动样本的约定标记（非枚举值, 自由文本约定）。
 * - 'synthetic-from-lexicon': 标题由词表品类组合合成, 非真实商品卡
 *   （夹具量不足时的补量手段, 置信度低于真实样本, 统计时要分开看）。
 * - 'seed-fixture:<相对路径>': 夹具抽取出处, 便于人工回看原文语境。
 */
export const SYNTHETIC_NOTE = 'synthetic-from-lexicon';
