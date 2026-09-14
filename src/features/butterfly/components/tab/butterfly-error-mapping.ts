/**
 * Butterfly Gacha Error Mapping — Round 121 audit fix (AUDIT-7 Step 1)
 *
 * 🔧 提取自 butterfly-tab.tsx:285-340 (57 行 IIFE → 1 行 useMemo)
 *
 * 将后端原始错误字符串映射为:
 * 1. 用户友好的 i18n 翻译消息 (errorP)
 * 2. 短错误码 (errorCodeP, 供 support 调试 + copy-to-clipboard)
 *
 * 纯函数, 无副作用, 可独立单测
 */

// 🔧 TFunction 类型与 useI18n() 返回的 t 函数签名一致
export type TFunction = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => string;

export interface GachaErrorMapping {
  /** i18n 翻译后的用户友好消息 (null 表示无错误) */
  message: string | null;
  /** 短错误码, 供 support 调试 (null 表示无错误) */
  code: string | null;
}

/**
 * 将后端原始错误字符串映射为 { message, code }
 *
 * @param rawError - player.error 原始字符串 (可能为 null/undefined/空)
 * @param t - i18n 翻译函数
 * @returns { message, code } — 两者都为 null 表示无错误
 */
export function mapGachaError(rawError: string | null | undefined, t: TFunction): GachaErrorMapping {
  if (!rawError) return { message: null, code: null };

  // 🔧 Brief C P1 (C2a) fix: 503 Story engine not ready — 用户友好提示 (engine warming up)
  //    服务端 src/app/api/butterfly/session/route.ts L63: "Story engine is not available. Please try again later."
  //    旧代码: 命中下方 'Story engine' → aiServiceError (消息正确但不够具体)
  //    修复: 优先匹配 503 特征, 用更准确的 errorEngineNotReady 提示
  if (rawError.includes('Story engine is not available') || rawError.includes('not available. Please try again later')) {
    return {
      message: t('butterfly.errorEngineNotReady', { defaultValue: 'Story engine is warming up. Please try again in a moment.' }),
      code: 'WHATIF_ENGINE_010',
    };
  }
  // 🔧 Brief C P1 (C2a) fix: 429 Session creation already in progress — 用户友好提示 (并发保护)
  //    服务端 src/app/api/butterfly/session/route.ts L72: "Session creation already in progress. Please wait."
  //    旧代码: 不匹配任何 pattern → fallback WHATIF_UNKNOWN_000 (用户看到原始英文技术消息)
  //    修复: 明确映射到 errorSessionInProgress
  if (rawError.includes('already in progress') || rawError.includes('Session creation already')) {
    return {
      message: t('butterfly.errorSessionInProgress', { defaultValue: 'A story is already being created. Please wait a moment.' }),
      code: 'WHATIF_INPROGRESS_011',
    };
  }

  // 🔧 P0-5 fix: 错误码区分 — 超时 / LLM 失败 / 解析失败, 含次数返还提示
  if (rawError.includes('OUTLINE_TIMEOUT') || rawError.includes('timed out') || rawError.includes('Your pull was refunded')) {
    return {
      message: t('butterfly.outlineTimeoutError', { defaultValue: 'Story generation timed out. Your pull was refunded — please try again.' }),
      code: 'WHATIF_TIMEOUT_002',
    };
  }
  if (rawError.includes('OUTLINE_PARSE_FAILED') || rawError.includes('unexpected response')) {
    return {
      message: t('butterfly.outlineParseError', { defaultValue: 'The AI returned an unexpected response. Your pull was refunded — please try again.' }),
      code: 'WHATIF_PARSE_008',
    };
  }
  if (rawError.includes('OUTLINE_LLM_FAILED') || rawError.includes('temporarily unavailable')) {
    return {
      message: t('butterfly.outlineLlmError', { defaultValue: 'The AI service is temporarily unavailable. Your pull was refunded — please try again in a moment.' }),
      code: 'WHATIF_AI_001',
    };
  }
  if (rawError.includes('AI service is temporarily unavailable') || rawError.includes('Failed to generate story outline') || rawError.includes('Story engine')) {
    return {
      message: t('butterfly.aiServiceError', { defaultValue: 'AI service is temporarily unavailable. Please try again in a moment.' }),
      code: 'WHATIF_AI_001',
    };
  }
  if (rawError.includes('timeout') || rawError.includes('Timeout') || rawError.includes('60s') || rawError.includes('elapsed')) {
    return {
      message: t('butterfly.timeoutError', { defaultValue: 'Story is taking longer than expected. Try again or use a preset example.' }),
      code: 'WHATIF_TIMEOUT_002',
    };
  }
  // 🔧 Round 121 audit fix: 旧代码 rawError.includes('content') 区分大小写 → 漏匹配 "Content blocked"
  //    修复: toLowerCase() 后检查
  const lowerError = rawError.toLowerCase();
  if (lowerError.includes('content') && (lowerError.includes('moderat') || lowerError.includes('filter') || lowerError.includes('policy') || lowerError.includes('blocked'))) {
    return {
      message: t('butterfly.contentError', { defaultValue: "This item couldn't be processed. Try a different description." }),
      code: 'WHATIF_CONTENT_003',
    };
  }
  // 🔧 ARCH fix (Round 25 R25-10): "Chapter content could not be loaded" 不匹配任何 pattern → 中文用户看英文
  if (rawError.includes('Chapter content could not be loaded') || rawError.includes('chapter_start missed')) {
    return {
      message: t('butterfly.chapterLoadError', { defaultValue: 'Chapter content could not be loaded. Please retry or start a new story.' }),
      code: 'WHATIF_CHAPTER_004',
    };
  }
  // 🔧 ARCH fix (Round 25 R25-20): "session" substring 太宽, 收紧匹配
  if (rawError.includes('Failed to create session') || rawError.includes('Failed to create story session')) {
    return {
      message: t('butterfly.sessionCreateError', { defaultValue: 'Failed to create story session. Please try again.' }),
      code: 'WHATIF_SESSION_005',
    };
  }
  if (rawError.includes('Network') || rawError.includes('Failed to fetch')) {
    return {
      message: t('butterfly.networkError', { defaultValue: 'Network connection issue. Please check your internet and try again.' }),
      code: 'WHATIF_NETWORK_006',
    };
  }
  if (rawError.includes('429') || rawError.includes('Too Many') || rawError.includes('too many') || rawError.includes('rate limit')) {
    return {
      message: t('butterfly.rateLimitError', { defaultValue: 'Too many requests. Please wait a moment and try again.' }),
      code: 'WHATIF_RATE_007',
    };
  }
  return { message: rawError, code: 'WHATIF_UNKNOWN_000' };
}
