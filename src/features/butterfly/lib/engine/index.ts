/**
 * engine/ 子目录 index — re-export（C6 拆分）
 *
 * 从 story-engine.ts 抽出的常量/纯函数集中 re-export。
 * 主文件从此处 import。异步业务逻辑（generateOutline/streamChapterStory 等）
 * 与 Letta Agent/Supabase 客户端耦合，保留在主文件。
 */

export { DEFAULT_CHAPTER_COUNT, CHOICE_CHAPTER_INDICES } from './constants';
export {
  cleanAgentReply,
  buildOutlineSystemPrompt,
  buildOutlineUserPrompt,
  buildRegenerateOutlinePrompt,
  buildChapterStorySystemPrompt,
  buildChapterStoryUserPrompt,
  buildChoiceOptionsPrompt,
  buildButterflyAgentMessage,
  // 🔧 2026-07-17 (speed fix): 一次生成 3 章完整内容
  buildCompleteStorySystemPrompt,
  buildCompleteStoryUserPrompt,
} from './prompts';
export {
  parseOutlineFromLLM,
  parseChoiceFromLLM,
  validateTone,
  generateFallbackOutline,
  // 🔧 2026-07-17 (speed fix): 解析完整故事 JSON
  parseCompleteStoryFromLLM,
} from './parsers';
export {
  transformLettaStreamToStoryStream,
  isToolCallEvent,
  extractTextFromLettaSSELine,
  truncateAtSentence,
} from './stream-helpers';
