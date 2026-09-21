/**
 * 插图生成引擎 (V9 — OpenAI 兼容 API 返回图片 URL + SVG 兜底)
 *
 * V9 改进：
 * 1. 移除 response_format: 'b64_json'（api.openai-next.com 不支持，会导致 401）
 * 2. API 直接返回 CDN 图片 URL，无需下载/转 base64/上传 Supabase
 * 3. SVG 程序化插图作为可靠兜底方案
 * 4. 大幅简化生成链路，减少失败点
 *
 * 设计原则：
 * - AI 优先：优先使用 AI 图片生成 API，获得真实概念艺术效果
 * - 优雅降级：AI API 失败时回退到 SVG 程序化插图
 * - 异步生成：不阻塞故事流式输出
 * - 持久化优先：URL 保存到数据库，防止刷新丢失
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { toJson } from '@/lib/json-helpers';
import { generateSVGIllustration } from './svg-illustration-engine';
import type { StoryTone, DecisionType } from '../types';
// 🔧 ARCH fix (Round 61 — god component 拆分): 提取 tone maps + prompt helpers
import {
  buildIllustrationPrompt,
  TONE_COLOR_MAP_DARK,
  TONE_COLOR_MAP_LIGHT,
  TONE_MOOD_MAP_DARK,
  TONE_MOOD_MAP_LIGHT,
  TONE_LIGHTING_MAP_DARK,
  TONE_LIGHTING_MAP_LIGHT,
  TONE_ATMOSPHERE_MAP_DARK,
  TONE_ATMOSPHERE_MAP_LIGHT,
  MANGA_PROTAGONIST_PROMPT,
  MANGA_STYLE_DARK,
  MANGA_STYLE_LIGHT,
} from './illustration-helpers';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

// ============================================================
// 环境变量配置
// ============================================================

const IMAGE_API_BASE = process.env.OPENAI_IMAGE_API_BASE || 'https://api.openai-next.com';
// BUG-285 fix: 移除硬编码 API Key — 仅使用环境变量，无配置时 isImageAPIConfigured() 返回 false
const IMAGE_API_KEY = process.env.OPENAI_IMAGE_API_KEY || '';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

/** API 是否已配置（有 API key） */
function isImageAPIConfigured(): boolean {
  if (!IMAGE_API_KEY) warnMissingEnvOnce('Butterfly illustration generation');
  return IMAGE_API_KEY.length > 0;
}

// ============================================================
// Tone maps + prompt helpers 已提取到 illustration-helpers.ts (Round 61)
// ============================================================

// ============================================================
// Prompt helpers 已提取到 illustration-helpers.ts (Round 61)
// ============================================================

// ============================================================
// OpenAI 兼容 API 图片生成（首选方案）
// ============================================================

/**
 * 使用 OpenAI 兼容 API 生成图片（V12 — 漫画风格 + 1/4 分辨率 + 自动重试）
 *
 * V12 改进：
 * - 漫画/漫画风格 prompt，主角不露脸
 * - 1/8 分辨率（136x238 竖屏 / 204x152 横屏），生成速度大幅提升
 * - 内置 2 次重试机制
 * - 超时从 90s 降到 60s（小图更快）
 *
 * NOTE: api.openai-next.com 不支持 response_format: 'b64_json'
 * 不带此参数时 API 直接返回图片 CDN URL
 *
 * @returns 图片 URL（CDN URL 或 data URL），失败返回 null
 */
async function generateWithOpenAICompatible(
  prompt: string,
  size: string = '136x238',
  timeoutMs: number = 20_000,
  maxRetries: number = 1,
): Promise<{ imageUrl: string; format: 'png' } | null> {
  if (!isImageAPIConfigured()) {
    logger.info('[Butterfly Illust] OpenAI API not configured (no API key), skipping');
    return null;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      logger.info('[Butterfly Illust] Retry attempt', attempt, '/', maxRetries);
      // 重试前等待 1-3s（指数退避）
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${IMAGE_API_BASE}/v1/images/generations`;

      logger.info('[Butterfly Illust] Generating with OpenAI API, model:', IMAGE_MODEL, 'size:', size, 'attempt:', attempt);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${IMAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt,
          n: 1,
          size,
          // NOTE: api.openai-next.com 不支持 response_format: 'b64_json'
          // 不带此参数时 API 直接返回图片 URL
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        logger.warn('[Butterfly Illust] OpenAI API returned status:', response.status, 'body:', errorText.substring(0, 200));
        // 5xx 错误可以重试，4xx 不重试
        if (response.status >= 500 && attempt < maxRetries) continue;
        return null;
      }

      const data = await response.json();

      // API 返回图片 URL（主要路径）
      if (data.data?.[0]?.url) {
        const imageUrl = data.data[0].url;
        logger.info('[Butterfly Illust] OpenAI API returned image URL:', imageUrl.substring(0, 100));
        return { imageUrl, format: 'png' };
      }

      // 兼容：某些 API 可能返回 b64_json
      if (data.data?.[0]?.b64_json) {
        const base64 = data.data[0].b64_json;
        logger.info('[Butterfly Illust] OpenAI API returned base64, length:', base64.length);
        return { imageUrl: `data:image/png;base64,${base64}`, format: 'png' };
      }

      logger.warn('[Butterfly Illust] Unexpected API response format:', JSON.stringify(data).substring(0, 300));
      return null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('abort')) {
        logger.warn('[Butterfly Illust] OpenAI API timeout after', timeoutMs, 'ms, attempt:', attempt);
        // 超时可以重试
        if (attempt < maxRetries) continue;
      } else {
        logger.warn('[Butterfly Illust] OpenAI API failed:', errorMsg, 'attempt:', attempt);
        // 网络错误可以重试
        if (attempt < maxRetries) continue;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

// ============================================================
// 插图生成核心函数（AI 优先 + SVG 兜底）
// ============================================================

interface GenerateIllustrationParams {
  sessionId: string;
  chapterIndex: number;
  title: string;
  tone: StoryTone;
  timeSpan: string;
  decisionDescription: string;
  decisionType: DecisionType;
  /** 章节内容片段 */
  contentSnippet?: string;
  /** LLM 生成的场景描述 */
  llmSceneDescription?: string;
  /** 是否为亮色模式（影响 prompt 和色调） */
  isLight?: boolean;
}

/**
 * 生成章节插图
 *
 * V9: OpenAI 兼容 API 返回图片 URL → SVG 兜底
 *
 * 生成链路：
 * 1. 构建 Prompt → 调用 OpenAI 兼容 API → API 返回图片 URL
 * 2. AI 生成成功 → 直接返回图片 URL（无需下载/转 base64/上传）
 * 3. AI 生成失败 → 256x256 重试 → 仍失败 → SVG 程序化插图兜底
 *
 * @returns 图片 URL（API 返回的 CDN URL、base64 data URL、或 SVG data URL）
 */
export async function generateIllustration(params: GenerateIllustrationParams): Promise<string | null> {
  const { chapterIndex, title, tone, timeSpan, decisionDescription, decisionType, contentSnippet, llmSceneDescription, isLight } = params;

  // ---- 首选方案：OpenAI 兼容 API ----
  if (isImageAPIConfigured()) {
    const prompt = buildIllustrationPrompt(title, tone, timeSpan, decisionDescription, decisionType, contentSnippet, llmSceneDescription, isLight);
    const primarySize = '136x238';

    const primaryResult = await generateWithOpenAICompatible(prompt, primarySize);

    if (primaryResult) {
      // AI 生成成功 — 直接返回图片 URL
      logger.info('[Butterfly Illust] AI image generated for chapter', chapterIndex);
      return primaryResult.imageUrl;
    }

    logger.warn('[Butterfly Illust] Primary size failed, retrying with fallback size for chapter', chapterIndex);
    const fallbackResult = await generateWithOpenAICompatible(prompt, '256x256');

    if (fallbackResult) {
      logger.info('[Butterfly Illust] AI image generated with fallback size for chapter', chapterIndex);
      return fallbackResult.imageUrl;
    }

    logger.warn('[Butterfly Illust] AI generation failed, falling back to SVG for chapter', chapterIndex);
  }

  // ---- 兜底方案：SVG 程序化插图 ----
  logger.info('[Butterfly Illust] Generating SVG fallback illustration for chapter', chapterIndex, 'isLight:', isLight);
  const svgUrl = generateSVGIllustration(title, tone, chapterIndex, isLight);
  return svgUrl;
}

// ============================================================
// 插图 URL 持久化
// ============================================================

/**
 * 将插图 URL 持久化到数据库 session 的 chapters JSON 中
 */
export async function persistIllustrationUrl(
  sessionId: string,
  chapterIndex: number,
  illustrationUrl: string,
): Promise<boolean> {
  // base64 数据 URL 不持久化到数据库（太大）
  if (illustrationUrl.startsWith('data:')) {
    logger.info('[Butterfly Illust] Skipping persist for base64 data URL, chapter', chapterIndex);
    return false;
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (adminError || !supabase) {
      logger.warn('[Butterfly Illust] Cannot persist URL - admin client not available');
      return false;
    }

    // 🔧 409 根因修复: 用 RPC 原子更新 illustrationUrl, 消除 read-modify-write。
    //   旧代码: SELECT chapters → JS 修改 → UPDATE chapters (read-modify-write)
    //   → 与 story API 的章节追加并发 → 乐观锁失败 → 409
    //   新代码: RPC set_chapter_field 用 jsonb_set 原子更新, 不读整行, 不冲突
    // 🔧 ARCH fix (Round 47): 移除 as never as cast — set_chapter_field 已在 database.types.ts
    // 🔧 ARCH fix (Round 48 REVIEW-A-2): 移除 JSON.stringify — supabase.rpc 已做 JSON.stringify,
    //    双重 encode 导致存储值带多余引号 (e.g. '"https://..."' 而非 'https://...')
    const { error: rpcError } = await supabase.rpc('set_chapter_field', {
        p_session_id: sessionId,
        p_chapter_index: chapterIndex,
        p_field_name: 'illustrationUrl',
        p_field_value: toJson(illustrationUrl),
      });

    if (rpcError) {
      logger.warn('[Butterfly Illust] RPC set_chapter_field failed:', rpcError.message);
      return false;
    }

    logger.info('[Butterfly Illust] URL persisted for chapter', chapterIndex);
    return true;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Butterfly Illust] Persist URL failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * 生成插图并持久化 URL
 */
export async function generateAndPersistIllustration(
  params: GenerateIllustrationParams,
): Promise<string | null> {
  const url = await generateIllustration(params);
  if (url) {
    // 🔧 ARCH fix (Round 19 R19-H-2 — Illustration persist fire-and-forget 在 serverless 中丢失):
    //    旧代码: persistIllustrationUrl(...).then().catch() 不 await, 立即返回 url。
    //    调用方 (illustration/route.ts:109) await generateAndPersistIllustration 后立即返回响应给客户端,
    //    Vercel 可能在响应发送后杀函数 → persist 未完成 → 刷新页面后插图消失 → 下次 GET 触发 backfill 重新生成 (烧 OpenAI API 钱)。
    //    根因修复: await persistIllustrationUrl, 确保 DB 写入完成后再返回。
    //    额外耗时: ~50ms DB UPDATE (相比 generateIllustration 的数秒, 可忽略)。
    //    Round 1 已为 createHealthEvent 修过同模式 (fire-and-forget → await)。
    try {
      const success = await persistIllustrationUrl(params.sessionId, params.chapterIndex, url);
      if (!success) {
        logger.warn('[Butterfly Illust] Failed to persist URL for chapter', params.chapterIndex);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Butterfly Illust] Persist URL threw error:', err instanceof Error ? err.message : err);
    }
  }
  return url;
}

/**
 * 使用章节内容重新生成更精准的插图
 */
export async function regenerateWithContent(
  sessionId: string,
  chapterIndex: number,
  title: string,
  tone: StoryTone,
  timeSpan: string,
  decisionDescription: string,
  decisionType: DecisionType,
  chapterContent: string,
): Promise<string | null> {
  try {
    const url = await generateAndPersistIllustration({
      sessionId,
      chapterIndex,
      title,
      tone,
      timeSpan,
      decisionDescription,
      decisionType,
      contentSnippet: chapterContent.slice(0, 500),
    });

    if (url) {
      logger.info('[Butterfly Illust] Content-driven regeneration successful for chapter', chapterIndex);
    }

    return url;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Butterfly Illust] Content-driven regeneration failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 为会话中缺少插图的章节批量生成插图
 */
export async function generateMissingIllustrations(
  sessionId: string,
  decisionDescription: string,
  decisionType: DecisionType,
  chapters: { index: number; title: string; tone: StoryTone; timeSpan: string; content?: string; illustrationUrl?: string }[],
  maxDurationMs: number = 120_000,
): Promise<void> {
  const chaptersWithoutIllustration = chapters.filter(ch => !ch.illustrationUrl);

  if (chaptersWithoutIllustration.length === 0) return;

  logger.info('[Butterfly Illust] Generating missing illustrations for', chaptersWithoutIllustration.length, 'chapters');

  const startTime = Date.now();

  for (const chapter of chaptersWithoutIllustration) {
    if (Date.now() - startTime > maxDurationMs) {
      logger.info('[Butterfly Illust] Backfill timeout reached, stopping');
      break;
    }

    try {
      const url = await generateAndPersistIllustration({
        sessionId,
        chapterIndex: chapter.index,
        title: chapter.title,
        tone: chapter.tone,
        timeSpan: chapter.timeSpan,
        decisionDescription,
        decisionType,
        contentSnippet: chapter.content?.slice(0, 500),
      });

      if (url) {
        logger.info('[Butterfly Illust] Backfilled illustration for chapter', chapter.index);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      // 🔧 ARCH fix (Round 51 R51-Bug4 — 静默 catch 让 backfill 失败不可见):
      //    旧代码 catch {} 完全静默, ops 不知道 backfill 是否在烧 OpenAI 配额但全部失败。
      //    根因修复: logger.warn 让 ops 能从日志发现 backfill 问题。
      logger.warn('[Butterfly Illust] Backfill failed for chapter', chapter.index, ':', err);
    }

    // 间隔 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ============================================================
// V21: 场景级插图生成 — 每个场景独立生成图片
// ============================================================

/**
 * 为章节中的每个场景生成独立插图
 *
 * @returns 场景插图映射 { sceneIndex: [imageUrl] }
 */
export async function generateSceneIllustrations(params: {
  sessionId: string;
  chapterIndex: number;
  chapterTitle: string;
  tone: StoryTone;
  decisionDescription: string;
  decisionType: DecisionType;
  isLight?: boolean;
  sceneTexts: string[];
  /** 生成完每个场景后回调 */
  onSceneGenerated?: (sceneIndex: number, imageUrl: string) => void;
}): Promise<Record<number, string[]>> {
  const { sessionId, chapterIndex, chapterTitle, tone, decisionDescription, decisionType: _decisionType, isLight, sceneTexts, onSceneGenerated } = params;

  const sceneIllustrations: Record<number, string[]> = {};

  if (!isImageAPIConfigured()) {
    logger.info('[Butterfly Illust] API not configured, skipping scene illustrations for chapter', chapterIndex);
    return sceneIllustrations;
  }

  logger.info('[Butterfly Illust] Generating', sceneTexts.length, 'scene illustrations for chapter', chapterIndex);

  for (let sceneIdx = 0; sceneIdx < sceneTexts.length; sceneIdx++) {
    const sceneText = sceneTexts[sceneIdx];
    if (!sceneText || sceneText.length < 10) continue;

    try {
      const prompt = buildSceneIllustrationPrompt(
        sceneText,
        chapterTitle,
        tone,
        decisionDescription,
        isLight,
      );

      // V12: 1/4 分辨率（快速生成）
      const result = await generateWithOpenAICompatible(prompt, '136x238');

      if (result) {
        sceneIllustrations[sceneIdx] = [result.imageUrl];
        logger.info('[Butterfly Illust] Scene illustration generated for chapter', chapterIndex, 'scene', sceneIdx);

        // 回调通知
        onSceneGenerated?.(sceneIdx, result.imageUrl);
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Butterfly Illust] Scene illustration failed for chapter', chapterIndex, 'scene', sceneIdx, ':', err instanceof Error ? err.message : err);
    }

    // 场景间间隔 500ms，避免 API 过载
    if (sceneIdx < sceneTexts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 持久化到数据库
  if (Object.keys(sceneIllustrations).length > 0) {
    try {
      await persistSceneIllustrations(sessionId, chapterIndex, sceneIllustrations);
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Butterfly Illust] Failed to persist scene illustrations:', err instanceof Error ? err.message : err);
    }
  }

  return sceneIllustrations;
}

/**
 * 将场景插图 URL 持久化到数据库 session 的 chapters JSON 中
 */
async function persistSceneIllustrations(
  sessionId: string,
  chapterIndex: number,
  sceneIllustrations: Record<number, string[]>,
): Promise<boolean> {
  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) return false;

  // 🔧 409 根因修复: 用 RPC 原子更新 sceneIllustrations, 消除 read-modify-write。
  //   同 persistIllustrationUrl — 用 jsonb_set 原子更新, 不冲突
  // 🔧 ARCH fix (Round 47): 移除 as never as cast — set_chapter_field 已在 database.types.ts
  // 🔧 ARCH fix (Round 48 REVIEW-A-2): 移除 JSON.stringify (同 persistIllustrationUrl)
  const { error: rpcError } = await supabase.rpc('set_chapter_field', {
      p_session_id: sessionId,
      p_chapter_index: chapterIndex,
      p_field_name: 'sceneIllustrations',
      p_field_value: toJson(sceneIllustrations),
    });

  if (rpcError) {
    logger.warn('[Butterfly Illust] RPC set_chapter_field (sceneIllustrations) failed:', rpcError.message);
    return false;
  }

  logger.info('[Butterfly Illust] Scene illustrations persisted for chapter', chapterIndex);
  return true;
}

// ============================================================
// 场景级插图 Prompt 构建
// ============================================================

/**
 * 为单个场景构建插图生成 Prompt
 *
 * 与章节级 prompt 不同，场景级 prompt 直接使用场景文本作为视觉描述，
 * 因为每个场景已经是 1 句话的视觉描述（galgame scene card）。
 */
export function buildSceneIllustrationPrompt(
  sceneText: string,
  chapterTitle: string,
  tone: StoryTone,
  decisionDescription: string,
  isLight?: boolean,
): string {
  const toneColor = isLight
    ? (TONE_COLOR_MAP_LIGHT[tone] || TONE_COLOR_MAP_LIGHT.neutral)
    : (TONE_COLOR_MAP_DARK[tone] || TONE_COLOR_MAP_DARK.neutral);
  const toneMood = isLight
    ? (TONE_MOOD_MAP_LIGHT[tone] || TONE_MOOD_MAP_LIGHT.neutral)
    : (TONE_MOOD_MAP_DARK[tone] || TONE_MOOD_MAP_DARK.neutral);
  const toneLighting = isLight
    ? (TONE_LIGHTING_MAP_LIGHT[tone] || TONE_LIGHTING_MAP_LIGHT.neutral)
    : (TONE_LIGHTING_MAP_DARK[tone] || TONE_LIGHTING_MAP_DARK.neutral);
  const toneAtmosphere = isLight
    ? (TONE_ATMOSPHERE_MAP_LIGHT[tone] || TONE_ATMOSPHERE_MAP_LIGHT.neutral)
    : (TONE_ATMOSPHERE_MAP_DARK[tone] || TONE_ATMOSPHERE_MAP_DARK.neutral);

  const stylePrefix = isLight ? MANGA_STYLE_LIGHT : MANGA_STYLE_DARK;
  const bgStyle = isLight
    ? 'bright light background with depth'
    : 'dark background with depth';

  // V12: 漫画风格 + 主角不露脸 + light mode 支持
  return `${stylePrefix}, vertical composition: ${sceneText}. Context: this is part of a story about "${decisionDescription}". ${MANGA_PROTAGONIST_PROMPT} ${toneMood} atmosphere, ${toneAtmosphere}, ${toneLighting} lighting, ${bgStyle}. ${toneColor} palette. NO butterflies, NO insect imagery, NO butterfly patterns. NO face visible on the protagonist.`;
}

// ============================================================
// Galgame 多镜头 Prompt（V4 — 每场景多张图，不同角度/构图）
// ============================================================

/** 镜头类型 — 每种产生不同的视觉构图 */
type ShotType = 'wide' | 'medium' | 'closeup' | 'overhead' | 'silhouette';

/** 镜头类型 → prompt 修饰词 */
const SHOT_TYPE_MODIFIERS: Record<ShotType, string> = {
  wide: 'wide establishing shot, full body visible, expansive environment, small figure in large space',
  medium: 'medium shot, waist up, focused on the person and their immediate surroundings',
  closeup: 'extreme close-up, detailed texture, a single object or body part filling the frame, shallow depth of field',
  overhead: 'overhead bird\'s eye view, looking down at the scene from above, geometric patterns of the environment',
  silhouette: 'dramatic silhouette against light source, backlit figure, contrast between darkness and illumination',
};

/** 为一个场景生成多镜头 prompt 列表 */
export function buildMultiShotScenePrompts(
  sceneText: string,
  chapterTitle: string,
  tone: StoryTone,
  decisionDescription: string,
  shotCount: number = 2,
  isLight?: boolean,
): string[] {
  const toneColor = isLight
    ? (TONE_COLOR_MAP_LIGHT[tone] || TONE_COLOR_MAP_LIGHT.neutral)
    : (TONE_COLOR_MAP_DARK[tone] || TONE_COLOR_MAP_DARK.neutral);
  const toneMood = isLight
    ? (TONE_MOOD_MAP_LIGHT[tone] || TONE_MOOD_MAP_LIGHT.neutral)
    : (TONE_MOOD_MAP_DARK[tone] || TONE_MOOD_MAP_DARK.neutral);
  const toneLighting = isLight
    ? (TONE_LIGHTING_MAP_LIGHT[tone] || TONE_LIGHTING_MAP_LIGHT.neutral)
    : (TONE_LIGHTING_MAP_DARK[tone] || TONE_LIGHTING_MAP_DARK.neutral);
  const toneAtmosphere = isLight
    ? (TONE_ATMOSPHERE_MAP_LIGHT[tone] || TONE_ATMOSPHERE_MAP_LIGHT.neutral)
    : (TONE_ATMOSPHERE_MAP_DARK[tone] || TONE_ATMOSPHERE_MAP_DARK.neutral);

  const stylePrefix = isLight ? MANGA_STYLE_LIGHT : MANGA_STYLE_DARK;
  const bgStyle = isLight
    ? 'bright light background with depth'
    : 'dark background with depth';

  // 根据场景索引选取不同镜头组合
  const shotTypes: ShotType[] = shotCount >= 3
    ? ['wide', 'medium', 'closeup']
    : shotCount === 2
      ? ['wide', 'closeup']
      : ['medium'];

  return shotTypes.map(shotType => {
    const shotModifier = SHOT_TYPE_MODIFIERS[shotType];
    return `${stylePrefix}, vertical composition, ${shotModifier}: ${sceneText}. Context: this is part of a story about "${decisionDescription}". ${MANGA_PROTAGONIST_PROMPT} ${toneMood} atmosphere, ${toneAtmosphere}, ${toneLighting} lighting, ${bgStyle}. ${toneColor} palette. NO butterflies, NO insect imagery. NO face visible on the protagonist.`;
  });
}

// ============================================================
// 导出供 Demo API 使用的工具函数
// ============================================================

// 🔧 ARCH fix (Round 61): buildIllustrationPrompt 已提取到 illustration-helpers.ts
// Re-export for backward compatibility
export { isImageAPIConfigured, generateWithOpenAICompatible };
export { buildIllustrationPrompt as buildPrompt } from './illustration-helpers';
