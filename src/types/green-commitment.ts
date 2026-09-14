/**
 * green-commitment 类型 — 绿色承诺追踪 (batch53-a)
 *
 * 承诺登记与到期结算均由纯派生 (src/lib/green-commitment.ts) 产出/判定,
 * 读写都走 manual_adjustment 元数据通道 (零 DDL)。
 */

import type { GuardInsightCategory } from '@/lib/guard-category-insight';

/** 结算三分支: 达成 / 中途破了 (非羞辱话术) / 数据不足 (窗口内无任何守护事件) */
export type GreenCommitmentOutcome = 'kept' | 'broken' | 'insufficient';

/** 一条已登记的承诺 (从 manual_adjustment metadata 读回) */
export interface GreenCommitmentRecord {
  /** 守护品类 (登记时从承诺对象原词派生, 词表同 guard-category-insight) */
  category: GuardInsightCategory;
  /** 承诺不买的对象原词 ("咖啡"); 提取不到为 null */
  subject: string | null;
  /** 承诺起始日 (本地 YYYY-MM-DD) */
  startKey: string;
  /** 承诺到期日 (本地 YYYY-MM-DD, 含当日) */
  endKey: string;
}

/** 到期结算结果 (纯派生, 供结算卡渲染) */
export interface GreenCommitmentSettlement {
  record: GreenCommitmentRecord;
  outcome: GreenCommitmentOutcome;
  /** 承诺时长 (start..end 含尾, 天) — 面子字段 */
  days: number;
  /** 承诺期内该品类被守护助攻的次数 (成功拦截) — 面子字段 */
  assistCount: number;
  /** 承诺期内该品类被守护换回的自由小时 (savedAmount/hourlyRate) — 私有面 only */
  hoursReclaimed: number;
  /** 结算标记 key (`start#end`), 完成结算时随 manual_adjustment 写回做一次性消解 */
  refKey: string;
}

/** 到期派生总结果 */
export interface GreenCommitmentDerivation {
  /** 到期未结算的承诺 (取最近到期的一条); 无则 null */
  dueSettlement: GreenCommitmentSettlement | null;
  /** 进行中的承诺 (endKey >= 今天, 最近一条); 供 chat 摘要注入/卡内提示 */
  activeCommitment: GreenCommitmentRecord | null;
}
