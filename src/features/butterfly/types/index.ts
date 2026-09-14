/**
 * 蝴蝶效应人生剧情系统 — 类型定义
 *
 * 核心概念：
 * 1. Session: 一次完整的剧情体验，由用户的消费决策触发
 * 2. Outline: 剧情大纲，描述从当前节点到结局的走向
 * 3. Chapter: 大纲中的章节，每个章节是一段故事
 * 4. Choice: 分岔路口的选择点，用户选择后大纲会重新生成
 */

// ============================================================
// 基础类型
// ============================================================

/**
 * 决策类型：
 * - bought: 用户买了
 * - resisted: 用户没买
 * - considering: 购买前双宇宙模拟 — 用户输入"我想买 X", 系统生成两个未来 (买/不买) 帮助决策
 *   (2026-07-17 新增, 见 migration 118)
 */
export type DecisionType = 'bought' | 'resisted' | 'considering';

/** 会话状态 */
export type SessionStatus = 'active' | 'completed' | 'abandoned';

/** 剧情基调 — 蝴蝶效应可能反转 */
export type StoryTone = 'hopeful' | 'neutral' | 'dark' | 'twist';

/** 大纲中每个章节的摘要 */
export interface OutlineChapter {
  /** 章节序号（从 1 开始） */
  index: number;
  /** 章节标题 */
  title: string;
  /** 章节剧情摘要（2-3 句话） */
  summary: string;
  /** 该章节是否包含分岔路口选择 */
  hasChoice: boolean;
  /** 如果有选择，选择的提示（不给选项，保持悬念） */
  choicePrompt?: string;
  /** 剧情基调 */
  tone: StoryTone;
  /** 时间跨度（如 "3年后", "第二天"） */
  timeSpan: string;
}

/** 完整的剧情大纲 */
export interface StoryOutline {
  /** 大纲版本（每次重新生成递增） */
  version: number;
  /** 基于用户的什么决策 */
  decisionType: DecisionType;
  /** 决策描述 */
  decisionDescription: string;
  /** 章节列表 */
  chapters: OutlineChapter[];
  /** 最终结局的暗示（不剧透，只是暗示方向） */
  endingHint: string;
}

// ============================================================
// 会话（Session）
// ============================================================

/** 创建会话的参数 */
export interface CreateSessionParams {
  /** 决策类型：买了 / 没买 */
  decisionType: DecisionType;
  /** 决策描述（如 "花了 $89 买了一件 TEMU 外套"） */
  decisionDescription: string;
  /** 消费金额（美元） */
  amount?: number;
  /** 消费平台 */
  platform?: string;
  /** 用户自定义情境描述（可选，如 "我本来要给孩子买生日礼物的钱"） */
  context?: string;
  /** 🔧 2026-07-15: 是否来自示例数据 — true = 示例, false = 用户真实输入 (大概率真实消费) */
  isExample?: boolean;
  /** UI locale — demo 会话大纲按此语言生成（batch73-c） */
  locale?: 'en' | 'zh';
}

/** 会话数据 */
export interface ButterflySession {
  id: string;
  userId: string;
  decisionType: DecisionType;
  decisionDescription: string;
  amount: number | null;
  platform: string | null;
  context: string | null;
  /** 当前大纲（JSON） */
  outline: StoryOutline | null;
  /** 当前章节序号（从 1 开始，0 表示还没开始） */
  currentChapter: number;
  /** 已完成的章节内容 */
  chapters: StoryChapter[];
  /** 已做出的选择记录 */
  choices: ButterflyChoice[];
  /** C2 fix: AI 生成的蝴蝶效应总结（持久化到数据库，刷新不丢失） */
  butterflyEffect: string | null;
  /** C2 fix: 最终基调（持久化到数据库，刷新不丢失） */
  finalTone: StoryTone | null;
  status: SessionStatus;
  /** 🔧 2026-07-15: 是否来自示例数据 — true = 示例, false = 用户真实输入 */
  isExample?: boolean;
  /** 🔧 2026-07-17: 用户收藏标记 (migration 118) */
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 章节（Chapter）— 已讲述的故事内容
// ============================================================

/** 一个已讲述的章节 */
export interface StoryChapter {
  /** 章节序号 */
  index: number;
  /** 章节标题 */
  title: string;
  /** 完整的故事文本 */
  content: string;
  /** 剧情基调 */
  tone: StoryTone;
  /** 时间跨度 */
  timeSpan: string;
  /** 该章节结束后是否有选择 */
  hasChoice: boolean;
  /** 如果有选择，选择的详情 */
  choice?: ButterflyChoice;
  /** 章节级插图 URL（章节封面图，异步生成，可能为空） */
  illustrationUrl?: string;
  /** 每个场景的独立插图 URL 列表（场景索引 → 图片 URL 数组）
   *  Galgame 风格：每个场景有多张图（不同角度/构图），形成幻灯片效果
   *  章节完成后异步生成，逐步替换章节封面图
   *  典型：每个场景 2-3 张图 */
  sceneIllustrations?: Record<number, string[]>;
  /** 创建时间 */
  createdAt: string;
}

// ============================================================
// 选择（Choice）— 分岔路口
// ============================================================

/** 选择选项 */
export interface ChoiceOption {
  /** 选项标识（A/B/C） */
  id: string;
  /** 选项简短描述 */
  label: string;
  /** 选项暗示（不剧透未来，但给一些线索） */
  hint: string;
}

/** 分岔路口选择 */
export interface ButterflyChoice {
  /** 选择 ID */
  id: string;
  /** 所在章节序号 */
  chapterIndex: number;
  /** 选择提示文本 */
  prompt: string;
  /** 可选项 */
  options: ChoiceOption[];
  /** 用户选了什么 */
  selectedOption: string | null;
  /** 选择时间 */
  createdAt: string;
  /** 选择后大纲是否已重新生成 */
  outlineRegenerated: boolean;
}

// ============================================================
// SSE 流式事件
// ============================================================

/** 故事生成的 SSE 事件类型 */
export type StoryEventType =
  | 'outline_generated'     // 大纲生成完成
  | 'chapter_start'         // 章节开始
  | 'chapter_text'          // 章节文本流
  | 'chapter_end'           // 章节结束
  | 'choice_prompt'         // 分岔路口选择
  | 'outline_updated'       // 大纲因选择而更新
  | 'illustration_generated' // 插图生成完成（异步，可能在章节文本之后到达）
  | 'illustration_failed'   // 插图生成失败（触发客户端 fallback）
  | 'scene_illustration_generated' // V21: 场景级插图生成完成（每个场景独立）
  | 'story_complete'        // 故事讲完
  | 'error';                // 出错了

/** SSE 事件数据 */
export interface StoryEvent {
  type: StoryEventType;
  data: unknown;
}

/** chapter_text 事件的具体数据 */
export interface ChapterTextData {
  chapterIndex: number;
  text: string;  // 增量文本
}

/** chapter_start 事件的具体数据 */
export interface ChapterStartData {
  chapterIndex: number;
  title: string;
  tone: StoryTone;
  timeSpan: string;
  /** 预生成的插图 URL（会话恢复时使用） */
  illustrationUrl?: string;
}

/** illustration_generated 事件的具体数据 */
export interface IllustrationData {
  chapterIndex: number;
  illustrationUrl: string;
}

/** illustration_failed 事件的具体数据 — 触发客户端 fallback */
export interface IllustrationFailedData {
  chapterIndex: number;
  reason: string; // 'network' | 'timeout' | 'config_unavailable' | 'api_error'
}

/** V21: scene_illustration_generated 事件的具体数据 — 每个场景独立插图 */
export interface SceneIllustrationData {
  chapterIndex: number;
  sceneIndex: number;
  illustrationUrl: string;
}

/** chapter_end 事件的具体数据 */
export interface ChapterEndData {
  chapterIndex: number;
  hasChoice: boolean;
  /** 章节完整文本（可能经过清理，如移除工具结果文本） */
  fullText?: string;
}

/** choice_prompt 事件的具体数据 */
export interface ChoicePromptData {
  chapterIndex: number;
  prompt: string;
  options: ChoiceOption[];
}

/** outline_generated / outline_updated 事件的具体数据 */
export interface OutlineData {
  version: number;
  chapters: OutlineChapter[];
  endingHint: string;
}

/** story_complete 事件的具体数据 */
export interface StoryCompleteData {
  finalTone: StoryTone;
  totalChapters: number;
  butterflyEffect: string; // 蝴蝶效应的总结语
}

/** error 事件的具体数据 */
export interface StoryErrorData {
  message: string;
  code?: string;
}

// ============================================================
// API 请求/响应
// ============================================================

/** POST /api/butterfly/choice 提交选择 */
export interface SubmitChoiceRequest {
  sessionId: string;
  chapterIndex: number;
  selectedOption: string;
}

// ============================================================
// 前端状态
// ============================================================

/** 蝴蝶效应功能的 UI 状态 */
export interface ButterflyUIState {
  /** 当前阶段 */
  phase: 'idle' | 'setup' | 'generating_outline' | 'streaming' | 'choosing' | 'complete';
  /** 是否正在加载 */
  isLoading: boolean;
  /** 当前流式文本 */
  streamingText: string;
  /** 当前章节序号 */
  currentChapterIndex: number;
  /** 错误信息 */
  error: string | null;
  /** 大纲是否可见（用户可以展开查看） */
  outlineVisible: boolean;
}
