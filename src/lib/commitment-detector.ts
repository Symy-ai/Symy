/**
 * commitment-detector — 绿色承诺意图检测 (纯函数, batch53-a)
 *
 * 场景: 用户在对话里对小象口头承诺 — "这个月不买咖啡 / 先忍 30 天不买游戏 /
 * no more games for 30 days"。命中时上层不走 Letta, 改走 canned 回应 +
 * 承诺登记卡 (见 parts/commitment-turn.ts), 用户确认后才落 health_events。
 *
 * 触发克制 (红线):
 * - 只匹配「我承诺不买」的第一人称陈述句; 疑问句 ("能不买咖啡吗") 与转述
 *   ("他说他不买了") 不命中 — 前者是求问, 后者不是用户的承诺
 * - "我就要买" 是 48-b 反驳 (pushback) 语义, 在此必须不命中 (两流互斥);
 *   "该买 X 吗 / 要不要买" 是 50-a 求问语义, 同样不命中
 * - zh 走包含匹配, en 走词边界匹配 (防 "buyer" 类误中)
 */

export type CommitmentDurationKind = 'fixed' | 'month_end';

export interface CommitmentIntent {
  /** 承诺不买的对象原词 ("咖啡"/"游戏"); 提取不到为 null (卡面走通用文案) */
  subject: string | null;
  /** fixed = 显式 N 天; month_end = 到本月底 (含未写时长的默认档) */
  durationKind: CommitmentDurationKind;
  /** durationKind='fixed' 时的天数 (1..365); month_end 时为 null */
  days: number | null;
}

/** 疑问形态 — 求问不是承诺, 一律不命中 (与 50-a 买前三问流互斥) */
const QUESTION_ZH: readonly RegExp[] = [
  /吗\s*[?？]?\s*$/,
  /呢\s*[?？]?\s*$/,
  /[?？]\s*$/,
  /(?:能不能|可不可以|能不能不买|该不该|要不要)/,
];
const QUESTION_EN: readonly RegExp[] = [
  /\?\s*$/,
  /(?<![\w-])(?:should i|can i|could i|may i)(?![\w-])/i,
];

/** 转述形态 — 说的不是用户自己, 不登记 */
const REPORTED_ZH: readonly string[] = ['他说', '她说', '朋友说', '同事说', '别人说', '网友说'];
const REPORTED_EN: readonly RegExp[] = [
  /(?<![\w-])(?:he|she|my friend|they) (?:said|says)(?![\w-])/i,
];

/** 显式时长 — "先忍 30 天不买游戏 / 坚持14天不买奶茶 / no games for 30 days" */
const DAYS_ZH = /(?:坚持|忍|先忍|就)?\s*(\d{1,3})\s*天.{0,8}不(?:买|囤)(.{1,12}?)(?:了|啦)?(?=[。！!～\s]|$)/u;
const DAYS_EN =
  /(?<![\w-])(?:no(?: more)?|not buying|won'?t buy|stop buying|no buying)\s+(.{1,24}?)\s+(?:for|over)\s+(?:the\s+next\s+)?(\d{1,3})\s*days?(?![\w-])/i;

/** 默认档 (未写时长) — "这个月不买咖啡 / 我不买鞋了 / no more coffee" */
const MONTH_ZH = /(?:这个月|本月|月内|这个月里)?\s*不(?:买|囤)(.{1,12}?)(?:了|啦)?(?=[。！!～\s]|$)/u;
const MONTH_EN = /(?<![\w-])(?:no more|not buying|won'?t buy|stop buying)\s+(.{1,24}?)(?=[.!?~\s]|$)/i;

function cleanSubject(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^[的了吗啦，,。.~～!！?？\s]+|[的了吗啦，,。.~～!！?？\s]+$/g, '');
  return s.length > 0 ? s : null;
}

/**
 * 检测承诺意图。命中返回 {subject, durationKind, days}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectCommitment(userContent: string): CommitmentIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  // 反驳 ("我就要买") 属 48-b 冷静卡流; 求问 ("该买吗/要不要买") 属 50-a 三问流 — 两流互斥
  if (/(我就要买|我就要下单|让我买|leave me alone|let me buy)/i.test(normalized)) return null;
  if (/(该不该买|该不该入手|值得买吗|要不要买|should i buy|is it worth)/i.test(normalized)) return null;
  if (QUESTION_ZH.some((p) => p.test(normalized)) || QUESTION_EN.some((p) => p.test(normalized))) return null;
  if (REPORTED_ZH.some((w) => normalized.includes(w)) || REPORTED_EN.some((p) => p.test(normalized))) return null;

  // 显式 N 天优先 (时长明确, 不用默认档)
  const daysZh = DAYS_ZH.exec(normalized);
  if (daysZh) {
    const days = Number.parseInt(daysZh[1], 10);
    if (days >= 1 && days <= 365) {
      return { subject: cleanSubject(daysZh[2]), durationKind: 'fixed', days };
    }
  }
  const daysEn = DAYS_EN.exec(normalized);
  if (daysEn) {
    const days = Number.parseInt(daysEn[2], 10);
    if (days >= 1 && days <= 365) {
      return { subject: cleanSubject(daysEn[1]), durationKind: 'fixed', days };
    }
  }

  // 默认档: 有月份限定词 → month_end; en 无限定词也按 month_end (与 zh 默认一致)
  const monthZh = MONTH_ZH.exec(normalized);
  if (monthZh) {
    return { subject: cleanSubject(monthZh[1]), durationKind: 'month_end', days: null };
  }
  const monthEn = MONTH_EN.exec(normalized);
  if (monthEn) {
    // en 的默认档与 zh 一律到本月底 (限定词只作提示, 不改变默认时长)
    return { subject: cleanSubject(monthEn[1]), durationKind: 'month_end', days: null };
  }

  return null;
}
