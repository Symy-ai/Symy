/**
 * Telegram 适配器 — 组装 verify / parse / sendMessage / sendTyping 到
 * ChannelAdapter 形状（设计 §3）。平台知识 100% 收敛在本目录。
 *
 * 注册表查询：`import '@/lib/channels/telegram/adapter'` 触发注册（模块侧效应）。
 */
import type { ChannelAdapter } from '../types';
import { registerAdapter } from '../registry';
import { verifyTelegramWebhook } from './verify';
import { parseTelegramWebhook } from './parse';
import { sendTelegramChatAction, sendTelegramMessage } from './client';

export const telegramAdapter: ChannelAdapter = {
  platform: 'telegram',
  capabilities: { asyncPush: true },
  verify: (req, rawBody) => Promise.resolve(verifyTelegramWebhook(req, rawBody)),
  parse: (req, rawBody) => Promise.resolve(parseTelegramWebhook(req, rawBody)),
  sendMessage: (chatRef, text, opts) => sendTelegramMessage(chatRef, text, opts),
  sendTyping: (chatRef) => sendTelegramChatAction(chatRef),
};

registerAdapter(telegramAdapter);
