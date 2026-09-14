/**
 * category-query-turn — "这个月奶茶拦截了几次" 分类问答轮 (服务端 part, batch58-c)
 *
 * 用户消息命中 category-query-detector 时, 不调 Letta (它看不到聚合数字),
 * 直接返回 canned 回复 + 分类对账卡: 该类拦截次数 + 该类替代/复用采纳次数,
 * 数字全部来自 aggregateCategoryGuardCounts 纯函数 (resolveGuardCategory
 * 同口径归类)。非羞辱框架: 次数是"守住的第几棒", 永不渲染成"败了多少次"。
 *
 * 与 savings-query-turn 同路数: 命中即 canned 短路返回, 卡上零金额零碳数值,
 * 本任务无分享面。未命中维度 (品类归一不到五类) 由 detector 返回 null 回落
 * 57-c 月度总答。
 */

import { detectCategoryQuery } from './category-query-detector';
import { sliceEventsByQueryWindow } from './query-window-range';
import { aggregateCategoryGuardCounts } from '@/lib/category-guard-counts';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { CategoryQueryCardData } from '@/types/dimension-query';
import type { SavingsQueryEvent } from './savings-query-context';

export interface CategoryQueryTurn {
  reply: string;
  categoryQueryCard: CategoryQueryCardData;
}

export interface BuildCategoryQueryTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 命中分类问句轮时返回 {reply, categoryQueryCard}, 否则 null。
 * 纯函数: 检测 + 既有聚合 lib 调用 (events 由调用方注入), 不读库不调外部服务。
 */
export function buildCategoryQueryTurn(input: BuildCategoryQueryTurnInput): CategoryQueryTurn | null {
  const intent = detectCategoryQuery(input.userContent);
  if (!intent) return null;
  return buildCategoryQueryTurnFromIntent({ ...input, window: intent.window, category: intent.category });
}

/** intent 直入变体 (batch59-c 追问跟随复用: 窗口/品类来自上文解析而非字符串检测) */
export interface BuildCategoryQueryTurnFromIntentInput {
  window: CategoryQueryCardData['window'];
  category: CategoryQueryCardData['category'];
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

export function buildCategoryQueryTurnFromIntent(input: BuildCategoryQueryTurnFromIntentInput): CategoryQueryTurn {
  const { window, category, locale, events, now, rng } = input;

  const windowEvents = sliceEventsByQueryWindow(events, window, now);
  const counts = aggregateCategoryGuardCounts(windowEvents, category);

  const status: CategoryQueryCardData['status'] = windowEvents.length === 0 ? 'noData' : 'ok';
  return {
    reply: getElephantPhrase(status === 'ok' ? 'category_query_welcome' : 'category_query_empty', locale, undefined, rng),
    categoryQueryCard: {
      window,
      category,
      status,
      intercepts: counts.intercepts,
      altAdoptions: counts.altAdoptions,
      reuseAdoptions: counts.reuseAdoptions,
    },
  };
}

/** category_query_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface CategoryQuerySseEvent {
  type: 'category_query_card';
  categoryQueryCard: CategoryQueryCardData;
}

export function categoryQuerySseEvent(card: CategoryQueryCardData): CategoryQuerySseEvent {
  return { type: 'category_query_card', categoryQueryCard: card };
}

/** 分类问答轮的 canned SSE 流: 先发卡事件, 再分块发回复, 最后 done (与 57-c 同构) */
export function buildCategoryQuerySseStream(turn: CategoryQueryTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(categoryQuerySseEvent(turn.categoryQueryCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
