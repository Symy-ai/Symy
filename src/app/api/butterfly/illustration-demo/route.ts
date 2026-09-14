/**
 * POST /api/butterfly/illustration-demo — 生成演示插图（无需认证和 Supabase）
 *
 * V9: OpenAI 兼容 API 返回图片 URL → SVG 兜底
 *
 * 生成链路：
 * 1. 构建 Prompt → 调用 OpenAI 兼容 API → API 返回图片 URL
 * 2. AI 生成成功 → 返回 imageUrl（CDN URL）
 * 3. AI 生成失败 → 生成 SVG 程序化插图作为兜底
 *
 * 🔒 ARCH fix (Round 2 C1 — prompt injection):
 *    旧代码接受 body.prompt 直接传给 OpenAI 图片 API → 任意匿名用户可用项目 API key
 *    生成任意图片 (NSFW/非法/版权)。根因修复: 移除 body.prompt 透传, 一律服务端构建 prompt。
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { logger } from '@/lib/logger';
import { generateSVGIllustration } from '@/features/butterfly/lib/svg-illustration-engine';
import {
  isImageAPIConfigured,
  generateWithOpenAICompatible,
  buildPrompt,
  buildMultiShotScenePrompts,
} from '@/features/butterfly/lib/illustration-engine';
import type { StoryTone } from '@/features/butterfly/types';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/distributed-lock';
import { z } from 'zod';

// 🔧 BUG-270 / TECH-DEBT-A: IP 速率限制（现在用 Supabase 分布式存储）
const RATE_LIMIT_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// 支持的尺寸（V12: 1/8 分辨率）
type ValidSize = '384x672' | '672x384' | '136x238' | '238x136' | '204x152' | '152x204' | '512x512' | '432x576' | '576x432' | '768x1344' | '1344x768' | '1024x1024' | '864x1152' | '1152x864' | '1440x720' | '720x1440';
const VALID_SIZES: readonly string[] = ['384x672', '672x384', '136x238', '238x136', '204x152', '152x204', '512x512', '432x576', '576x432', '768x1344', '1344x768', '1024x1024', '864x1152', '1152x864', '1440x720', '720x1440'];

// 🔧 ARCH fix (Round 2 C1): 输入长度限制, 防止超长输入
const MAX_TITLE_LENGTH = 200;
const MAX_DECISION_DESC_LENGTH = 500;
const MAX_SCENE_TEXT_LENGTH = 2000;
const MAX_CONTENT_SNIPPET_LENGTH = 2000;

function sanitizeString(s: string | undefined, maxLen: number): string {
  if (!s || typeof s !== 'string') return '';
  // 截断 + 去除换行 (防 prompt 注入换行指令)
  return s.slice(0, maxLen).replace(/[\r\n]+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  // 🔧 BUG-270 / TECH-DEBT-A: 分布式速率限制
  // 🔧 ARCH fix (Round 2 M11): 用 x-vercel-forwarded-for (Vercel 边缘设置, 不可伪造) 优先
  const clientIp =
    req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const { allowed } = await checkRateLimit(`illust-demo:${clientIp}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 10 illustration requests per hour.' },
      { status: 429 }
    );
  }

  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  //    同时保留 sanitizeString 调用 (clamp 长度)
  const illustrationSchema = z.object({
    size: z.string().max(20).optional(),
    tone: z.string().max(50).optional(),
    title: z.string().max(200).optional(),
    timeSpan: z.string().max(100).optional(),
    decisionDescription: z.string().max(2000).optional(),
    decisionType: z.string().max(50).optional(),
    contentSnippet: z.string().max(5000).optional(),
    chapterIndex: z.number().int().min(0).max(100).optional(),
    isSceneLevel: z.boolean().optional(),
    sceneText: z.string().max(5000).optional(),
    shotIndex: z.number().int().min(0).max(10).optional(),
    isLight: z.boolean().optional(),
  }).passthrough();
  let body;
  try {
    body = illustrationSchema.parse(await req.json());
  } catch {
    body = {};
  }

  const size: ValidSize = (body.size && VALID_SIZES.includes(body.size)) ? body.size as ValidSize : '136x238';
  const tone = (body.tone || 'neutral') as StoryTone;
  // 🔧 ARCH fix (Round 2 C1): sanitize 所有用户输入
  const title = sanitizeString(body.title, MAX_TITLE_LENGTH) || 'Untitled';
  const chapterIndex = body.chapterIndex || 0;
  const isLight = body.isLight || false;
  const decisionDescription = sanitizeString(body.decisionDescription, MAX_DECISION_DESC_LENGTH) || 'an induced purchase';
  const sceneText = sanitizeString(body.sceneText, MAX_SCENE_TEXT_LENGTH);
  const contentSnippet = sanitizeString(body.contentSnippet, MAX_CONTENT_SNIPPET_LENGTH);

  // ---- 首选方案：OpenAI 兼容 API ----
  if (isImageAPIConfigured()) {
    let prompt: string;

    if (body.isSceneLevel && sceneText) {
      // 场景级插图：使用多镜头 prompt（V4 Galgame）
      const shotIndex = body.shotIndex ?? 0;
      const prompts = buildMultiShotScenePrompts(
        sceneText,
        title,
        tone,
        decisionDescription,
        2, // 每场景2张图
        isLight,
      );
      // 选择对应镜头的 prompt
      prompt = prompts[shotIndex] || prompts[0];
    } else {
      // 章节级插图：使用章节信息构建 prompt
      prompt = buildPrompt(
        title,
        tone,
        sanitizeString(body.timeSpan, MAX_TITLE_LENGTH) || 'the future',
        decisionDescription,
        (body.decisionType || 'impulse_buy') as import('@/features/butterfly/types').DecisionType,
        contentSnippet || undefined,
        undefined, // llmSceneDescription
        isLight,
      );
    }

    const aiSize = '136x238';

    logger.info('[Illust Demo] Attempting AI generation for:', title, 'size:', aiSize, 'sceneLevel:', !!body.isSceneLevel);

    const result = await generateWithOpenAICompatible(prompt, aiSize, 30_000);

    if (result) {
      // API 返回的是图片 URL（CDN URL 或 data URL）
      const isDataUrl = result.imageUrl.startsWith('data:');

      if (isDataUrl) {
        // 兼容 b64_json 格式 — 提取 base64 部分
        const base64 = result.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        return NextResponse.json({
          success: true,
          imageBase64: base64,
          imageUrl: result.imageUrl,
          prompt,
          size,
          format: 'png',
          provider: 'openai-compatible',
        });
      }

      // CDN URL — 直接返回 URL，不需要 imageBase64
      return NextResponse.json({
        success: true,
        imageUrl: result.imageUrl,
        prompt,
        size,
        format: 'png',
        provider: 'openai-compatible',
      });
    }

    logger.info('[Illust Demo] AI generation failed, falling back to SVG');
  }

  // ---- 兜底方案：SVG 程序化插图 ----
  logger.info('[Illust Demo] Generating SVG illustration for:', title);

  const svgDataUrl = generateSVGIllustration(title, tone, chapterIndex, isLight);
  const svgBase64 = svgDataUrl.replace('data:image/svg+xml;base64,', '');

  return NextResponse.json({
    success: true,
    imageBase64: svgBase64,
    imageUrl: svgDataUrl,
    prompt: `SVG illustration for "${title}"`,
    size,
    format: 'svg',
    provider: 'svg-programmatic',
  });
}
