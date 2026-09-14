/**
 * green-alt-retro-turn — 绿色采纳后复盘的追问轮与收束轮 builder (batch68-a)
 *
 * 与 cooldown/prepurchase 同路数: 命中即 canned reply 短路返回, SSE canned
 * stream 只用于追问与收束两个动作 — 选项回答给 canned 收束; 自由文本回答
 * 不在本模块 (回落 Letta, 证据注入见 green-alt-retro-context)。
 *
 * 文案红线 (产品要求 #3/#4):
 * - 追问短句先承认用户刚完成的选择, 不做重复促销式省钱话术;
 * - 收束确认给 "我是能做出体面选择的人" 的身份叙事, 无羞辱、无经济状况暗示;
 * - 全部面零金额零碳数值。
 * 文案走 zh.json/en.json 新 key (chat.greenAltRetro.*, 服务端直读, 与 cron
 * 路由同先例), 不使用 defaultValue 兜底。
 */

import enMessages from '@/i18n/messages/en.json';
import zhMessages from '@/i18n/messages/zh.json';
import { GREEN_ALT_RETRO_OPTIONS, isGreenAltRetroOptionId, type GreenAltRetroOptionId } from '@/lib/green-alt-retro';
import { isKnownGreenAltEntry } from '@/lib/green-alt-category';
import { greenAltDisplayLabel } from '@/lib/alt-adoption-profile';
import type { GreenLocale } from '@/lib/green-alt-types';
import type { GreenAltRetroCardData } from '@/types/green-alt-retro';

/** chat.greenAltRetro.* 文案形状 (zh/en 结构对称, i18n parity 测试锁定) */
interface GreenAltRetroCopy {
  askReply: string;
  askTitle: string;
  freeTextHint: string;
  dismiss: string;
  answeredNote: string;
  option: Record<GreenAltRetroOptionId, string>;
  closing: Record<GreenAltRetroOptionId, string>;
}

function retroCopy(locale: GreenLocale): GreenAltRetroCopy {
  const table = locale === 'zh' ? zhMessages : enMessages;
  return (table.chat as { greenAltRetro: GreenAltRetroCopy }).greenAltRetro;
}

/** 追问轮 — canned 承认 + 一次追问, 附复盘卡 payload (4 选项 id, 文案在客户端 i18n) */
export interface GreenAltRetroAskTurn {
  reply: string;
  greenAltRetro: GreenAltRetroCardData;
}

export interface BuildGreenAltRetroAskTurnInput {
  entryId: string;
  locale: GreenLocale;
}

/**
 * 构建追问轮。entryId 非已知绿色替代词条 → null (静默回落普通链路)。
 * 纯函数: 取词 + 插值, 不读库不调外部服务。
 */
export function buildGreenAltRetroAskTurn(input: BuildGreenAltRetroAskTurnInput): GreenAltRetroAskTurn | null {
  const { entryId, locale } = input;
  if (typeof entryId !== 'string' || !isKnownGreenAltEntry(entryId)) return null;
  const item = greenAltDisplayLabel(entryId, locale);
  const reply = retroCopy(locale).askReply.replace(/\{item\}/g, item);
  return {
    reply,
    greenAltRetro: {
      entryId,
      options: [...GREEN_ALT_RETRO_OPTIONS],
    },
  };
}

/** 收束轮 — 按选项给一句身份叙事收束 (承认选择 + 不追问) */
export interface GreenAltRetroClosingTurn {
  reply: string;
}

export interface BuildGreenAltRetroClosingTurnInput {
  entryId: string;
  optionId: GreenAltRetroOptionId;
  locale: GreenLocale;
}

/** 构建选项回答的收束轮; entryId/optionId 非法 → null (调用方回落普通链路) */
export function buildGreenAltRetroClosingTurn(input: BuildGreenAltRetroClosingTurnInput): GreenAltRetroClosingTurn | null {
  const { entryId, optionId, locale } = input;
  if (typeof entryId !== 'string' || !isKnownGreenAltEntry(entryId)) return null;
  if (!isGreenAltRetroOptionId(optionId)) return null;
  return { reply: retroCopy(locale).closing[optionId] };
}

function cannedTokenStream(reply: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = reply.match(/.{1,15}/g) || [reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}

/**
 * 追问轮的 canned SSE 流: 先发 green_alt_retro 事件 (复盘卡先渲染, 用户可点
 * 选项或自由输入), 再分块发 canned 承认+追问 (模拟 typing), 最后 done。
 */
export function buildGreenAltRetroAskSseStream(turn: GreenAltRetroAskTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const inner = cannedTokenStream(turn.reply);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'green_alt_retro', greenAltRetro: turn.greenAltRetro })}\n\n`),
      );
      const reader = inner.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      };
      void pump();
    },
    cancel(reason) {
      return inner.cancel(reason);
    },
  });
}

/** 收束轮的 canned SSE 流 (纯 token + done, 无卡片事件) */
export function buildGreenAltRetroClosingSseStream(turn: GreenAltRetroClosingTurn): ReadableStream<Uint8Array> {
  return cannedTokenStream(turn.reply);
}
