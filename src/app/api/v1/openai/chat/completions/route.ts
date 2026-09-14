export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { SSE_HEADERS } from '@/lib/sse';
import { extractAndValidateApiKey, getCorsHeaders, handleOptions } from '@/lib/proxy-auth';
import { z } from 'zod';

// ============================================================
// POST /api/v1/openai/chat/completions — Azure OpenAI 标准路径代理
// ============================================================
// Azure OpenAI 的标准路径是 {endpoint}/openai/chat/completions
// 此路由复用与 /api/v1/chat/completions 相同的代理逻辑
// 支持 Azure api-key header 格式
// 实际转发到 https://open.bigmodel.cn/api/coding/paas/v4/chat/completions，强制 model=glm-5.2
//
// 🔧 ARCH fix (Round 2 H3): 用 extractAndValidateApiKey (旧代码 === 比较)。
// 🔧 ARCH fix (Round 2 H4): timingSafeEqual。
// 🔧 ARCH fix (Round 2 L2): 旧代码 CORS 用 * → 改用共享 getCorsHeaders (origin 白名单)。

const UPSTREAM_BASE_URL = process.env.UPSTREAM_LLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
const OVERRIDE_MODEL = process.env.UPSTREAM_LLM_MODEL || 'glm-5.2';

/** 上游 GLM 的 API Key — 必须在 Vercel 环境变量配置 UPSTREAM_LLM_API_KEY */
const UPSTREAM_API_KEY = process.env.UPSTREAM_LLM_API_KEY;

interface ChatCompletionRequest {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
}

  // eslint-disable-next-line require-await -- async for API consistency
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  const apiKey = extractAndValidateApiKey(req);
  if (!apiKey) {
    return Response.json(
      { error: { message: 'Missing or invalid authentication. Use api-key header or Authorization: Bearer <key>', type: 'auth_error' } },
      { status: 401, headers: corsHeaders },
    );
  }

  // 🔧 2026-07-21 audit fix (port from /api/v1/chat/completions ARCH-2 #5):
  //    旧代码无 rate limit (与 v1/chat 不一致) → 滥用导致 LLM 成本失控。30 req/hour per key。
  const { checkRateLimit } = await import('@/lib/distributed-lock');
  const rateLimitKey = `v1-openai-chat:${apiKey.substring(0, 16)}`;
  const { allowed: rateLimitAllowed } = await checkRateLimit(rateLimitKey, 30, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return Response.json(
      { error: { message: 'Rate limit exceeded. Maximum 30 requests per hour.', type: 'rate_limit_error' } },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': '3600' } },
    );
  }

  const contentLength = req.headers.get('Content-Length');
  const MAX_BODY_SIZE = 1024 * 1024;
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return Response.json(
      { error: { message: 'Request body too large (max 1MB)', type: 'invalid_request_error' } },
      { status: 413, headers: corsHeaders },
    );
  }

  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  // 🔧 2026-07-21 audit fix (port ARCH-8 #1 from /api/v1/chat/completions):
  //    旧代码 .passthrough() 允许 n=100 (100× token cost)、max_tokens=1000000、tools 等
  //    未知字段 → 成本攻击。改为 .strict() + 显式 clamp (与 v1/chat 完全一致)。
  const proxySchema = z.object({
    messages: z.array(z.object({
      role: z.string().min(1).max(50),
      content: z.union([z.string().max(10000), z.array(z.any())]),
    })).min(1, 'messages is required and must be a non-empty array').max(50),
    model: z.string().max(200).optional(),
    stream: z.boolean().optional(),
    n: z.number().int().min(1).max(1).optional(), // 固定为 1 — 拒绝 n>1 (100× cost)
    max_tokens: z.number().int().min(1).max(4096).optional(), // reject > 4096 (不是 clamp)
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    stop: z.union([z.string().max(100), z.array(z.string().max(100)).max(4)]).optional(),
    user: z.string().max(200).optional(),
  }).strict();
  let body: ChatCompletionRequest;
  try {
    body = proxySchema.parse(await req.json()) as ChatCompletionRequest;
  } catch (parseErr) {
    if (parseErr instanceof SyntaxError) {
      return Response.json(
        { error: { message: 'Invalid JSON in request body', type: 'invalid_request_error' } },
        { status: 400, headers: corsHeaders },
      );
    }
    const issues = parseErr instanceof z.ZodError ? parseErr.issues : [];
    const message = issues[0]?.message || 'Validation failed';
    return Response.json(
      { error: { message, type: 'invalid_request_error' } },
      { status: 400, headers: corsHeaders },
    );
  }

  const originalModel = body.model;
  body.model = OVERRIDE_MODEL;

  const isStream = body.stream === true;
  logger.info(`[Azure LLM Proxy] model override: ${originalModel || '(none)'} → ${OVERRIDE_MODEL}, stream=${isStream}`);

  const upstreamUrl = `${UPSTREAM_BASE_URL}/chat/completions`;

  if (!UPSTREAM_API_KEY) {
    logger.error('[Azure LLM Proxy] UPSTREAM_LLM_API_KEY environment variable is not set');
    return Response.json(
      { error: { message: 'Upstream service not configured. Please contact admin.', type: 'server_error' } },
      { status: 503, headers: corsHeaders },
    );
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${UPSTREAM_API_KEY}`,
      },
      body: JSON.stringify(body),
      // 🔧 ARCH fix (Round 3 SSE C5): 传播客户端断开信号到上游
      signal: req.signal,
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      logger.warn(`[Azure LLM Proxy] Upstream error ${upstreamResponse.status}: ${errorText.slice(0, 200)}`);

      let errorData: unknown;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText, type: 'upstream_error' } };
      }

      return Response.json(errorData, {
        status: upstreamResponse.status,
        headers: corsHeaders,
      });
    }

    if (isStream && upstreamResponse.body) {
      return new Response(upstreamResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...SSE_HEADERS,
        },
      });
    }

    const data = await upstreamResponse.json();
    return Response.json(data, { status: 200, headers: corsHeaders });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Azure LLM Proxy] Fetch failed: ${message}`);
    return Response.json(
      { error: { message: 'Upstream service unavailable. Please try again later.', type: 'upstream_error' } },
      { status: 502, headers: corsHeaders },
    );
  }
}
