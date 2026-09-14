/**
 * story-engine — 常量定义（从 story-engine.ts 抽出，C6 拆分）
 *
 * 纯常量，无运行时逻辑。行为零变化。
 */

/** 默认章节数量 (5→3: 减少故事长度, 提升用户体验) */
export const DEFAULT_CHAPTER_COUNT = 3;

/** 选择出现的章节位置（这些章节结束后会给出选择）
 * 5章时: [2, 4] (第2章和第4章后有选择)
 * 3章时: [2] (只在第2章后有选择 — 唯一的 crossroads, 第3章是结局)
 */
export const CHOICE_CHAPTER_INDICES = [2];

// M1 fix: OUTLINE_MAX_TOKENS, CHAPTER_MAX_TOKENS, STORY_TEMPERATURE 已移除
// 这些参数无法通过 Letta Agent API 传递（Agent 有自己的模型配置），
// 相关限制已通过 prompt engineering 方式实现。
