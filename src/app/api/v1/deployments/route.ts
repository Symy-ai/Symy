import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { extractAndValidateApiKey, getCorsHeaders, handleOptions } from '@/lib/proxy-auth';

// ============================================================
// GET /api/v1/deployments — Azure OpenAI 兼容的模型发现端点
// ============================================================
// Letta 的 Azure 类型 Provider 通过 GET /deployments 来发现可用模型
// 返回 Azure OpenAI Deployments API 格式响应
// 我们的代理将所有模型请求统一转发到 glm-5.2
//
// 🔧 ARCH fix (Round 2 H3): 旧代码 "不强验证 key" → 任意非空 key 通过, 信息泄露。
//    根因修复: 用 extractAndValidateApiKey 验证 secret 匹配。
// 🔧 ARCH fix (Round 2 H4): timingSafeEqual 比较。
// 🔧 ARCH fix (Round 2 L2): 统一 CORS。

const OVERRIDE_MODEL = 'glm-5.2';

/** Azure OpenAI 需要的 deployment 名称（Letta 用这个作为模型 handle） */
const DEPLOYMENT_ID = 'glm-5.2';

  // eslint-disable-next-line require-await -- async for API consistency
export const dynamic = 'force-dynamic';
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

/**
 * GET /api/v1/deployments
 *
 * Azure OpenAI Deployments API 兼容端点
 * Letta 调用此端点来发现 Azure Provider 下的可用模型
 */
  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(req: NextRequest) {
  // 🔧 Round 2 H3 fix: 验证 API Key (旧代码接受任意非空 key)
  const apiKey = extractAndValidateApiKey(req);
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

  const apiVersion = req.nextUrl.searchParams.get('api-version') || 'unknown';
  logger.info(`[Deployments] Discovery request: api-version=${apiVersion}, auth=valid`);

  const DEPLOYMENT_CREATED = 1740000000; // 固定时间戳

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
        scale_settings: {
          scale_type: 'standard',
        },
        rate_limits: [
          {
            key: 'requests',
            renewal_period: 60,
            count: 1000,
          },
        ],
        capabilities: {
          chat_completion: true,
          completion: false,
          embeddings: false,
        },
      },
    ],
  };

  return Response.json(response, { status: 200, headers: getCorsHeaders(req) });
}
