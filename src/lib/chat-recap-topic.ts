/**
 * chat-recap-topic — 从已加载的 chat 历史消息推导「上次我们聊到」回顾话题 (纯函数)
 *
 * chat 会话连续性的一部分: 用户回到 chat 时, 若上次会话里有可续的绿色话题
 * (想买 X 时聊过替代/复用/二手), 生成一行摘要 + 续接 prompt, 让 Symy 表现得"记得"。
 *
 * 设计红线:
 * - 纯函数: 不发请求、不读库、不读 storage、不抛异常 (异常输入一律 null)
 * - 消费方传入已加载的 history messages (不新发 API 请求)
 * - 话题识别复用 green-alternatives 词表 (zh+en 双语 trigger) + 少量绿色意图词
 * - 文案用陪伴句式 ("我们聊到/你上次在考虑"), 不用羞辱句式
 */

import { GREEN_ALTERNATIVES } from './green-alternatives';
import type { ChatMessage } from '@/types/chat-message';

export interface ChatRecapTopic {
  /** 'green_alt' = 命中绿色替代词表; 'green_intent' = 命中绿色意图词 (二手/复用等) */
  kind: 'green_alt' | 'green_intent';
  /** 话题摘要 (zh, 如 「象牙」的绿色替代) */
  summaryZh: string;
  summaryEn: string;
  /** 点「继续聊」填入输入框的续接 prompt */
  continuePromptZh: string;
  continuePromptEn: string;
  /** 命中的那条用户消息 id (sessionStorage 去重用) */
  messageId: string;
}

/** 话题最大年龄 — 超过 14 天的旧会话不再回顾 */
export const CHAT_RECAP_MAX_AGE_DAYS = 14;

const MAX_AGE_MS = CHAT_RECAP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * 绿色意图词 — 不在替代词表里, 但明显是聊到一半的绿色决策
 * (二手/复用/租赁/修补)。zh/en 各自匹配 (zh 词不 lowercase 也能 includes)。
 */
const GREEN_INTENT_KEYWORDS: ReadonlyArray<{ zh: string; en: string }> = [
  { zh: '二手', en: 'secondhand' },
  { zh: '闲置', en: 'used ' },
  { zh: '复用', en: 'reuse' },
  { zh: '租赁', en: 'rent' },
  { zh: '修一修', en: 'repair' },
  { zh: '修补', en: 'fix instead' },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 在词表 trigger 里找出命中词条的 zh/en 展示词 (en 摘要用词条自身 en trigger, 保持可读) */
function findGreenAltWords(content: string): { zh: string; en: string } | null {
  const normalized = normalize(content);
  for (const entry of GREEN_ALTERNATIVES) {
    const matchedZh = entry.triggers.zh.find((t) => normalized.includes(t.toLowerCase()));
    const matchedEn = entry.triggers.en.find((t) => normalized.includes(t.toLowerCase()));
    if (matchedZh || matchedEn) {
      return {
        zh: matchedZh ?? entry.triggers.zh[0],
        en: entry.triggers.en[0],
      };
    }
  }
  return null;
}

function findGreenIntentKeyword(content: string): { zh: string; en: string } | null {
  const normalized = normalize(content);
  for (const kw of GREEN_INTENT_KEYWORDS) {
    if (normalized.includes(kw.zh) || normalized.includes(kw.en)) return kw;
  }
  return null;
}

function withinMaxAge(message: ChatMessage, now: Date): boolean {
  if (!message.timestamp || Number.isNaN(message.timestamp.getTime())) return false;
  return now.getTime() - message.timestamp.getTime() <= MAX_AGE_MS;
}

function buildTopic(
  kind: ChatRecapTopic['kind'],
  wordZh: string,
  wordEn: string,
  messageId: string
): ChatRecapTopic {
  if (kind === 'green_alt') {
    return {
      kind,
      summaryZh: `「${wordZh}」的绿色替代`,
      summaryEn: `greener alternatives to "${wordEn}"`,
      continuePromptZh: `我们上次聊到「${wordZh}」的替代方案，这次想继续看看有哪些选择`,
      continuePromptEn: `Last time we talked about greener alternatives to "${wordEn}" — I'd like to pick that back up`,
      messageId,
    };
  }
  return {
    kind,
    summaryZh: `「${wordZh}」这个绿色话题`,
    summaryEn: `the "${wordEn}" idea`,
    continuePromptZh: `你上次在考虑「${wordZh}」这件事，我们接着聊吧`,
    continuePromptEn: `You were thinking about ${wordEn} last time — let's pick that back up`,
    messageId,
  };
}

/**
 * 从消息里推导回顾话题: 取最近一条 (14 天内) 含绿色替代/绿色意图语义的用户消息。
 * 空历史 / 全是寒暄 / 话题超 14 天 → null。永不抛异常。
 */
export function deriveChatRecapTopic(
  messages: ReadonlyArray<ChatMessage>,
  now: Date = new Date()
): ChatRecapTopic | null {
  try {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || message.role !== 'user') continue;
      if (typeof message.content !== 'string' || message.content.trim().length === 0) continue;
      if (!message.id || !withinMaxAge(message, now)) continue;

      const greenAlt = findGreenAltWords(message.content);
      if (greenAlt) return buildTopic('green_alt', greenAlt.zh, greenAlt.en, message.id);

      const intent = findGreenIntentKeyword(message.content);
      if (intent) return buildTopic('green_intent', intent.zh, intent.en, message.id);
    }
    return null;
  } catch {
    // safe to ignore: recap is best-effort — any malformed input just means no recap
    return null;
  }
}
