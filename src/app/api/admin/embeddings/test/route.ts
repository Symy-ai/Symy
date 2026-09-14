/**
 * /api/admin/embeddings/test — Embedding API 连通性测试
 *
 * GET /api/admin/embeddings/test              — 调用一次 embedding（用配置的模型）
 * GET /api/admin/embeddings/test?action=list  — 列出 API 支持的所有模型
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';

// 测试端点也用 1024 维（与生产一致，调 API 时传 dimensions=1024）
const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_API_BASE_RAW = process.env.EMBEDDING_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
// 智能去掉 /embeddings 后缀（用户可能配了完整 URL）
const EMBEDDING_API_BASE = EMBEDDING_API_BASE_RAW.replace(/\/$/, '').replace(/\/embeddings$/, '');
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.AGNES_API_KEY || '';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'embedding-3';

export async function GET(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  if (!verifyAdminAuth(req).authorized) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'test';

  // 🔧 ARCH fix (Round 22 M6 — API key 前 8 字符暴露):
  //    旧代码暴露前 8 字符 — 某些 API key (如 ZhipuAI) 前 8 字符是固定前缀,
  //    加上已知 key 长度可缩小暴力破解空间。
  //    根因修复: 只暴露 "configured" 或 "(empty)", 不暴露任何 key 内容。
  const keyConfigured = EMBEDDING_API_KEY ? 'configured' : '(empty)';

  const result: Record<string, unknown> = {
    config: {
      apiBase: EMBEDDING_API_BASE,
      apiKeyStatus: keyConfigured,
      model: EMBEDDING_MODEL,
    },
  };

  if (!EMBEDDING_API_KEY) {
    result.error = 'No API key configured (neither EMBEDDING_API_KEY nor AGNES_API_KEY)';
    return NextResponse.json(result, { status: 500 });
  }

  // ============================================================
  // action=list: 列出所有模型
  // ============================================================
  if (action === 'list') {
    try {
      const response = await fetch(`${EMBEDDING_API_BASE}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        },
      });

      result.response = { status: response.status, statusText: response.statusText };
      const text = await response.text();

      if (!response.ok) {
        result.error = `List models failed: ${response.status}`;
        result.errorBody = text.substring(0, 500);
        return NextResponse.json(result, { status: 500 });
      }

      let data;
      try { data = JSON.parse(text); } catch {
        result.error = 'Models response is not JSON';
        result.rawBody = text.substring(0, 500);
        return NextResponse.json(result, { status: 500 });
      }

      const models = Array.isArray(data?.data) ? data.data : [];
      const modelIds = models.map((m: Record<string, unknown>) => m.id).filter(Boolean);

      // 过滤可能的 embedding 模型（按名称关键词）
      const embeddingKeywords = ['embed', 'embedding', 'bge', 'gte', 'jina', 'e5'];
      const embeddingModels = modelIds.filter((id: string) =>
        embeddingKeywords.some(kw => id.toLowerCase().includes(kw))
      );

      result.totalModels = modelIds.length;
      result.allModels = modelIds;
      result.embeddingModels = embeddingModels;

      return NextResponse.json(result);
    } catch (err) {
      result.error = 'Fetch failed';
      result.errorMessage = err instanceof Error ? err.message : String(err);
      return NextResponse.json(result, { status: 500 });
    }
  }

  // ============================================================
  // action=test (默认): 调用一次 embedding
  // ============================================================
  try {
    const testText = 'Hello world, this is a test embedding.';
    const startTime = Date.now();

    const response = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: testText,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    result.response = {
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startTime,
    };

    const responseText = await response.text();

    if (!response.ok) {
      result.error = `API returned ${response.status}`;
      result.errorBody = responseText.substring(0, 500);
      return NextResponse.json(result, { status: 500 });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      result.error = 'Response is not valid JSON';
      result.rawBody = responseText.substring(0, 500);
      return NextResponse.json(result, { status: 500 });
    }

    const embedding = data?.data?.[0]?.embedding;
    result.success = true;
    result.tokensUsed = data?.usage?.total_tokens || 0;
    result.embeddingDimensions = Array.isArray(embedding) ? embedding.length : 'non-array';
    result.embeddingFirst5 = Array.isArray(embedding) ? embedding.slice(0, 5) : null;
    result.modelReturned = data?.model || '(not in response)';

    return NextResponse.json(result);
  } catch (err) {
    result.error = 'Fetch failed';
    result.errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(result, { status: 500 });
  }
}

