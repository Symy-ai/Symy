/**
 * Telegram webhook 报文解析 — 外部契约 zod loose（设计 §2.3 zod 策略）
 *
 * 只消费强类型字段，未知字段容忍（Telegram 加字段不炸）。
 * 解析失败 → 空数组（上层 200 静默丢 — 不是我们的用户输入，不回错误提示）。
 * MVP 只处理 private 文本消息；edited_message / channel_post / 非 private → 空。
 */
import { z } from 'zod';
import type { InboundMessage } from '../types';

const tgUser = z
  .object({
    id: z.union([z.number(), z.string()]),
    language_code: z.string().optional(),
  })
  .loose();

const tgChat = z
  .object({
    id: z.union([z.number(), z.string()]),
    type: z.string(),
  })
  .loose();

const tgMessage = z
  .object({
    message_id: z.union([z.number(), z.string()]),
    from: tgUser,
    chat: tgChat,
    date: z.number(),
    text: z.string().optional(),
  })
  .loose();

const tgUpdate = z
  .object({
    update_id: z.union([z.number(), z.string()]),
    message: tgMessage.optional(),
  })
  .loose();

export function parseTelegramWebhook(_req: { headers: Headers }, rawBody: string): InboundMessage[] {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    // safe to ignore: 非法 JSON 按「无可消费消息」处理返回空数组 — 外部报文静默丢 (设计 §2.3 zod 策略)
    return [];
  }
  const parsed = tgUpdate.safeParse(json);
  if (!parsed.success) return [];

  const { update_id, message } = parsed.data;
  if (!message) return []; // edited_message / channel_post 等静默丢
  if (message.chat.type !== 'private') return []; // MVP 只私聊
  if (!message.text || message.text.trim().length === 0) return []; // 图片/贴纸等 unsupported

  const platformUserId = String(message.from.id);
  const text = message.text.trim();
  return [
    {
      platform: 'telegram',
      platformUserId,
      chatRef: String(message.chat.id),
      text,
      dedupId: String(update_id),
      languageHint: message.from.language_code,
      ...(text === '/start'
        ? { kind: 'command_start' as const }
        : /^\/start ([A-Z0-9]{8})$/.test(text)
          ? { kind: 'command_start_payload' as const, startPayload: text.slice(7) }
          : { kind: 'text' as const }),
    },
  ];
}
