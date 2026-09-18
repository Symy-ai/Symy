/**
 * Inducement Tactics — 诱导战术分类 + 社区聚合纯逻辑 (batch81-b)
 *
 * 零 DDL 口径: impulse_events 没有 strategy 列, 战术从既有字段在线推导 —
 *   is_flash_sale 布尔 + title/raw_text 关键词。词表复用既有检测器:
 *   FLASH_SALE_KEYWORDS (impulse-detector) 与 BNPL_PATTERNS (bnpl-detector),
 *   不另起词表避免口径漂移。
 *
 * 分类规则: 一条事件只归一个战术 — 按 TACTIC_PATTERNS 顺序取首个命中
 *   (债务话术词组最具体排前, is_flash_sale 兜底排最后)。
 *   命中不了任何战术的旧事件不计入百分比分母 (不硬塞桶, 诚实原则)。
 */

import { FLASH_SALE_KEYWORDS } from './impulse-detector';
import { BNPL_PATTERNS } from './bnpl-detector';

/** 可展示的战术 id — 与 defense.strategy* i18n key 一一对应 */
export type InducementTacticId =
  | 'limited_time'
  | 'scarcity'
  | 'social_proof'
  | 'bnpl'
  | 'minimum_payment'
  | 'credit_limit_increase'
  | 'zero_apr_intro'
  | 'cash_advance'
  | 'payday_loan'
  | 'subprime_credit_card';

export interface InducementTacticMeta {
  id: InducementTacticId;
  /** i18n key (defense.strategyXxx) */
  labelKey: string;
  /** 英文 fallback label */
  defaultLabel: string;
}

/** 战术元数据表 — route 用它把聚合结果补全成前端 InducementStrategy 形状 */
export const INDUCEMENT_TACTIC_META: Record<InducementTacticId, InducementTacticMeta> = {
  limited_time: { id: 'limited_time', labelKey: 'defense.strategyLimitedTime', defaultLabel: 'Limited-time countdown' },
  scarcity: { id: 'scarcity', labelKey: 'defense.strategyScarcity', defaultLabel: '"Only 3 left" scarcity' },
  social_proof: { id: 'social_proof', labelKey: 'defense.strategySocialProof', defaultLabel: '"Others bought" social proof' },
  bnpl: { id: 'bnpl', labelKey: 'defense.strategyBnpl', defaultLabel: 'BNPL "4 interest-free payments"' },
  minimum_payment: { id: 'minimum_payment', labelKey: 'defense.strategyMinimumPayment', defaultLabel: 'Minimum payment trap' },
  credit_limit_increase: { id: 'credit_limit_increase', labelKey: 'defense.strategyCreditLimitIncrease', defaultLabel: 'Pre-approved credit limit increase' },
  zero_apr_intro: { id: 'zero_apr_intro', labelKey: 'defense.strategyZeroAprIntro', defaultLabel: '0% intro APR (then 28%+)' },
  cash_advance: { id: 'cash_advance', labelKey: 'defense.strategyCashAdvance', defaultLabel: 'Cash advance offer' },
  payday_loan: { id: 'payday_loan', labelKey: 'defense.strategyPaydayLoan', defaultLabel: 'Payday loan / "Borrow until payday"' },
  subprime_credit_card: { id: 'subprime_credit_card', labelKey: 'defense.strategySubprimeCreditCard', defaultLabel: 'Subprime credit card targeted ad' },
};

interface TacticPatterns {
  id: InducementTacticId;
  patterns: RegExp[];
}

/**
 * 战术关键词表 — 顺序即优先级 (首个命中 wins)。
 * 债务话术 (多词组, 高特异) → 营销话术 → is_flash_sale 布尔兜底。
 */
const TACTIC_PATTERNS: TacticPatterns[] = [
  { id: 'payday_loan', patterns: [/payday\s+loan/i, /borrow\s+until\s+payday/i, /发薪日贷/, /工资贷/] },
  { id: 'cash_advance', patterns: [/cash\s+advance/i, /现金预借/, /现金贷/, /取现优惠/] },
  { id: 'zero_apr_intro', patterns: [/0%\s*(intro(ductory)?\s*)?apr/i, /intro(ductory)?\s+apr/i, /0%利率/, /零利率/] },
  { id: 'minimum_payment', patterns: [/min(imum)?\s+payment/i, /最低还款/] },
  { id: 'credit_limit_increase', patterns: [/credit\s+limit/i, /pre-?approved/i, /提额/, /额度提升/] },
  { id: 'subprime_credit_card', patterns: [/subprime/i, /secured\s+(credit\s+)?card/i, /次级信用?卡/] },
  { id: 'bnpl', patterns: BNPL_PATTERNS },
  {
    id: 'scarcity',
    patterns: [
      /only\s+\d+\s+(left|item|pieces?)/i,
      /last\s+\d+\s+(left|items?|pieces?)/i,
      /almost\s+gone/i,
      /selling\s+(fast|out)/i,
      /low\s+stock/i,
      /restock(ing)?\s+soon/i,
      /仅剩/,
      /最后\s*\d+\s*(件|个)/,
      /即将售罄/,
      /库存告急/,
    ],
  },
  {
    id: 'social_proof',
    patterns: [
      /(others|people)\s+(are\s+)?(buying|bought)/i,
      /\d+[km+]?\s*(sold|bought|purchases)/i,
      /best\s?sell/i,
      /trending/i,
      /went\s+viral/i,
      /热卖/,
      /爆款/,
      /已售/,
      /已拍/,
    ],
  },
  {
    id: 'limited_time',
    patterns: FLASH_SALE_KEYWORDS.map((kw) => new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
  },
];

/** 聚合输入: impulse_events 的最小行形状 (lib 保持 DB 无关, 可纯函数测试) */
export interface TacticEventInput {
  isFlashSale?: boolean | null;
  title?: string | null;
  rawText?: string | null;
}

/** 单战术聚合行 */
export interface TacticAggregate {
  id: InducementTacticId;
  count: number;
  /** 占已分类事件的百分比, 保留 1 位小数 */
  percentage: number;
}

export interface TacticAggregation {
  strategies: TacticAggregate[];
  /** 有战术命中的事件数 (百分比分母) */
  classifiedCount: number;
  /** 事件总数 (含未命中战术的) */
  totalEvents: number;
}

/** 低于该样本量的聚合标 source='sample', 前端亮 Sample 角标 (诚实原则) */
export const MIN_TACTIC_SAMPLE_EVENTS = 20;

/**
 * 给一条事件归类战术; 无命中返回 null (不硬塞桶)
 */
export function classifyInducementTactic(event: TacticEventInput): InducementTacticId | null {
  const haystack = `${event.title ?? ''} ${event.rawText ?? ''}`;

  // 具体词组优先, is_flash_sale 布尔兜底 (否则 BNPL 事件带 flash 标记会被误归限时)
  for (const { id, patterns } of TACTIC_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(haystack)) return id;
    }
  }
  if (event.isFlashSale) return 'limited_time';
  return null;
}

/**
 * 聚合一批事件 → 战术计数 Top 列表 (降序, 最多 10 条, 0% 剔除)
 */
export function aggregateInducementTactics(events: TacticEventInput[]): TacticAggregation {
  const counts = new Map<InducementTacticId, number>();
  let totalEvents = 0;

  for (const event of events) {
    totalEvents += 1;
    const id = classifyInducementTactic(event);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const classifiedCount = [...counts.values()].reduce((sum, n) => sum + n, 0);

  const strategies: TacticAggregate[] = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      count,
      percentage: Math.round((count / classifiedCount) * 1000) / 10,
    }))
    .filter((row) => row.percentage > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, 10);

  return { strategies, classifiedCount, totalEvents };
}
