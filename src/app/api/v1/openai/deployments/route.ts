export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { extractAndValidateApiKey, getCorsHeaders, handleOptions } from '@/lib/proxy-auth';

// ============================================================
// GET /api/v1/openai/deployments — Azure OpenAI 标准路径的模型发现端点
// ============================================================
// Azure OpenAI 的标准格式是 {endpoint}/openai/deployments
// Letta Azure provider 可能调用此路径而非 /api/v1/deployments
// 两个端点返回相同的 Azure Deployments API 格式响应
//
// 🔧 ARCH fix (Round 2 H3): 旧代码接受任意非空 key → 信息泄露。
// 🔧 ARCH fix (Round 2 L2): 旧代码 CORS 用 * → 改用共享 getCorsHeaders (origin 白名单)。
// 🔧 ARCH fix (Round 2 H4): timingSafeEqual 比较。

const OVERRIDE_MODEL = 'glm-5.2';
const DEPLOYMENT_ID = 'glm-5.2';

  // eslint-disable-next-line require-await -- async for API consistency
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(req: NextRequest) {
  // 🔧 Round 2 H3 fix: 验证 API Key (旧代码接受任意非空 key)
  const apiKey = extractAndValidateApiKey(req);
  const apiVersion = req.nextUrl.searchParams.get('api-version') || 'unknown';

  if (!apiKey) {
    return Response.json(
      {
        error: {
          message: 'Missing or invalid authentication. Use api-key header or Authorization: Bearer <key>',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401, headers: getCorsHeaders(req) },
    );
  }

  logger.info(`[OpenAI Deployments] Discovery request: api-version=${apiVersion}, auth=valid`);

  const DEPLOYMENT_CREATED = 1740000000;

  const response = {
    object: 'list',
    data: [
      {
        id: DEPLOYMENT_ID,
        object: 'deployment',
        status: 'succeeded',
        model: OVERRIDE_MODEL,
        owner: 'symy-proxy',
        created_at: DEPLOYMENT_CREATED,
        updated_at: DEPLOYMENT_CREATED,
        scale_settings: { scale_type: 'standard' },
        rate_limits: [{ key: 'requests', renewal_period: 60, count: 1000 }],
        capabilities: { chat_completion: true, completion: false, embeddings: false },
      },
    ],
  };

  return Response.json(response, { status: 200, headers: getCorsHeaders(req) });
}
