/**
 * 渠道 webhook 入口 — 设计 §2.3 快路径（social-channel-adapter.md）
 *
 * 平台身份由 URL 决定（动态段 [platform] → 适配器注册表）。
 * 快路径序：注册表查平台 → CHANNELS_ENABLED 门 → 验签 → 解析 →
 *   update_id 去重(24h) → 洪水限流(20/min) → 同用户回合锁(90s TTL, 锁忙丢弃+轻提示)
 *   → 恒 200 ack → waitUntil 后台回合（欢迎语先行 → runChannelTurn → sendMessage）。
 *
 * 铁律（§2.3）：签名通过之后，无论内部发生什么（LLM 炸、DB 炸、发送失败）
 * 都返回 200 — 否则 Telegram 以退避节奏重试数小时造成重复回复。错误一律带内。
 *
 * 闸门与键（§8）：
 * - 重放:   acquireLock(`channel:upd:${platform}:${dedupId}`, 24h) — 已见 → 200 静默丢
 * - 洪水:   checkRateLimit(`channel:flood:${platform}:${platformUserId}`, 20, 60_000)
 * - 回合锁: acquireLock(`channel:turn:${platform}:${platformUserId}`, 90_000, failClosed=true)
 *   锁 key 用 platform identity（不是 userId）— 首条消息此刻还没有 userId，锁必须在身份解析之前。
 */
import { NextResponse } from 'next/server';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { checkRateLimit, acquireLock, releaseLock } from '@/lib/distributed-lock';
import { logger } from '@/lib/logger';
import { channelsEnabled } from '@/lib/channels/config';
import { getAdapter } from '@/lib/channels/registry';
import '@/lib/channels/telegram/adapter'; // 注册表侧效应 — telegram 适配器挂载
import { localeFromLanguageHint, resolveOrCreateBinding } from '@/lib/channels/identity';
import { runChannelTurn } from '@/lib/channel-chat/run-channel-turn';
import type { ChannelAdapter, InboundMessage } from '@/lib/channels/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** 快路径轻提示（双语）— 与 CHANNEL_TURN_TEXTS 同风格：正式系统语言 */
const LIGHT_TEXTS = {
  zh: {
    flood: '消息发得太快了，休息一下再发。',
    busy: '上一条还在回答中，稍等一下。',
    welcome: '欢迎！我是 Symy，你的购物参谋——替你买，也替你挡。直接把想买的东西发给我就行。',
  },
  en: {
    flood: "You're sending messages too fast — take a short break.",
    busy: 'Your previous message is still being answered. One moment.',
    welcome: 'Welcome! I am Symy, your shopping companion — I help you buy, and help you hold back. Just send me anything you are thinking of buying.',
  },
} as const;

interface RouteContext {
  params: Promise<{ platform: string }>;
}

/** 尽力发送轻提示 — 发送失败只记日志（恒 200 语义下这是全部能做的） */
function trySendLight(adapter: ChannelAdapter, chatRef: string, text: string, locale: 'zh' | 'en'): void {
  fireAndForgetSafely(
    adapter.sendMessage(chatRef, text, { locale }).catch((err: unknown) => {
      // safe to ignore: 轻提示 best-effort, 失败仅日志 (恒 200 铁律下无带外出口)
      logger.warn('[Channel] light_notice_send_failed', err instanceof Error ? err.message : String(err));
    }),
  );
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
  const { platform } = await context.params;

  // ① 注册表查平台 → 未知 404（fail-closed, §11）
  const adapter = getAdapter(platform);
  if (!adapter) {
    logger.warn('[Channel] unknown_platform platform=%s', platform);
    return NextResponse.json({ error: 'Unknown channel platform' }, { status: 404 });
  }

  // ② CHANNELS_ENABLED 门 — 未启用 503（默认关, fail-closed）
  if (!channelsEnabled(adapter.platform)) {
    logger.warn('[Channel] not_enabled platform=%s', platform);
    return NextResponse.json({ error: 'Channel not enabled' }, { status: 503 });
  }

  // ③ 验签在解析之前；rawBody 只读一次传两处（§11）
  const rawBody = await req.text();
  const verifyResult = await adapter.verify(req as unknown as Parameters<ChannelAdapter['verify']>[0], rawBody);
  if (!verifyResult.ok) {
    // 401 不带任何内部信息（§11）；sig_fail 已在 verify 内记日志
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ④ 解析 — 外部报文 zod loose; 空结果 = edited_message/群聊/非文本 → 200 静默丢
  const messages = await adapter.parse(req as unknown as Parameters<ChannelAdapter['parse']>[0], rawBody);
  if (messages.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const msg: InboundMessage = messages[0]; // Telegram 单 update 单消息

  // ⑤ update_id 去重 (24h TTL) — 重放纵深防线
  const dedupAcquired = await acquireLock(`channel:upd:${platform}:${msg.dedupId}`, 24 * 60 * 60 * 1000);
  if (!dedupAcquired) {
    logger.debug('[Channel] replay_dropped platform=%s dedup=%s', platform, msg.dedupId);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ⑥ 洪水限流 (20/min per platform-user) — 超限 200 + 尽力轻提示
  const flood = await checkRateLimit(`channel:flood:${platform}:${msg.platformUserId}`, 20, 60_000);
  if (!flood.allowed) {
    logger.warn('[Channel] flood_limited platform=%s user=%s', platform, msg.platformUserId);
    trySendLight(adapter, msg.chatRef, LIGHT_TEXTS[localeFromLanguageHint(msg.languageHint)].flood, localeFromLanguageHint(msg.languageHint));
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ⑦ 同用户回合锁 (90s TTL > maxDuration 60s, failClosed) — 锁忙 = 有在途回合 → 丢弃+轻提示
  const turnLockKey = `channel:turn:${platform}:${msg.platformUserId}`;
  const turnAcquired = await acquireLock(turnLockKey, 90_000, true);
  if (!turnAcquired) {
    logger.warn('[Channel] busy_dropped platform=%s user=%s', platform, msg.platformUserId);
    trySendLight(adapter, msg.chatRef, LIGHT_TEXTS[localeFromLanguageHint(msg.languageHint)].busy, localeFromLanguageHint(msg.languageHint));
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ⑧ 恒 200 ack → 后台回合派发 (锁在 processTurn finally 释放)
  fireAndForgetSafely(processTurn(adapter, msg, turnLockKey));
  return NextResponse.json({ ok: true }, { status: 200 });
}

/** 后台回合：身份解析 → (欢迎语) → typing → runChannelTurn → sendMessage → finally 释放锁 */
async function processTurn(adapter: ChannelAdapter, msg: InboundMessage, turnLockKey: string): Promise<void> {
  const startedAt = Date.now();
  try {
    // 身份解析（影子账号按需建立）— 在 ack 之后的后台段
    const binding = await resolveOrCreateBinding(msg);
    if (!binding) {
      logger.error('[Channel] turn_error outcome=bind_failed platform=%s user=%s', msg.platform, msg.platformUserId);
      return;
    }

    // 首次绑定 → 欢迎语先行（轻提示级，不阻塞也不替代回合回复）
    if (binding.created) {
      const welcomeResult = await adapter.sendMessage(binding.chatRef, LIGHT_TEXTS[binding.locale].welcome, { locale: binding.locale });
      if (!welcomeResult.ok) {
        logger.warn('[Channel] welcome_send_failed platform=%s', msg.platform);
      }
    }

    // typing 指示 best-effort（§5.1 — 单条终稿模式的观感补偿）
    if (adapter.sendTyping) {
      try {
        await adapter.sendTyping(binding.chatRef);
      } catch {
        // safe to ignore: typing 是体验增强, 失败不影响回合
      }
    }

    const result = await runChannelTurn({ userId: binding.userId, locale: binding.locale, text: msg.text });

    if (result.replyText) {
      const sendResult = await adapter.sendMessage(binding.chatRef, result.replyText, { locale: binding.locale });
      if (!sendResult.ok) {
        // send_fail 在 client 层已记 error → Sentry; 此处归一 turn_error 观测
        logger.error('[Channel] turn_error outcome=send_failed platform=%s', msg.platform);
        return;
      }
    } else {
      // 无 replyText 的 outcome (agent_unavailable 等) 也该有文案 — 防御性兜底
      logger.warn('[Channel] turn_no_reply outcome=%s platform=%s', result.outcome, msg.platform);
    }

    logger.info(
      '[Channel] turn_complete platform=%s outcome=%s latency_ms=%d',
      msg.platform,
      result.outcome,
      Date.now() - startedAt,
    );
  } catch (err) {
    // safe to ignore: 后台回合异常带内处理 + turn_error 已记 (恒 200 铁律下无带外出口)
    logger.error('[Channel] turn_error outcome=exception platform=%s', msg.platform, err);
  } finally {
    await releaseLock(turnLockKey);
  }
}

export async function GET(_req: Request, context: RouteContext): Promise<Response> {
  const { platform } = await context.params;
  // telegram → 405（Telegram 从不 GET；wechat_mp 的 echostr 流是 P2）
  if (!getAdapter(platform)) {
    return NextResponse.json({ error: 'Unknown channel platform' }, { status: 404 });
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
