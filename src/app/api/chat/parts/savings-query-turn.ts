/**
 * savings-query-turn — "这个月省了多少" 问账轮 (服务端 part, batch57-c)
 *
 * 用户消息命中 savings-query-detector ("这个月省了多少 / 上周守护了几次 /
 * 我胜率怎么样") 时, 不调 Letta (Letta 看不到聚合数字, 自由回复只能含糊
 * 安慰或编造金额 — AI 报假账比不报更伤信任), 直接返回 canned 对账回复 +
 * 问账卡:
 *   - 迎接话术取 elephant-tone 的 savings_query_welcome / savings_query_empty
 *     (空窗引导态: "这周还没开张, 下一单叫上我", 非羞辱不造假)
 *   - 卡上数字全部来自既有聚合 lib 纯函数 (weeklyGuardCompare /
 *     buildMonthlyStatement / aggregateGuardStyleProfile), 本层只做时间窗
 *     切片与字段搬运, 绝不经手 Letta、绝不重算口径
 *   - 金额 (转存合计) 只进卡内 private 字段 (App 内私享, win-rate 卡先例);
 *     shareFace 是结构上的 amount-free 分享面变体
 *
 * 与 compare-turn 同路数: 命中即 canned reply 短路返回。互斥: 问账是提问
 * 不是购物意图, route 链排在购物类 detector 之后 (detector 内排除 + 链序
 * 双保险)。
 */

import { detectSavingsQuery } from './savings-query-detector';
import type { SavingsQueryEvent } from './savings-query-context';
import { localWeekStart, weeklyGuardCompare } from '@/lib/weekly-guard-compare';
import { buildMonthlyStatement } from '@/lib/monthly-guard-statement';
import { aggregateGuardStyleProfile } from '@/lib/guard-style-profile';
import { formatFreedomTime } from '@/lib/freedom-time';
import { getElephantPhrase } from '@/lib/elephant-tone';
import type { SavingsQueryCardData, SavingsQueryWindow } from '@/types/savings-query';

export interface SavingsQueryTurn {
  reply: string;
  savingsQueryCard: SavingsQueryCardData;
}

export interface BuildSavingsQueryTurnInput {
  userContent: string;
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 用户时薪 — 只经既有聚合 lib 的共享通道换算自由小时 */
  hourlyRate: number;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

const WINDOW_WORD: Record<SavingsQueryWindow, { zh: string; en: string }> = {
  thisWeek: { zh: '本周', en: 'this week' },
  lastWeek: { zh: '上周', en: 'last week' },
  thisMonth: { zh: '本月', en: 'this month' },
  lastMonth: { zh: '上月', en: 'last month' },
};

/** 窗口本地时间界 [start, end) — 周界复用 localWeekStart (Monday-start 同约定) */
function windowRange(window: SavingsQueryWindow, now: Date): { start: Date; end: Date } {
  if (window === 'thisWeek') {
    const start = localWeekStart(now);
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
  }
  if (window === 'lastWeek') {
    const end = localWeekStart(now);
    return { start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7), end };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  if (window === 'thisMonth') {
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** 本地时间 YYYY-MM (buildMonthlyStatement 的 monthKey) */
function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** amount-free 分享面 ("12 次守护、挽回 9 小时自由时间" 式 — 结构上无金额) */
function buildShareFace(card: Omit<SavingsQueryCardData, 'shareFace'>): SavingsQueryCardData['shareFace'] {
  const word = WINDOW_WORD[card.window];
  const actions = card.intercepts + (card.tracksAvailable ? card.trackCounts.alt + card.trackCounts.reuse : 0);
  const hoursZh = formatFreedomTime(card.hoursReclaimed, 'zh');
  const hoursEn = formatFreedomTime(card.hoursReclaimed, 'en');
  return {
    zh: `${word.zh} ${actions} 次守护、挽回 ${hoursZh} 自由时间`,
    en: `${actions} guards ${word.en} — ${hoursEn} of free time won back`,
  };
}

/**
 * 命中问账轮时返回 {reply, savingsQueryCard}, 否则 null。
 * 纯函数: 检测 + 既有聚合 lib 调用 (events 由调用方注入), 不读库不调外部服务。
 */
export function buildSavingsQueryTurn(input: BuildSavingsQueryTurnInput): SavingsQueryTurn | null {
  const intent = detectSavingsQuery(input.userContent);
  if (!intent) return null;
  return buildSavingsQueryTurnFromWindow({ ...input, window: intent.window });
}

/** intent 直入变体 (batch59-c 追问跟随复用: 窗口来自上文解析而非字符串检测) */
export interface BuildSavingsQueryTurnFromWindowInput {
  window: SavingsQueryWindow;
  locale: 'en' | 'zh';
  events: SavingsQueryEvent[];
  /** 时间锚 (周界/月界以本地时区计算); 测试注入固定值 */
  now: Date;
  /** 用户时薪 — 只经既有聚合 lib 的共享通道换算自由小时 */
  hourlyRate: number;
  /** 测试可注入 rng, 让话术轮换确定 */
  rng?: () => number;
}

export function buildSavingsQueryTurnFromWindow(input: BuildSavingsQueryTurnFromWindowInput): SavingsQueryTurn {
  const { window, locale, events, now, hourlyRate, rng } = input;

  // 时间窗切片 (机械过滤, 聚合口径仍由 lib 自己定义)
  const { start, end } = windowRange(window, now);
  const windowEvents = (events || []).filter((e) => {
    const t = new Date(e.createdAt).getTime();
    if (!Number.isFinite(t)) return false;
    const d = new Date(t);
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    return local >= start && local < end;
  });

  // 拦截轮次 / 胜率 / 自由小时 / 转存合计 — 全部取自既有聚合 lib 输出
  let intercepts: number;
  let passRate: number | null;
  let hoursReclaimed: number;
  let estSavedTotal: number;
  if (window === 'thisWeek' || window === 'lastWeek') {
    const weekly = weeklyGuardCompare(windowEvents, now, hourlyRate);
    const bucket = window === 'thisWeek' ? weekly.thisWeek : weekly.lastWeek;
    intercepts = bucket.intercepts;
    passRate = bucket.passRate;
    hoursReclaimed = bucket.hoursReclaimed;
    estSavedTotal = bucket.guardedAmount;
  } else {
    const statement = buildMonthlyStatement(windowEvents, {
      monthKey: monthKeyOf(start),
      hourlyRate,
      locale,
    });
    intercepts = statement.public.intercepts;
    passRate = statement.public.passRate;
    hoursReclaimed = statement.public.hoursReclaimed;
    estSavedTotal = statement.private.guardedAmount;
  }

  // 三轨次数 — 三轨聚合 (guard-style-profile); 样本不足 (<5) 不渲染三轨行 (不造伪计数)
  const profile = aggregateGuardStyleProfile(windowEvents);
  const tracksAvailable = profile.status === 'ok';
  const trackCounts = tracksAvailable ? { ...profile.trackCounts } : { guard: 0, alt: 0, reuse: 0 };

  // 无数据窗 → 引导态 ("这周还没开张, 下一单叫上我"), 绝不显示 0 元假账
  const status: SavingsQueryCardData['status'] = windowEvents.length === 0 ? 'noData' : 'ok';
  const card: SavingsQueryCardData = {
    window,
    status,
    intercepts,
    passRate,
    trackCounts,
    tracksAvailable,
    hoursReclaimed,
    hoursLabel: formatFreedomTime(hoursReclaimed, locale),
    private: { estSavedTotal },
    shareFace: { zh: '', en: '' },
  };
  card.shareFace = buildShareFace(card);

  return {
    reply: getElephantPhrase(status === 'ok' ? 'savings_query_welcome' : 'savings_query_empty', locale, undefined, rng),
    savingsQueryCard: card,
  };
}

/** savings_query_card SSE 事件的 payload 形状 (consume-ai-stream 按 type 分发) */
export interface SavingsQuerySseEvent {
  type: 'savings_query_card';
  savingsQueryCard: SavingsQueryCardData;
}

export function savingsQuerySseEvent(card: SavingsQueryCardData): SavingsQuerySseEvent {
  return { type: 'savings_query_card', savingsQueryCard: card };
}

/**
 * 问账轮的 canned SSE 流: 先发对账卡事件 (卡片先渲染), 再分块发迎接回复
 * (模拟 typing), 最后 done。与 compare canned stream 同构。
 */
export function buildSavingsQuerySseStream(turn: SavingsQueryTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = turn.reply.match(/.{1,15}/g) || [turn.reply];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(savingsQuerySseEvent(turn.savingsQueryCard))}\n\n`),
      );
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
}
