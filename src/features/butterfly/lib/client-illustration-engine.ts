/**
 * 客户端插图生成引擎 (V8 — OpenAI 兼容 API + SVG 兜底)
 *
 * V8 改进：
 * - 服务端 API 作为唯一入口（服务端使用 OpenAI 兼容 API → SVG 兜底）
 * - 支持返回 AI 生成的 PNG 图片或 SVG 程序化插图
 * - 大幅简化，减少失败点
 *
 * 工作流程：
 * 1. 调用服务端 API（/api/butterfly/illustration-demo）
 * 2. 服务端优先使用 OpenAI 兼容 API 生成 AI 图片
 * 3. AI 生成失败时自动回退到 SVG 程序化插图
 */

import type { StoryTone, DecisionType } from '../types';
import { apiFetch } from '@/lib/api-client';

// ============================================================
// 基调视觉映射
// ============================================================

const TONE_VISUAL_MAP: Record<StoryTone, { colors: string; mood: string; lighting: string; atmosphere: string }> = {
  hopeful: {
    colors: 'emerald green and warm gold',
    mood: 'warm hopeful, dawn breaking through darkness',
    lighting: 'warm golden rim light, sunbeams piercing through',
    atmosphere: 'morning mist with golden light, dew on surfaces, fresh air',
  },
  neutral: {
    colors: 'cool blue and silver steel',
    mood: 'melancholic contemplative, quiet stillness',
    lighting: 'flat cold blue steel, diffused overcast light',
    atmosphere: 'dust motes in still air, quiet rain, time frozen',
  },
  dark: {
    colors: 'deep crimson and blood red',
    mood: 'ominous foreboding, shadows closing in',
    lighting: 'harsh red contrast, deep shadows with sharp edges',
    atmosphere: 'heavy smoke, fog creeping low, oppressive weight in the air',
  },
  twist: {
    colors: 'electric purple and neon violet',
    mood: 'surreal unsettling, reality bending',
    lighting: 'neon purple glow, otherworldly luminescence',
    atmosphere: 'reality distortion, mirror-like reflections, impossible geometry',
  },
};

// ============================================================
// Prompt 构建
// ============================================================

export function buildClientIllustrationPrompt(
  title: string,
  tone: StoryTone,
  timeSpan: string,
  decisionDescription: string,
  _decisionType: DecisionType,
  contentSnippet?: string,
  isLight?: boolean,
): string {
  const toneVisual = TONE_VISUAL_MAP[tone] || TONE_VISUAL_MAP.neutral;

  const mangaStyle = isLight
    ? 'Japanese manga illustration style, clean black ink lines with light screentone, bright and airy backgrounds, soft pastel accent colors, slice-of-life manga aesthetic'
    : 'Japanese manga illustration style, black ink lines with screentone shading, dark atmospheric backgrounds, dramatic contrast';

  const bgStyle = isLight
    ? 'bright light background with depth'
    : 'dark background with depth';

  const protagonistPrompt =
    'A person seen from behind or over-the-shoulder first-person view, face completely hidden from view (no facial features visible), body language expressive and relatable so the viewer feels this IS them. Hands visible when interacting with objects. Manga style line work.';

  let timeHint = '';
  const lowerTime = timeSpan.toLowerCase();
  if (lowerTime.includes('year') || lowerTime.includes('later')) {
    timeHint = ', aged and weathered surroundings showing the passage of years';
  } else if (lowerTime.includes('day') || lowerTime.includes('morning') || lowerTime.includes('tomorrow')) {
    timeHint = ', fresh and immediate, the present moment crystallized';
  } else if (lowerTime.includes('night') || lowerTime.includes('evening')) {
    timeHint = ', deep darkness of night, stars or city lights in the background';
  } else if (lowerTime.includes('week') || lowerTime.includes('month')) {
    timeHint = ', subtle signs of time passing, seasonal changes in the air';
  }

  let contentHint = '';
  if (contentSnippet && contentSnippet.length > 50) {
    const lower = contentSnippet.toLowerCase();
    if (lower.includes('rain') || lower.includes('storm')) contentHint = '. Rain streaking down dark windows';
    else if (lower.includes('fire') || lower.includes('flame')) contentHint = '. Embers glowing in darkness';
    else if (lower.includes('mirror') || lower.includes('reflection')) contentHint = '. Cracked mirror reflecting a different scene';
    else if (lower.includes('door') || lower.includes('gate')) contentHint = '. Light spilling through an ajar door';
    else if (lower.includes('ocean') || lower.includes('water')) contentHint = '. Dark water reflecting dim moonlight';
  }

  return `${mangaStyle}, vertical composition: ${title}${timeHint}${contentHint}. ${protagonistPrompt} ${toneVisual.mood} atmosphere, ${toneVisual.atmosphere}, ${toneVisual.lighting} lighting, ${bgStyle}. NO butterflies, NO insect imagery. NO face visible on the protagonist.`;
}

// ============================================================
// 客户端图片生成
// ============================================================

export interface ClientGenerateResult {
  success: boolean;
  imageBase64?: string;
  imageUrl?: string;
  prompt?: string;
  error?: string;
  isNetworkError?: boolean;
  /** 是否来自 AI 图片生成 API */
  fromAI?: boolean;
  /** 图片格式 */
  format?: 'png' | 'svg';
}

/**
 * 客户端生成插图
 * 通过服务端 API 生成（服务端使用 OpenAI 兼容 API → SVG 兜底）
 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function generateIllustrationClient(params: {
  title: string;
  tone: StoryTone;
  timeSpan: string;
  decisionDescription: string;
  decisionType: DecisionType;
  contentSnippet?: string;
  size?: '136x238' | '238x136' | '204x152' | '152x204' | '512x512' | '768x1344' | '1344x768' | '1024x1024' | '864x1152' | '1152x864';
  customPrompt?: string;
  /** 是否为亮色模式 */
  isLight?: boolean;
  // 🔧 Round 21 C2-XState: endpoint 参数已移除 (认证端点 body/response 不兼容, 回退到 demo endpoint)
  // 🔧 ARCH fix (Round 22 BUG-R22-H3): 加 signal 参数, 允许调用方 (tryClientIllustrationActor) 中断 fetch
  signal?: AbortSignal;
}): Promise<ClientGenerateResult> {
  return generateViaServerAPI(params);
}

/**
 * 通过服务端 API 生成插图
 */
async function generateViaServerAPI(params: {
  title: string;
  tone: StoryTone;
  timeSpan: string;
  decisionDescription: string;
  decisionType: DecisionType;
  contentSnippet?: string;
  customPrompt?: string;
  isLight?: boolean;
  signal?: AbortSignal;
  // endpoint 已移除 (Round 21 C2-XState revert)
}): Promise<ClientGenerateResult> {
  try {
    // 🔧 ARCH fix (Round 22 BUG-R22-H3): 若调用方提供 signal, 用它替代内部 timeout controller
    //    tryClientIllustrationActor 的 cleanup 会 abort 此 signal, 立即中断 fetch。
    const useExternalSignal = !!params.signal;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000); // AI 生成可能需要更长时间

    // 若有外部 signal, 监听它的 abort 并转发到内部 controller
    // 🔧 ARCH fix (Round 65 LOW-3): 成功路径移除 abort listener, 防止 params.signal 长期持有引用造成内存泄漏
    //   旧代码: addEventListener('abort', fn, { once: true }) — 仅在 abort 触发时自动移除;
    //           若 fetch 正常完成, listener 永久挂在 params.signal 上 (直到外部 controller 被 GC)。
    //   根因修复: 用具名函数 + finally 里 removeEventListener, 确保成功路径也清理。
    const onExternalAbort = () => controller.abort();
    if (useExternalSignal && params.signal) {
      if (params.signal.aborted) {
        controller.abort();
      } else {
        params.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      // 🔧 ARCH fix (Round 5 AUDIT-1 M-4): 用 apiFetch 替代裸 fetch — 获得 30s timeout + credentials + 统一错误处理
      //    apiFetch 内部已处理 callerSignal abort 转发 + listener 清理, 简化外部逻辑
      const data = await apiFetch<{
        success?: boolean;
        imageUrl?: string;
        imageBase64?: string;
        provider?: string;
        prompt?: string;
        format?: 'png' | 'svg';
        error?: string;
        isNetworkError?: boolean;
      }>(
        '/api/butterfly/illustration-demo',
        { method: 'POST', body: params, signal: useExternalSignal ? params.signal : undefined, timeoutMs: 0 },
      );

      if (data.success) {
        const isAI = data.provider === 'openai-compatible';

        // V9: API 可能返回 imageUrl（CDN URL）或 imageBase64（SVG 兜底）
        if (data.imageUrl) {
          // CDN URL 或 data URL — 直接使用
          return {
            success: true,
            imageBase64: data.imageBase64, // 可能不存在（CDN URL 模式）
            imageUrl: data.imageUrl,
            prompt: data.prompt,
            fromAI: isAI,
            format: data.format || 'png',
          };
        }

        if (data.imageBase64) {
          // 旧格式兼容：只有 imageBase64
          const mimeType = data.format === 'svg' ? 'image/svg+xml' : 'image/png';
          return {
            success: true,
            imageBase64: data.imageBase64,
            imageUrl: `data:${mimeType};base64,${data.imageBase64}`,
            prompt: data.prompt,
            fromAI: isAI,
            format: data.format || 'png',
          };
        }
      }

      return {
        success: false,
        error: data.error || 'Server-side generation failed',
        isNetworkError: data.isNetworkError,
      };
    } finally {
      clearTimeout(timeoutId);
      // 🔧 Round 65 LOW-3: 成功 / 失败 / abort 路径都移除 listener, 防止 params.signal 泄漏
      if (useExternalSignal && params.signal) {
        params.signal.removeEventListener('abort', onExternalAbort);
      }
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
      isNetworkError: true,
    };
  }
}
