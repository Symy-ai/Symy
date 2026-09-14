/**
 * follow-up-turn — 数据问答追问跟随轮 (服务端 part, batch59-c)
 *
 * 用户在数据问答 ("这个月省了多少" / "奶茶拦截几次" / "晚上冲动买的多吗")
 * 之后发短追问 ("那上个月呢" "那外卖呢") 时, follow-up-query 解析出重算
 * 参数 (继承维度换窗口 / 继承窗口换维度), 本 part 按参数分派到 57-c/58-c
 * 的既有 intent 型 builder — 聚合数字全部来自既有 aggregate 函数, 本层零
 * 新算术路径。卡形状与原轨道逐字段一致, 前端复用同一渲染 (无新 UI)。
 *
 * 红线沿 57-c/58-c: 金额只在 savings 卡 private (App 内私享), category/
 * impulse 卡 structurally amount-free; 空窗走 insufficient/noData honest
 * degrade, 绝不编数字。
 */

import { buildSavingsQueryTurnFromWindow } from './savings-query-turn';
import { buildCategoryQueryTurnFromIntent } from './category-query-turn';
import { buildImpulseTimeQueryTurnFromIntent } from './impulse-time-query-turn';
import type { ResolvedFollowUp } from './follow-up-query';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { SavingsQueryCardData } from '@/types/savings-query';
import type { CategoryQueryCardData, ImpulseTimeCardData } from '@/types/dimension-query';
import type { SavingsQueryEvent } from './savings-query-context';

export interface FollowUpTurn {
  reply: string;
  savingsQueryCard?: SavingsQueryCardData;
  categoryQueryCard?: CategoryQueryCardData;
  impulseTimeCard?: ImpulseTimeCardData;
}

export interface BuildFollowUpTurnInput {
  resolved: ResolvedFollowUp;
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界/小时分桶以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 用户时薪 — savings 轨道换算自由小时 (只经既有聚合 lib) */
  hourlyRate?: number;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

/**
 * 按解析参数构建追问跟随轮。纯函数: 只分派到既有 intent 型 builder +
 * 掀卡回复, 数字不经手本层。savings 轨道缺 hourlyRate 时按 57-c route 兜底 25。
 */
export function buildFollowUpTurn(input: BuildFollowUpTurnInput): FollowUpTurn {
  const { resolved, locale, events, now, rng } = input;

  if (resolved.kind === 'savings') {
    const turn = buildSavingsQueryTurnFromWindow({
      window: resolved.window,
      locale,
      events,
      now,
      hourlyRate: input.hourlyRate ?? 25,
      rng,
    });
    // 追问语境: 掀同一本账的新一页 (welcome 措辞换成 followup 变体, 空窗沿用 57-c 引导态)
    const ok = turn.savingsQueryCard.status === 'ok';
    return {
      reply: ok ? getElephantPhrase('followup_query_welcome', locale, undefined, rng) : turn.reply,
      savingsQueryCard: turn.savingsQueryCard,
    };
  }

  if (resolved.kind === 'category') {
    const turn = buildCategoryQueryTurnFromIntent({
      window: resolved.window,
      category: resolved.category,
      locale,
      events,
      now,
      rng,
    });
    const ok = turn.categoryQueryCard.status === 'ok';
    return {
      reply: ok ? getElephantPhrase('followup_query_welcome', locale, undefined, rng) : turn.reply,
      categoryQueryCard: turn.categoryQueryCard,
    };
  }

  const turn = buildImpulseTimeQueryTurnFromIntent({
    window: resolved.window,
    impulseWindow: resolved.impulseWindow,
    locale,
    events,
    now,
    rng,
  });
  const ok = turn.impulseTimeCard.status === 'ok';
  return {
    reply: ok ? getElephantPhrase('followup_query_welcome', locale, undefined, rng) : turn.reply,
    impulseTimeCard: turn.impulseTimeCard,
  };
}

/** 追问跟随轮的 canned SSE 流: 先发卡事件 (按轨道选事件类型), 再分块发回复, 最后 done (与 57-c/58-c 同构) */
export function buildFollowUpSseStream(turn: FollowUpTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cardEvent: object;
  if (turn.savingsQueryCard) {
    cardEvent = { type: 'savings_query_card', savingsQueryCard: turn.savingsQueryCard };
  } else if (turn.categoryQueryCard) {
    cardEvent = { type: 'category_query_card', categoryQueryCard: turn.categoryQueryCard };
  } else {
    cardEvent = { type: 'impulse_time_card', impulseTimeCard: turn.impulseTimeCard };
  }
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(cardEvent)}\n\n`));
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
