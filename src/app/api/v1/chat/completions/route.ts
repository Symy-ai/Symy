import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { SSE_HEADERS } from '@/lib/sse';
import { extractAndValidateApiKey, getCorsHeaders, handleOptions } from '@/lib/proxy-auth';
import { z } from 'zod';

// ============================================================
// OpenAI 兼容代理 — 转发到 GLM-5.2（智谱 AI）
// ============================================================
// 外部用户设置 base_url = https://<our-domain>/api/v1
// 调用 chat/completions 时，强制 model=glm-5.2
// 转发到 https://open.bigmodel.cn/api/coding/paas/v4/chat/completions
// 上游 API Key 优先用 UPSTREAM_LLM_API_KEY 环境变量，否则 fallback 到内置 GLM key
// 客户端传入的 key 仅作为 basic auth gate，不透传到上游
//
// 🔧 ARCH fix (Round 2 H3+H4): 用共享 extractAndValidateApiKey (timingSafeEqual + secret 匹配)。
// 🔧 ARCH fix (Round 2 L2): 用共享 getCorsHeaders (origin 白名单, 不再用 *)。

const UPSTREAM_BASE_URL = process.env.UPSTREAM_LLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
const OVERRIDE_MODEL = process.env.UPSTREAM_LLM_MODEL || 'glm-5.2';

/** 上游 GLM 的 API Key — 必须在 Vercel 环境变量配置 UPSTREAM_LLM_API_KEY */
const UPSTREAM_API_KEY = process.env.UPSTREAM_LLM_API_KEY;

/** 请求体类型 — 只关心 model 和 stream 字段，其他原样透传 */
interface ChatCompletionRequest {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
}

// 🔧 ARCH fix (Round 2): extractApiKey / getCorsOrigin / getCorsHeaders 已移到 @/lib/proxy-auth
// 旧代码用 === 比较 secret (H4 — 时序攻击), 已改用 timingSafeEqual (见 proxy-auth.ts)

  // eslint-disable-next-line require-await -- async for API consistency
export const dynamic = 'force-dynamic';
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

// ============================================================
// POST /api/v1/chat/completions
// ============================================================
export async function POST(req: NextRequest) {
  // BUG-284 fix: CORS origin 限制
  const corsHeaders = getCorsHeaders(req);

  // 1. 提取用户 API Key (🔧 Round 2: 用共享 extractAndValidateApiKey)
  const apiKey = extractAndValidateApiKey(req);
  if (!apiKey) {
    return Response.json(
      { error: { message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <your-api-key>', type: 'auth_error' } },
      { status: 401, headers: corsHeaders },
    );
  }

  // 🔧 2026-07-15 (ARCH-2 #5 修复): Rate limiting on v1 proxy (paid GLM-5.2)
  //    旧代码: 无 rate limit → 滥用导致 LLM 成本失控
  //    修复: 30 requests/hour per API key (与 /api/chat 一致)
  const { checkRateLimit } = await import('@/lib/distributed-lock');
  const rateLimitKey = `v1-chat:${apiKey.substring(0, 16)}`;
  const { allowed: rateLimitAllowed } = await checkRateLimit(rateLimitKey, 30, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return Response.json(
      { error: { message: 'Rate limit exceeded. Maximum 30 requests per hour.', type: 'rate_limit_error' } },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': '3600' } },
    );
  }

  // 2. 请求体大小检查（BUG-126: 防止巨大 payload 耗尽 serverless 内存）
  const contentLength = req.headers.get('Content-Length');
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return Response.json(
      { error: { message: 'Request body too large (max 1MB)', type: 'invalid_request_error' } },
      { status: 413, headers: corsHeaders },
    );
  }

  // 3. 解析请求体 + 验证 messages 数组
  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  //    BUG-126: 1MB body size check (above)
  //    BUG-132: messages array validation (zod)
  // 🔧 2026-07-15 (ARCH-8 #1 修复): 移除 .passthrough(), 改为显式 allowlist + clamp
  //    旧代码 .passthrough() 允许 n=100 → 100× token cost, max_tokens=1000000 等
  //    修复: 显式定义允许的字段 + clamp 危险字段
  //    - n: 固定为 1 (拒绝 n>1, 防止 100× cost)
  //    - max_tokens: reject > 4096 (防超长响应; schema .max(4096) 是拒绝不是 clamp)
  //    - temperature: clamp 0-2
  //    - top_p: clamp 0-1
  //    - tools/tool_choice: 拒绝 (不支持 function calling 代理)
  const proxySchema = z.object({
    messages: z.array(z.object({
      role: z.string().min(1).max(50),
      content: z.union([z.string().max(10000), z.array(z.any())]),
    })).min(1, 'messages is required and must be a non-empty array').max(50),
    model: z.string().max(200).optional(),
    stream: z.boolean().optional(),
    // 🔧 2026-07-15: 显式 allowlist (替代 .passthrough())
    n: z.number().int().min(1).max(1).optional(), // 固定为 1 — 拒绝 n>1
    max_tokens: z.number().int().min(1).max(4096).optional(), // reject > 4096 (不是 clamp)
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    stop: z.union([z.string().max(100), z.array(z.string().max(100)).max(4)]).optional(),
    user: z.string().max(200).optional(),
  }).strict(); // 🔧 strict() 替代 passthrough() — 拒绝未知字段 (如 tools, tool_choice, n>1 等)
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

  // 5. 强制覆盖 model，其余参数原样透传
  const originalModel = body.model;
  body.model = OVERRIDE_MODEL;

  const isStream = body.stream === true;
  logger.info(`[LLM Proxy] model override: ${originalModel || '(none)'} → ${OVERRIDE_MODEL}, stream=${isStream}`);

  // 4. 转发到上游
  const upstreamUrl = `${UPSTREAM_BASE_URL}/chat/completions`;

  // 环境变量检查：UPSTREAM_API_KEY 必须配置
  if (!UPSTREAM_API_KEY) {
    logger.error('[LLM Proxy] UPSTREAM_LLM_API_KEY environment variable is not set');
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
      // 🔧 ARCH fix (Round 3 SSE C5): 传播客户端断开信号到上游, 防止 GLM token 继续生成
      signal: req.signal,
    });

    // 上游返回错误 — 透传错误信息
    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      logger.warn(`[LLM Proxy] Upstream error ${upstreamResponse.status}: ${errorText.slice(0, 200)}`);

      // 尝试解析为 OpenAI 格式错误，否则包装一下
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

    // 5. 流式响应 — 直接 pipe SSE
    if (isStream && upstreamResponse.body) {
      return new Response(upstreamResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...SSE_HEADERS,
        },
      });
    }

    // 6. 非流式响应 — 透传 JSON
    const data = await upstreamResponse.json();
    return Response.json(data, { status: 200, headers: corsHeaders });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[LLM Proxy] Fetch failed: ${message}`);
    // BUG-127 fix: 不向客户端暴露上游内部错误详情，仅返回通用错误
    return Response.json(
      { error: { message: 'Upstream service unavailable. Please try again later.', type: 'upstream_error' } },
      { status: 502, headers: corsHeaders },
    );
  }
}

