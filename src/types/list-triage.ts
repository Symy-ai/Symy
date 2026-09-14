/**
 * list-triage 类型 — 购物清单批量分诊卡 payload (batch57-a)
 *
 * 检测 (list-triage-detector) 命中后服务端逐条分诊: 词条命中 → 替代
 * (引用 green-alt 词条, 只读不改); 守护品类但无词条 → 想清楚; 其余
 * (含 53-b guard-scope exempt 品类) → 绿灯静默放行。前端分诊卡按条目
 * 渲染三态 + 动作 chip, 点选后才落 health_events (零 DDL)。
 */

export type ListTriageVerdict = 'green' | 'alt' | 'think';

export interface ListTriageItem {
  /** 条目对象原词 (detector 清洗后) */
  word: string;
  /** 三态判定: green=没风险放行 / alt=有替代 / think=建议再想 */
  verdict: ListTriageVerdict;
  /** 命中的 green-alt 词条 id (triggerId 式 key, 落账 metadata 对齐); 无命中为 null */
  altId: string | null;
  /** 词条 why (locale 文案, 只读引用); 无命中为 null */
  why: string | null;
  /** 词条 alternative 建议句; 无命中为 null */
  alternative: string | null;
  /** resolveGuardCategory 解析出的品类 ('other' = 非守护品类) */
  category: string;
}

export interface ListTriageCardData {
  items: ListTriageItem[];
  /** 卡尾合计 (纯计数, 零金额零碳数值) */
  summary: { total: number; green: number; alt: number; think: number };
}
