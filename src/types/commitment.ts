/**
 * commitment 类型 — 承诺登记卡 payload (batch53-a)
 *
 * 检测 (commitment-detector) 命中后服务端把意图原样带给前端登记卡,
 * 用户在卡上可改时长, 确认后才落 health_events (零 DDL)。
 */

export interface CommitmentCardData {
  /** 承诺不买的对象原词; 提取不到为 null (卡面走通用文案) */
  subject: string | null;
  /** fixed = 显式 N 天; month_end = 到本月底 */
  durationKind: 'fixed' | 'month_end';
  /** durationKind='fixed' 时的天数; month_end 时为 null */
  days: number | null;
}
