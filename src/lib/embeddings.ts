import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Embeddings 生成 — RAG 第一步
 *
 * 道经依据：道体二·共生（AI 记住用户的过去，双向闭环）
 *
 * 当前供应商：智谱 AI（zhipuai.cn）
 * - API Base: https://open.bigmodel.cn/api/paas/v4
 * - Key: EMBEDDING_API_KEY（Vercel 环境变量已配置）
 * - Model: embedding-3（2048 维，OpenAI 兼容）
 *
 * 环境变量（Vercel 已配置）：
 * - EMBEDDING_API_BASE: embedding API base（智能识别是否含 /embeddings 后缀）
 * - EMBEDDING_API_KEY: API key
 * - EMBEDDING_MODEL: 模型名（默认 embedding-3）
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 */


// ============================================================
// 配置
// ============================================================

// 智能 base 处理：用户可能配 /v4 或 /v4/embeddings，统一规整为 /v4
/**
 * 规整 embedding API base URL：
 * - 去掉尾部斜杠
 * - 去掉 /embeddings 后缀（如果存在）
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74): export for unit testing.
 *    旧: internal-only, 无法测试 URL 规整边界条件。
 *    修复: export 让 test 覆盖 trailing slash / /embeddings suffix / 无后缀 等场景。
 */
export function normalizeApiBase(raw: string): string {
  // 🔧 ARCH fix (Round 74 ARCH-DEEP-74): 旧代码 replace(/\/$/, '') 只移除最后一个斜杠,
  //    若用户配 'https://api.example.com/v4//' → 结果 'https://api.example.com/v4//embeddings'
  //    (双斜杠, 多数 HTTP server 容忍但不规范)。
  //    根因修复: 用 /\/+$/ 移除所有尾部斜杠。
  let base = raw.replace(/\/+$/, '');
  // 如果 base 已含 /embeddings 后缀，去掉
  if (base.endsWith('/embeddings')) {
    base = base.slice(0, -'/embeddings'.length);
  }
  return base;
}

const EMBEDDING_API_BASE = normalizeApiBase(
  process.env.EMBEDDING_API_BASE || 'https://open.bigmodel.cn/api/paas/v4'
);
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.AGNES_API_KEY || '';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'embedding-3';
// 智谱 embedding-3 默认 2048 维，但 pgvector HNSW 索引限制 2000 维
// 显式指定 1024 维（HNSW 兼容 + 中文检索质量足够，BGE-m3 同维）
export const EMBEDDING_DIMENSIONS = 1024;

// ============================================================
// 类型
// ============================================================

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

// ============================================================
// 主接口
// ============================================================

/**
 * 检查 embedding API 是否配置
 */
export function isEmbeddingConfigured(): boolean {
  return EMBEDDING_API_KEY.length > 0;
}

/**
 * 为单条文本生成 embedding
 *
 * @param text 待嵌入文本（自动截断到 8000 字符，避免 token 爆表）
 * @returns embedding 向量 + token 数；失败抛错
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  if (!isEmbeddingConfigured()) {
    // 🔧 ARCH fix (Round 12 M1): 旧代码引用错误的环境变量名
    throw new Error('Embedding API not configured (EMBEDDING_API_KEY or AGNES_API_KEY missing)');
  }

  // 截断到 8000 字符（embedding-3 上限 8191 tokens，保守留余量）
  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;

  // 🔧 2026-07-15 (ARCH-4 #16 修复): 加 30s timeout — 旧代码无 timeout, embedding API 挂起时永久阻塞
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS, // 智谱 embedding-3 支持降维，指定 1024（HNSW 兼容）
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  const tokens = data?.usage?.total_tokens || 0;

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Invalid embedding response: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${Array.isArray(embedding) ? embedding.length : 'non-array'}`);
  }

  return { embedding, tokens };
}

/**
 * 批量生成 embedding（一次 API 调用处理多条）
 *
 * @param texts 文本数组（最多 100 条/次，超过自动分批）
 * @returns embedding 数组（与输入顺序一致）
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResult[]> {
  if (!isEmbeddingConfigured()) {
    throw new Error('Embedding API not configured');
  }

  if (texts.length === 0) return [];

  // 智谱 API 限制：批量 embedding input 数组最大 64 条/次
  const BATCH_SIZE = 64;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    // 截断每条
    const truncated = batch.map(t => t.length > 8000 ? t.slice(0, 8000) : t);

    // 🔧 2026-07-15 (ARCH-4 #16): 30s timeout
    const batchController = new AbortController();
    const batchTimeoutId = setTimeout(() => batchController.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(`${EMBEDDING_API_BASE}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: truncated,
          dimensions: EMBEDDING_DIMENSIONS, // 智谱 embedding-3 降维到 1024
        }),
        signal: batchController.signal,
      });
    } finally {
      clearTimeout(batchTimeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch embedding API error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const batchEmbeddings: Array<{ embedding: number[]; index?: number }> = data?.data || [];
    const batchTokens: number = data?.usage?.total_tokens || 0;

    // 🔧 ARCH fix (Round 12 C1): 旧代码 sort comparator 返回 0 (no-op) → 若 API 返回乱序,
    //    embedding[i] 与 texts[i] 错位 → RAG 检索返回错误内容 → 永久数据损坏。
    //    根因修复: 按 index 字段排序 (OpenAI 兼容 API 应返回 index)。
    if (batchEmbeddings.length > 0 && typeof batchEmbeddings[0].index === 'number') {
      batchEmbeddings.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }

    // 🔧 ARCH fix (Round 12 C1): 验证返回数量与请求一致
    if (batchEmbeddings.length !== batch.length) {
      throw new Error(`Batch embedding count mismatch: expected ${batch.length}, got ${batchEmbeddings.length}`);
    }

    for (const item of batchEmbeddings) {
      if (!Array.isArray(item.embedding) || item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Invalid batch embedding: expected ${EMBEDDING_DIMENSIONS} dimensions`);
      }
      results.push({
        embedding: item.embedding,
        tokens: Math.floor(batchTokens / batch.length), // 平均分配
      });
    }
  }

  return results;
}

// ============================================================
// 内部辅助：从原始记录构造可嵌入文本
// ============================================================

/**
 * 从 impulse_event 构造可嵌入文本
 */
export function buildImpulseEventText(event: {
  platform?: string;
  title?: string;
  amount?: number;
  category?: string;
  raw_text?: string;
  reasons?: string[];
}): string {
  const parts: string[] = [];
  if (event.platform) parts.push(`Platform: ${event.platform}`);
  if (event.title) parts.push(`Title: ${event.title}`);
  if (event.amount != null) parts.push(`Amount: $${event.amount}`);
  if (event.category) parts.push(`Category: ${event.category}`);
  if (event.raw_text) parts.push(`Details: ${event.raw_text}`);
  if (Array.isArray(event.reasons) && event.reasons.length > 0) {
    parts.push(`Impulse signals: ${event.reasons.join(', ')}`);
  }
  return parts.join(' | ');
}

/**
 * 从 email_receipt 构造可嵌入文本
 */
export function buildReceiptText(receipt: {
  platform?: string;
  item_name?: string;
  amount?: number;
  subject?: string;
  snippet?: string;
  from_address?: string;
}): string {
  const parts: string[] = [];
  // 🔧 ARCH fix (Round 12 M2): 删除无用 wrapper event_platform(), 直接用 receipt.platform
  if (receipt.platform) parts.push(`Platform: ${receipt.platform}`);
  if (receipt.item_name) parts.push(`Item: ${receipt.item_name}`);
  if (receipt.amount != null) parts.push(`Amount: $${receipt.amount}`);
  if (receipt.subject) parts.push(`Subject: ${receipt.subject}`);
  if (receipt.snippet) parts.push(`Snippet: ${receipt.snippet}`);
  if (receipt.from_address) parts.push(`From: ${receipt.from_address}`);
  return parts.join(' | ');
}

// 🔧 ARCH fix (Round 12 M2): 删除无用 wrapper event_platform()

/**
 * 从 chat_message 构造可嵌入文本
 */
export function buildChatMessageText(message: {
  role: string;
  content: string;
}): string {
  return `[${message.role}]: ${message.content}`;
}

