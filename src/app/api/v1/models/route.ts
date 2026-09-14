import { NextRequest } from 'next/server';
import { extractAndValidateApiKey, getCorsHeaders, handleOptions } from '@/lib/proxy-auth';

// ============================================================
// GET /api/v1/models — 返回 Letta 可发现的模型列表
// ============================================================
// OpenAI SDK 兼容：用户调用 models.list() 时返回我们的模型
// Letta 通过此端点发现模型，handle 格式为 {provider_name}/{model_id}
// 返回 glm-5.2 作为模型名，chat/completions 代理会自动覆盖为 glm-5.2
//
// 🔧 ARCH fix (Round 2 H3): 旧代码 extractApiKey 接受任意非空 key → 信息泄露 (模型名暴露)。
//    根因修复: 用共享 extractAndValidateApiKey (timingSafeEqual + secret 匹配)。
// 🔧 ARCH fix (Round 2 H4): 旧代码无 secret 验证 → 现在统一验证。
// 🔧 ARCH fix (Round 2 L2): 旧代码 CORS 不一致 → 现在用共享 getCorsHeaders。

// 对外暴露的模型名（Letta 用这个作为 model handle）
const DISPLAY_MODEL = 'glm-5.2';

  // eslint-disable-next-line require-await -- async for API consistency
export const dynamic = 'force-dynamic';
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(req: NextRequest) {
  // 🔧 Round 2 H3 fix: 验证 API Key (旧代码接受任意非空 key)
  const apiKey = extractAndValidateApiKey(req);
  if (!apiKey) {
    return Response.json(
      { error: { message: 'Missing or invalid Authorization header', type: 'auth_error' } },
      { status: 401, headers: getCorsHeaders(req) },
    );
  }

  // 返回 OpenAI /v1/models 格式响应
  // BUG-130 fix: 使用固定 created 时间戳，避免客户端无谓重复拉取
  const MODEL_CREATED = 1740000000; // 2025-02-20 固定值

  return Response.json(
    {
      object: 'list',
      data: [
        {
          id: DISPLAY_MODEL,
          object: 'model',
          created: MODEL_CREATED,
          owned_by: 'symy-proxy',
          permission: [],
          root: DISPLAY_MODEL,
        },
      ],
    },
    { status: 200, headers: getCorsHeaders(req) },
  );
}
