/**
 * 渠道身份解析 — 影子账号（设计 §4 方案 B）
 *
 * 职责：platform identity (platform, platformUserId) → Supabase user_id。
 * - binding 命中 → 复用 user_id（同键幂等），best-effort 刷新 last_seen_at。
 * - miss → auth.admin.createUser（确定性邮箱 `tg-<id>@channels.symy.internal` =
 *   天然幂等键，email_confirm:true 免邮件回路）→ insert binding → getOrCreateAgentId 预建。
 * - 并发竞态：两实例同 platform 身份同时 miss → 都建号 → insert 撞 UNIQUE
 *   (platform, platform_user_id) 23505 → 复读胜者行，绝不覆写他人 user_id。
 *
 * 读写走 createAdminClient()（service role 绕 RLS — webhook 侧无用户会话）。
 */
import { logger } from '@/lib/logger';
import { getOrCreateAgentId } from '@/lib/letta-agent-manager';
import { createAdminClient } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundMessage } from './types';

/**
 * migration 153 的最小表形状。database.types.ts 属自动生成文件（表随 owner 部署
 * 迁移后由 regen 收编，CI db-types-check 对账），在此之前边界处一次性收窄 —
 * route.ts factsStore `as unknown as` 先例。
 */
interface ChannelBindingsDatabase {
  public: {
    Tables: {
      channel_bindings: {
        Row: {
          user_id: string;
          platform: string;
          platform_user_id: string;
          platform_username: string | null;
          chat_ref: string;
          locale: 'zh' | 'en';
          linked_at: string;
          last_seen_at: string;
        };
        Insert: {
          user_id: string;
          platform: string;
          platform_user_id: string;
          platform_username?: string | null;
          chat_ref: string;
          locale?: 'zh' | 'en';
        };
        Update: { last_seen_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type ChannelAdminClient = SupabaseClient<ChannelBindingsDatabase>;

export interface ResolvedBinding {
  userId: string;
  locale: 'zh' | 'en';
  chatRef: string;
  /** true = 本次新建影子账号（欢迎语判定用） */
  created: boolean;
}

/** §4.3: TG from.language_code → locale；zh* 映射 zh，其余 en；无提示默认 zh */
export function localeFromLanguageHint(hint: string | undefined): 'zh' | 'en' {
  if (!hint) return 'zh';
  return hint.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 确定性影子邮箱 — platform 前缀短码 + sanitize 后的 platform_user_id */
export function shadowAccountEmail(platform: InboundMessage['platform'], platformUserId: string): string {
  const prefix = platform === 'telegram' ? 'tg' : platform === 'wechat_mp' ? 'wxmp' : 'wxwork';
  const safeId = platformUserId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${prefix}-${safeId}@channels.symy.internal`;
}

export async function resolveOrCreateBinding(msg: InboundMessage): Promise<ResolvedBinding | null> {
  const { supabase } = createAdminClient();
  if (!supabase) {
    logger.warn('[Channel] bind_skip admin client unavailable');
    return null;
  }
  const admin = supabase as unknown as ChannelAdminClient;

  // 1. 查 binding — (platform, platform_user_id) 唯一键
  const { data: existing, error: selectError } = await admin
    .from('channel_bindings')
    .select('user_id, locale, chat_ref')
    .eq('platform', msg.platform)
    .eq('platform_user_id', msg.platformUserId)
    .maybeSingle();

  if (selectError) {
    logger.warn('[Channel] bind_select_error', selectError.message);
    return null;
  }

  if (existing) {
    // 命中 → 幂等复用；last_seen 刷新 best-effort（失败不影响回合）
    try {
      await admin
        .from('channel_bindings')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('platform', msg.platform)
        .eq('platform_user_id', msg.platformUserId);
    } catch (err) {
      // safe to ignore: last_seen 刷新是非关键后台写，失败不影响身份解析
      logger.debug('[Channel] last_seen refresh failed', err);
    }
    return {
      userId: existing.user_id,
      locale: existing.locale,
      chatRef: existing.chat_ref || msg.chatRef,
      created: false,
    };
  }

  // 2. miss → 影子账号（确定性邮箱 = createUser 幂等键）
  const email = shadowAccountEmail(msg.platform, msg.platformUserId);
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { channel: msg.platform, platform_user_id: msg.platformUserId },
  });
  if (createError || !created?.user?.id) {
    logger.warn('[Channel] shadow_user_create_error', createError?.message ?? 'no user id returned');
    return null;
  }
  const userId = created.user.id;

  // 3. 插 binding；并发同身份撞 UNIQUE → 复读胜者行
  const { data: inserted, error: insertError } = await admin
    .from('channel_bindings')
    .insert({
      user_id: userId,
      platform: msg.platform,
      platform_user_id: msg.platformUserId,
      platform_username: null,
      chat_ref: msg.chatRef,
      locale: localeFromLanguageHint(msg.languageHint),
    })
    .select('user_id, locale, chat_ref')
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      // 并发他方已绑 — 读回胜者行，绝不覆写
      const { data: winner, error: rereadError } = await admin
        .from('channel_bindings')
        .select('user_id, locale, chat_ref')
        .eq('platform', msg.platform)
        .eq('platform_user_id', msg.platformUserId)
        .maybeSingle();
      if (!rereadError && winner) {
        // 胜者 agent 幂等预建（getOrCreate 语义安全）
        void getOrCreateAgentId(winner.user_id).catch(() => {
          // safe to ignore: agent 预建失败由回合侧 agent_unavailable 兜底
        });
        return { userId: winner.user_id, locale: winner.locale, chatRef: winner.chat_ref || msg.chatRef, created: false };
      }
      logger.error('[Channel] bind_conflict_reread_failed', rereadError?.message ?? 'winner row missing');
      return null;
    }
    logger.warn('[Channel] bind_insert_error', insertError.message);
    return null;
  }

  const row = inserted;
  // 4. 预建 agent — 失败不 fatal（回合侧 getUserAgentId null → agent_unavailable 文案兜底）
  const agentId = await getOrCreateAgentId(userId);
  if (!agentId) {
    logger.warn('[Channel] agent_precreate_failed — turn will surface agent_unavailable', userId.substring(0, 8));
  }
  logger.info('[Channel] bind_created platform=%s user=%s', msg.platform, userId.substring(0, 8));
  return { userId: row.user_id, locale: row.locale, chatRef: row.chat_ref || msg.chatRef, created: true };
}
