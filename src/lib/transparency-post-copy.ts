/**
 * Weekly post copy builder — 周报一键发帖文案 (batch89-a)
 *
 * BP p20 内容引擎: 每周透明度报告要能贴到 X.com (种子平台)。本模块从公开
 * 快照生成「复制即发」的双语文案 — 只做复制, 不做自动发布, 发帖节奏由
 * owner 手动把控。
 *
 * 金额红线 (最高优先): 入参类型是 Pick<TransparencySnapshot, 非金额三指标>
 * — savedUsd / co2SavedKg 在类型层面就进不来, 文案只含 拦截次数 / 赢回
 * 小时 / 守护者数。链接固定 symy.ai/transparency, 尾签固定品牌句。
 * 文案纪律: 无 FOMO 话术, 守护叙事平静呈现 (同 b82-a 分享文案标准)。
 */

import type { TransparencyMetric } from '@/lib/transparency-weekly';

/** 文案可用指标 — 只取 week 桶 (total 不进文案), 结构上排除金额 (savedUsd / co2SavedKg 不可达) */
export type WeeklyPostCopySnapshot = {
  intercepts: Pick<TransparencyMetric, 'week'>;
  hoursWon: Pick<TransparencyMetric, 'week'>;
  guards: number;
};

const POST_URL = 'https://symy.ai/transparency';
const SIGNATURE = 'Before you buy it, Symy it.';
const HASHTAGS = '#BuildInPublic #Symy';

type PostLocale = 'zh' | 'en';

const TEMPLATES: Record<PostLocale, (n: { intercepts: string; hours: string; guards: string }) => string> = {
  zh: ({ intercepts, hours, guards }) =>
    `本周 Symy 拦截了 ${intercepts} 次冲动下单，帮用户赢回 ${hours} 小时，${guards} 位守护者同行。每周数据，全部公开：\n${POST_URL}\n\n${HASHTAGS}\n${SIGNATURE}`,
  en: ({ intercepts, hours, guards }) =>
    `This week Symy intercepted ${intercepts} impulse buys and won ${hours} hours back, with ${guards} guardians alongside. Every week, all in the open:\n${POST_URL}\n\n${HASHTAGS}\n${SIGNATURE}`,
};

function fmtInt(n: number, locale: PostLocale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(
    Math.max(0, Math.round(n)),
  );
}

function fmtHours(n: number, locale: PostLocale): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, n));
}

/** locale 归一 — 页面只有 zh/en, 非中即英 */
function asPostLocale(locale: string): PostLocale {
  return locale === 'zh' ? 'zh' : 'en';
}

/** 从周报快照生成 X 发帖文案 — 纯函数, 同输入逐字节同输出 */
export function buildWeeklyPostCopy(snapshot: WeeklyPostCopySnapshot, locale: string): string {
  const l = asPostLocale(locale);
  return TEMPLATES[l]({
    intercepts: fmtInt(snapshot.intercepts.week, l),
    hours: fmtHours(snapshot.hoursWon.week, l),
    guards: fmtInt(snapshot.guards, l),
  });
}
