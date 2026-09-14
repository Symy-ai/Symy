/**
 * green-alt-retro-persist — 复盘回答落账 (batch68-a, best-effort 零阻塞)
 *
 * 用户回答复盘 (选项或自由文本) 后, 服务端把证据写入既有 health_events
 * manual_adjustment 纯审计通道 (零 DDL): 列形状与 adoption route 同款
 * (vitality_change 0 / new_vitality 记当前值只为行形状完整), trigger_id 含
 * UTC 日期键由 DB 唯一索引兜底同日双写。fire-and-forget 语义: 任何失败
 * 只 warn, 绝不影响聊天响应。
 */

import { logger } from '@/lib/logger';
import { buildGreenAltRetroEventPayload, type GreenAltRetroReason } from '@/lib/green-alt-retro';

/** 结构面收窄 (supabase-js 运行时满足的最小读写面, stub 测试验证契约) */
export interface GreenAltRetroPersistStore {
  from: {
    (table: 'health_events'): {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    (table: 'buddy_state'): {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: { vitality: number } | null }>;
        };
      };
    };
  };
}

export interface RecordGreenAltRetroInput {
  userId: string;
  store: GreenAltRetroPersistStore;
  entryId: string;
  reason: GreenAltRetroReason;
  /** 自由文本原话 (仅 freeform; 内部净化截断) */
  note?: string;
  now?: Date;
}

/**
 * 记录一次复盘回答。载荷非法 (未知词条/未知原因) 静默跳过;
 * 查询/插入失败只 warn — 调用方 fire-and-forget, 不 await 进响应关键路径。
 */
export async function recordGreenAltRetroEvent(input: RecordGreenAltRetroInput): Promise<void> {
  const { userId, store, entryId, reason, note } = input;
  const payload = buildGreenAltRetroEventPayload({ entryId, reason, note, now: input.now });
  if (!payload) return;
  try {
    // 行形状与 adoption route 同款: new_vitality 记当前值, 纯审计零 vitality 副作用
    let currentVitality = 0;
    try {
      const { data: bs } = await store.from('buddy_state').select('vitality').eq('user_id', userId).maybeSingle();
      currentVitality = bs?.vitality ?? 0;
    } catch {
      // safe to ignore: 行形状完整性兜底, 取不到就用 0
    }
    const { error } = await store.from('health_events').insert({
      user_id: userId,
      event_type: payload.eventType,
      vitality_change: 0,
      new_vitality: currentVitality,
      token_change: 0,
      trigger_source: payload.triggerSource,
      trigger_id: payload.triggerId,
      description: payload.description,
      metadata: payload.metadata,
    });
    if (error) {
      logger.warn('[GreenAltRetro] insert failed:', error.message);
    }
  } catch (err) {
    // safe to ignore: 复盘落账是非关键路径, 失败不影响聊天
    logger.warn('[GreenAltRetro] record failed:', err instanceof Error ? err.message : String(err));
  }
}
