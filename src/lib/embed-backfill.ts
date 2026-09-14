import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Embedding 回填 — RAG 懒加载机制
 *
 * 用户首次聊天时，检查是否已回填历史 embedding：
 * - 未回填：批量嵌入历史 impulse_events / email_receipts / chat_messages
 * - 已回填：跳过
 *
 * 新数据写入时（impulse_events/email_receipts/chat_messages insert 后）
 * 应同步嵌入 — 由各 API Route 调用 embedSingleRecord()
 *
 * 道经依据：道体二·共生（AI 记住用户的过去）+ 道用八·节用（懒加载，按需嵌入）
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { toJson } from '@/lib/json-helpers';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  buildImpulseEventText,
  buildReceiptText,
  buildChatMessageText,
} from '@/lib/embeddings';
import { logger } from '@/lib/logger';
import { fireAndForgetSafely } from '@/lib/admin-audit';

// ============================================================
// 类型
// ============================================================

export type SourceType = 'impulse_event' | 'email_receipt' | 'chat_message';

export interface BackfillResult {
  sourceType: SourceType;
  total: number;
  embedded: number;
  skipped: number; // 已存在的
  failed: number;
  tokensUsed: number;
  firstError?: string; // 第一个失败的错误信息（用于诊断）
}

// ============================================================
// 内部辅助
// ============================================================

/**
 * 插入单条 embedding（如果已存在则跳过）
 */
async function insertEmbedding(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
  content: string,
  metadata: Record<string, unknown>,
  embedding: number[],
): Promise<{ status: 'inserted' | 'exists' | 'failed'; error?: string }> {
  const { supabase } = createAdminClient();
  if (!supabase) return { status: 'failed', error: 'admin_client_unavailable' };

  const { error } = await supabase
    .from('user_embeddings')
    .insert({
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      content: content.length > 1000 ? content.slice(0, 1000) + '...' : content,
      metadata: toJson(metadata),
      embedding,
    });

  if (error) {
    // 23505 = unique_violation（已存在，跳过）
    if (error.code === '23505') return { status: 'exists' };
    const errMsg = `${error.code || 'unknown'}: ${error.message}`;
    logger.warn(`[Embed Backfill] Insert failed for ${sourceType}/${sourceId}: ${errMsg}`);
    return { status: 'failed', error: errMsg };
  }
  return { status: 'inserted' };
}

/**
 * 🔧 2026-07-15 (ARCH-4 #18 修复): 批量插入 embeddings
 *    旧代码: 逐条 insertEmbedding → 2000 次顺序 INSERT (60-100s per user)
 *    修复: 一次 .insert(rows[]) 批量插入, DB 一次事务完成
 *    23505 (UNIQUE violation) 在批量模式下会被整体拒绝, 所以用 onConflict DO NOTHING
 */
async function insertEmbeddingsBatch(
  rows: Array<{
    user_id: string;
    source_type: SourceType;
    source_id: string;
    content: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  }>,
): Promise<{ inserted: number; failed: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0, failed: 0 };

  const { supabase } = createAdminClient();
  if (!supabase) return { inserted: 0, failed: rows.length, error: 'admin_client_unavailable' };

  // 截断 content 到 1000 字符 (与单条版本一致)
  const preparedRows = rows.map(r => ({
    user_id: r.user_id,
    source_type: r.source_type,
    source_id: r.source_id,
    content: r.content.length > 1000 ? r.content.slice(0, 1000) + '...' : r.content,
    metadata: toJson(r.metadata),
    embedding: r.embedding,
  }));

  const { error } = await supabase
    .from('user_embeddings')
    .insert(preparedRows);

  if (error) {
    // 23505 = unique_violation — 部分行已存在, 退回到逐条插入
    if (error.code === '23505') {
      logger.info('[Embed Backfill] Batch insert had duplicates, falling back to per-row insert');
      let inserted = 0;
      let failed = 0;
      for (const row of preparedRows) {
        const { error: rowErr } = await supabase.from('user_embeddings').insert(row);
        if (rowErr) {
          if (rowErr.code === '23505') {
            // 已存在, 跳过
          } else {
            failed++;
          }
        } else {
          inserted++;
        }
      }
      return { inserted, failed };
    }
    const errMsg = `${error.code || 'unknown'}: ${error.message}`;
    logger.warn(`[Embed Backfill] Batch insert failed: ${errMsg}`);
    return { inserted: 0, failed: rows.length, error: errMsg };
  }
  return { inserted: rows.length, failed: 0 };
}

// ============================================================
// 批量回填（懒加载触发）
// ============================================================

/**
 * 回填用户的 impulse_events 历史 embedding
 */
export async function backfillImpulseEvents(userId: string, limit: number = 500): Promise<BackfillResult> {
  const result: BackfillResult = {
    sourceType: 'impulse_event',
    total: 0,
    embedded: 0,
    skipped: 0,
    failed: 0,
    tokensUsed: 0,
  };

  const { supabase } = createAdminClient();
  if (!supabase) {
    logger.warn('[Embed Backfill] Admin client unavailable');
    return result;
  }

  // 1. 查询用户的 impulse_events（按时间倒序，最多 limit 条）
  const { data: events, error } = await supabase
    .from('impulse_events')
    .select('id, platform, title, amount, category, raw_text, reasons, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn(`[Embed Backfill] Query impulse_events failed: ${error.message}`);
    return result;
  }

  const eventList = (events || []) as Array<Record<string, unknown>>;
  result.total = eventList.length;

  if (eventList.length === 0) return result;

  // 2. 批量生成 embedding
  const texts = eventList.map(e => buildImpulseEventText({
    platform: e.platform as string | undefined,
    title: e.title as string | undefined,
    amount: e.amount as number | undefined,
    category: e.category as string | undefined,
    raw_text: e.raw_text as string | undefined,
    reasons: e.reasons as string[] | undefined,
  }));

  let embeddings: Array<{ embedding: number[]; tokens: number }>;
  try {
    embeddings = await generateEmbeddingsBatch(texts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Embed Backfill] Batch embedding failed: ${msg}`);
    result.failed = eventList.length;
    result.firstError = `batch_embedding_failed: ${msg.substring(0, 150)}`;
    return result;
  }

  // 3. 批量插入 (🔧 2026-07-15 ARCH-4 #18: was 逐条, now batch)
  const batchRows = eventList.map((event, i) => ({
    user_id: userId,
    source_type: 'impulse_event' as SourceType,
    source_id: event.id as string,
    content: texts[i],
    metadata: {
      platform: event.platform,
      title: event.title,
      amount: event.amount,
      category: event.category,
      created_at: event.created_at,
    },
    embedding: embeddings[i].embedding,
  }));

  const batchResult = await insertEmbeddingsBatch(batchRows);
  result.embedded += batchResult.inserted;
  result.failed += batchResult.failed;
  result.skipped += eventList.length - batchResult.inserted - batchResult.failed;
  result.tokensUsed += embeddings.reduce((sum, e) => sum + e.tokens, 0);
  if (!result.firstError && batchResult.error) {
    result.firstError = batchResult.error;
  }

  return result;
}

/**
 * 回填用户的 email_receipts 历史 embedding
 */
export async function backfillEmailReceipts(userId: string, limit: number = 500): Promise<BackfillResult> {
  const result: BackfillResult = {
    sourceType: 'email_receipt',
    total: 0,
    embedded: 0,
    skipped: 0,
    failed: 0,
    tokensUsed: 0,
  };

  const { supabase } = createAdminClient();
  if (!supabase) return result;

  const { data: receipts, error } = await supabase
    .from('email_receipts')
    .select('id, platform, item_name, amount, subject, snippet, from_address, received_at')
    .eq('user_id', userId)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    logger.warn(`[Embed Backfill] Query email_receipts failed: ${error.message}`);
    return result;
  }

  const receiptList = (receipts || []) as Array<Record<string, unknown>>;
  result.total = receiptList.length;

  if (receiptList.length === 0) return result;

  const texts = receiptList.map(r => buildReceiptText({
    platform: r.platform as string | undefined,
    item_name: r.item_name as string | undefined,
    amount: r.amount as number | undefined,
    subject: r.subject as string | undefined,
    snippet: r.snippet as string | undefined,
    from_address: r.from_address as string | undefined,
  }));

  let embeddings: Array<{ embedding: number[]; tokens: number }>;
  try {
    embeddings = await generateEmbeddingsBatch(texts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Embed Backfill] Batch embedding failed: ${msg}`);
    result.failed = receiptList.length;
    result.firstError = `batch_embedding_failed: ${msg.substring(0, 150)}`;
    return result;
  }

  for (let i = 0; i < receiptList.length; i++) {
    const receipt = receiptList[i];
    const insertResult = await insertEmbedding(
      userId,
      'email_receipt',
      receipt.id as string,
      texts[i],
      {
        platform: receipt.platform,
        item_name: receipt.item_name,
        amount: receipt.amount,
        received_at: receipt.received_at,
      },
      embeddings[i].embedding,
    );

    if (insertResult.status === 'inserted') {
      result.embedded++;
      result.tokensUsed += embeddings[i].tokens;
    } else if (insertResult.status === 'exists') {
      result.skipped++;
    } else {
      result.failed++;
      if (!result.firstError && insertResult.error) {
        result.firstError = insertResult.error;
      }
    }
  }

  return result;
}

/**
 * 回填用户的 chat_messages 历史 embedding
 */
export async function backfillChatMessages(userId: string, limit: number = 1000): Promise<BackfillResult> {
  const result: BackfillResult = {
    sourceType: 'chat_message',
    total: 0,
    embedded: 0,
    skipped: 0,
    failed: 0,
    tokensUsed: 0,
  };

  const { supabase } = createAdminClient();
  if (!supabase) return result;

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn(`[Embed Backfill] Query chat_messages failed: ${error.message}`);
    return result;
  }

  const messageList = (messages || []) as Array<Record<string, unknown>>;
  result.total = messageList.length;

  if (messageList.length === 0) return result;

  const texts = messageList.map(m => buildChatMessageText({
    role: m.role as string,
    content: m.content as string,
  }));

  let embeddings: Array<{ embedding: number[]; tokens: number }>;
  try {
    embeddings = await generateEmbeddingsBatch(texts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Embed Backfill] Batch embedding failed: ${msg}`);
    result.failed = messageList.length;
    result.firstError = `batch_embedding_failed: ${msg.substring(0, 150)}`;
    return result;
  }

  for (let i = 0; i < messageList.length; i++) {
    const msg = messageList[i];
    const insertResult = await insertEmbedding(
      userId,
      'chat_message',
      msg.id as string,
      texts[i],
      {
        role: msg.role,
        created_at: msg.created_at,
      },
      embeddings[i].embedding,
    );

    if (insertResult.status === 'inserted') {
      result.embedded++;
      result.tokensUsed += embeddings[i].tokens;
    } else if (insertResult.status === 'exists') {
      result.skipped++;
    } else {
      result.failed++;
      if (!result.firstError && insertResult.error) {
        result.firstError = insertResult.error;
      }
    }
  }

  return result;
}

// ============================================================
// 单条嵌入（新数据写入时调用）
// ============================================================

/**
 * 嵌入单条记录（新数据写入时同步调用）
 * 永不抛错 — 失败仅记日志（不阻塞主流程）
 *
 * @returns true=成功插入, false=失败/已存在
 */
export async function embedSingleRecord(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    if (!content || content.trim().length === 0) return false;

    const { embedding } = await generateEmbedding(content);
    const result = await insertEmbedding(userId, sourceType, sourceId, content, metadata, embedding);
    return result.status === 'inserted';
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Embed Backfill] Single embed failed for ${sourceType}/${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================================
// 懒加载触发器
// ============================================================

/**
 * 检查并触发懒加载回填
 *
 * 用户首次聊天时调用：如果 user_embeddings 中该用户的记录数 < 阈值，
 * 则后台异步回填历史数据。
 *
 * 永不阻塞主流程 — 回填异步执行，失败仅记日志
 *
 * @param userId 用户 ID
 * @param triggerThreshold 触发阈值（默认 5 条以下即触发回填）
 */
export async function triggerLazyBackfillIfNeeded(
  userId: string,
  triggerThreshold: number = 5,
): Promise<void> {
  try {
    const { supabase } = createAdminClient();
    if (!supabase) return;

    // 🔧 ARCH fix (Round 22 BUG-R22-H2 — 无分布式锁 → 并发 chat 触发 2x embedding API 调用):
    //    旧代码: 两个并发 chat 都 SELECT count → 都看到 count < 5 → 都触发 backfill
    //    → 2x embedding API 调用 (~$0.01-0.50/次, 取决于历史数据量)。
    //    insertEmbedding 有 UNIQUE 约束防重复 INSERT, 但 embedding API 调用已花费。
    //    根因修复: acquireLock (fail-open, 不阻塞 chat), 已有 backfill 在跑时跳过。
    //    锁 TTL 180s (backfill 最多 ~120s + 余量), backfill 完成后 releaseLock。
    const { acquireLock, releaseLock } = await import('@/lib/distributed-lock');
    const lockKey = `embed-backfill:${userId}`;
    const locked = await acquireLock(lockKey, 180_000, false); // fail-open (锁不可用不阻塞 chat)
    if (!locked) {
      // 已有 backfill 在跑, 跳过 (避免 2x API 调用)
      logger.info(`[Embed Backfill] Backfill already in progress for user ${userId.substring(0, 8)}, skipping`);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('user_embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        logger.warn(`[Embed Backfill] Count check failed: ${error.message}`);
        return;
      }

      if ((count || 0) >= triggerThreshold) {
        // 已有足够 embedding，不需要回填
        return;
      }

      logger.info(`[Embed Backfill] Triggering lazy backfill for user ${userId.substring(0, 8)} (current count: ${count || 0})`);

      // 🔧 ARCH fix (Round 12 H4): 旧代码 fire-and-forget → Vercel 杀函数 → 部分回填后中断
      //    → count > threshold → 永远不再重试 → RAG 永久降级。
      //    根因修复: 用 waitUntil (Vercel) 延长函数生命周期; fallback 到 fire-and-forget。
      const backfillPromise = Promise.allSettled([
        backfillImpulseEvents(userId),
        backfillEmailReceipts(userId),
        backfillChatMessages(userId),
      ]).then(results => {
        const summary = results.map((r, idx) => {
          const sourceTypes: SourceType[] = ['impulse_event', 'email_receipt', 'chat_message'];
          if (r.status === 'fulfilled') {
            return `${sourceTypes[idx]}: ${r.value.embedded} embedded, ${r.value.skipped} skipped, ${r.value.failed} failed`;
          }
          return `${sourceTypes[idx]}: rejected`;
        });
        logger.info(`[Embed Backfill] Lazy backfill done for user ${userId.substring(0, 8)}: ${summary.join(' | ')}`);
      }).catch(err => {
        logger.warn(`[Embed Backfill] Lazy backfill unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }).finally(() => {
        // 🔧 Round 22 H2: backfill 完成 (无论成功失败) 后释放锁, 让下次触发能立即重试
        // 🔧 Round 106 Rule 9: Was .catch(() => {}) — silently swallowed lock release failures.
        releaseLock(lockKey).catch((e: unknown) => {
          logger.warn('[Embed Backfill] Failed to release lock (non-blocking):', e instanceof Error ? e.message : String(e));
        });
      });

      // 尝试用 Vercel waitUntil 延长函数生命周期
      // 🔧 ARCH fix (Round 5 AUDIT-1 M-2): 用共享 fireAndForgetSafely 替代重复的 waitUntil 模式
      fireAndForgetSafely(backfillPromise);
    } catch (innerErr) {
      // 内部错误也要释放锁
      // 🔧 Round 106 Rule 9: Was .catch(() => {}) — silently swallowed lock release failures.
      await releaseLock(lockKey).catch((e: unknown) => {
        logger.warn('[Embed Backfill] Failed to release lock on error (non-blocking):', e instanceof Error ? e.message : String(e));
      });
      throw innerErr;
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Embed Backfill] Trigger check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
