import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * RAG 检索 — 道体二·共生 + 道用六·公开
 *
 * 用户发送聊天消息时：
 * 1. 生成 query embedding
 * 2. 在 Supabase pgvector 中检索用户自己的 top-K 相关记录
 * 3. 返回相关上下文，注入到 system prompt
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { generateEmbedding, type EmbeddingResult } from '@/lib/embeddings';
import { logger } from '@/lib/logger';
import type { Json } from '@/lib/database.types';

// ============================================================
// 类型
// ============================================================

export interface RetrievedContext {
  sourceType: 'impulse_event' | 'email_receipt' | 'chat_message';
  content: string;
  metadata: Record<string, unknown>;
  similarity: number; // 0-1
}

export interface RagResult {
  contexts: RetrievedContext[];
  queryEmbeddingTokens: number;
  skipped: boolean;
  skipReason?: string;
}

// ============================================================
// 主接口
// ============================================================

/**
 * 检索用户的相关上下文
 *
 * @param userId 用户 ID
 * @param query 用户查询文本
 * @param topK 返回的 top-K 条数（默认 5）
 * @param sourceTypes 可选：限定来源类型
 * @returns RagResult，包含 contexts + tokens 用量；失败时 skipped=true
 *
 * 永不抛错 — 失败时返回 skipped=true，调用方可继续无 RAG 流程
 */
export async function retrieveUserContext(
  userId: string,
  query: string,
  topK: number = 5,
  sourceTypes?: Array<'impulse_event' | 'email_receipt' | 'chat_message'>,
): Promise<RagResult> {
  try {
    // 1. 生成 query embedding
    let queryEmbedding: EmbeddingResult;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[RAG] Query embedding failed: ${msg}`);
      return {
        contexts: [],
        queryEmbeddingTokens: 0,
        skipped: true,
        skipReason: `embedding_failed: ${msg.substring(0, 100)}`,
      };
    }

    // 2. 调用 retrieve_user_context RPC
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.warn('[RAG] Admin client unavailable');
      return {
        contexts: [],
        queryEmbeddingTokens: queryEmbedding.tokens,
        skipped: true,
        skipReason: 'admin_client_unavailable',
      };
    }

    const { data: rawResults, error: rpcError } = await supabase.rpc(
      'retrieve_user_context',
      {
        p_user_id: userId,
        p_query_embedding: queryEmbedding.embedding,
        p_top_k: topK,
        p_source_types: sourceTypes || null,
      }
    );

    if (rpcError) {
      logger.warn(`[RAG] RPC failed: ${rpcError.message}`);
      return {
        contexts: [],
        queryEmbeddingTokens: queryEmbedding.tokens,
        skipped: true,
        skipReason: `rpc_failed: ${rpcError.message.substring(0, 100)}`,
      };
    }

    const results = Array.isArray(rawResults) ? rawResults : [];

    // 🔧 ARCH fix (Round 49 R49-A-4): retrieve_user_context Returns Json (not unknown),
    //    results.map 的 r 现在是 Json 类型, 需要 cast 到 Record<string, unknown>
    const contexts: RetrievedContext[] = results.map((r: Json) => {
      const row = r as Record<string, unknown>;
      return {
        sourceType: row.source_type as RetrievedContext['sourceType'],
        content: row.content as string,
        metadata: (row.metadata as Record<string, unknown>) || {},
        similarity: typeof row.similarity === 'number' ? row.similarity : 0,
      };
    });

    return {
      contexts,
      queryEmbeddingTokens: queryEmbedding.tokens,
      skipped: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[RAG] Unexpected error: ${msg}`);
    return {
      contexts: [],
      queryEmbeddingTokens: 0,
      skipped: true,
      skipReason: `unexpected: ${msg.substring(0, 100)}`,
    };
  }
}

/**
 * 将检索到的上下文格式化为 system prompt 段落
 *
 * 格式：
 * ```
 * <user_history>
 * Based on your past, here's what I remember about you:
 *
 * [1] Impulse event (2025-10-12, similarity: 0.85):
 *     Platform: TikTok Shop | Title: Wireless Earbuds | Amount: $45 | ...
 *
 * [2] Chat message (2025-10-15, similarity: 0.78):
 *     [user]: I'm thinking about buying new earbuds
 *
 * Use this context to give personalized advice. Do NOT mention these memories directly.
 * </user_history>
 * ```
 */
export function formatContextForPrompt(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return '';

  const lines: string[] = ['<user_history>', 'Based on your past, here is what I remember about you:', ''];

  contexts.forEach((ctx, idx) => {
    // 🔧 ARCH fix (Round 22 BUG-R22-M2 — email_receipt 用 received_at 而非 created_at):
    //    embed-backfill.ts 的 email_receipt metadata 用 received_at (邮件接收时间),
    //    impulse_events/chat_messages 用 created_at (DB 插入时间)。
    //    旧代码只读 created_at → email_receipt context 显示 "unknown date"。
    //    根因修复: fallback 读 received_at。
    const dateStr = (ctx.metadata.created_at || ctx.metadata.received_at) as string | undefined;
    const date = dateStr
      ? new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'unknown date';
    const sim = (ctx.similarity * 100).toFixed(0);
    lines.push(`[${idx + 1}] ${ctx.sourceType.replace('_', ' ')} (${date}, relevance: ${sim}%):`);
    lines.push(`    ${ctx.content}`);
    lines.push('');
  });

  lines.push('Use this context to give personalized advice. Do NOT mention these memories directly to the user.');
  lines.push('</user_history>');

  return lines.join('\n');
}

/**
 * 检查用户是否已回填历史 embedding（用于懒加载触发判断）
 *
 * 🔧 ARCH fix (Round 12 M4): 旧代码返回 -1 表示失败 → 调用方 `if (count < threshold)` 把 -1 当作需要 backfill
 *    根因修复: 返回 null, 调用方必须显式处理 null
 *
 * @returns 已回填的记录数；null 表示查询失败
 */
export async function getUserEmbeddingCount(userId: string): Promise<number | null> {
  try {
    const { supabase, error } = createAdminClient();
    if (!supabase || error) return null;

    const { count, error: countError } = await supabase
      .from('user_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) return null;
    return count || 0;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return null;  // 🔧 Round 12 M4: null 而非 -1
  }
}
