/**
 * guard-profile-export — 守护档案导出文本 (batch58-b)
 *
 * 设置页「守护档案」区块的纯函数 SSOT: 把散落各处的守护配置
 * (48-a 强度 / 53-b 范围 / 49-a 深夜时段 / 51-b 时薪) 与 health_events
 * 三轨聚合成果拼成两份可复制文本:
 *   - 完整版 (fullText): 含金额与配置全貌, 仅用户自见 (app 内预览+复制)。
 *   - 分享版 (shareText): 结构性 amount-free — 只有次数/小时/天数/风格名,
 *     文案以小象第一人称, 非羞辱。由类型保证: 分享文本 builder 的入参
 *     类型上无金额字段 (红线测试锁定输出无货币符号/金额)。
 *
 * 口径红线:
 * - 设置输入收 localStorage 原始值 (unknown), 内部逐项 normalize 降级
 *   (53-b 思路): 强度→balanced / 范围→全默认 guard / 深夜→standard /
 *   时薪非法→共享通道默认 (禁内联第二个默认时薪, batch51-b 教训)。
 * - 成果聚合复用 58-a aggregateGuardMoments (计数/活跃天/累计省钱) +
 *   56-c aggregateGuardStyleProfile (风格名/连续风格天数), 不重复实现口径。
 * - 样本不足 (<5, 沿 56-c GUARD_STYLE_MIN_SAMPLE_SIZE) → status='insufficient':
 *   只导出配置部分, 统计区给 warm 提示, 不造伪数据。
 * - 守护自由小时只经 freedom-time 共享通道换算 (moneyToHours/formatFreedomTime)。
 * - 纯函数 / 零 IO / 零 DDL; locale 感知标签内联 (zh/en), 不依赖 i18n hook。
 */

import { DEFAULT_HOURLY_RATE, formatFreedomTime, moneyToHours } from '@/lib/freedom-time';
import { normalizeGuardIntensity, type GuardIntensity } from '@/lib/guard-intensity';
import {
  GUARD_SCOPE_CATEGORIES,
  normalizeGuardScope,
  type GuardScope,
} from '@/lib/guard-scope';
import {
  NIGHT_WINDOW_OPTIONS,
  normalizeNightWindow,
  type NightWindowPreset,
} from '@/lib/night-window';
import { aggregateGuardMoments } from '@/lib/guard-moments';
import {
  aggregateGuardStyleProfile,
  GUARD_STYLE_MIN_SAMPLE_SIZE,
  type GuardStyleId,
  type GuardStyleEventInput,
} from '@/lib/guard-style-profile';
import {
  buildGuardLedgerEvidence,
  type GuardEvidenceEventInput,
  type GuardEvidenceSource,
} from '@/lib/guard-ledger-provenance';

/** 导出输入 — 设置项收原始值 (localStorage 里的 unknown), 内部 normalize */
export interface GuardProfileExportInput {
  /** 'zh' | 'en' — 决定文本语言 (纯函数, 不依赖 i18n hook) */
  locale: string;
  /** localStorage 'symy-guard-intensity' 原始值 */
  rawIntensity?: unknown;
  /** localStorage 'symy-guard-scope' 原始值 (对象或 JSON 字符串) */
  rawScope?: unknown;
  /** localStorage 'symy-night-window' 原始值 */
  rawNightWindow?: unknown;
  /** 用户时薪; 非法/缺失回落共享通道默认 */
  hourlyRate?: number;
  /** health_events 原始事件 (challenge_completed + mindful_recovery) */
  events?: GuardStyleEventInput[] | null;
  /** evidence events may contain a broader read-only health_events subset */
  evidenceEvents?: GuardEvidenceEventInput[] | null;
}

/** 归一后的守护配置全貌 */
export interface GuardProfileSettingsSummary {
  intensity: GuardIntensity;
  scope: GuardScope;
  nightWindow: NightWindowPreset;
  hourlyRate: number;
}

/** 成果统计的分享面形状 — 结构上无金额 (分享文本 builder 只收这个形状) */
export interface GuardProfileStatsShare {
  trackCounts: { guard: number; alt: number; reuse: number };
  /** 有行动的自然天数 */
  activeDays: number;
  /** 56-c 风格画像 id; insufficient 时调用方不渲染 */
  styleId: GuardStyleId;
  /** 连续风格天数 */
  styleStreakDays: number;
  /** 守护自由小时 (换算自金额, 但只有小时数, 无金额) */
  freedomHours: number;
}

export interface GuardProfileExport {
  /** 'insufficient' = 三轨合计 <5, 统计区降级为 warm 提示, 不造伪数据 */
  status: 'insufficient' | 'ok';
  settings: GuardProfileSettingsSummary;
  /** 分享面可用统计; insufficient 时 null */
  stats: GuardProfileStatsShare | null;
  /** App 内私享字段 — 金额只在这里, 永不进分享面 */
  privateStats: {
    /** 累计省钱估算 (Σ guard savedAmount + alt/reuse estSaved) */
    totalSavedEstimate: number;
  };
  /** private fullText-only evidence section; never included in shareText */
  evidence: ReturnType<typeof buildGuardLedgerEvidence>;
  /** 完整版文本 — 含金额, 仅用户自见 (预览 + 复制) */
  fullText: string;
  /** 分享版文本 — 结构性 amount-free, 小象第一人称 */
  shareText: string;
}

export interface GuardProfileMonthSummary {
  monthKey: string;
  intercepts: number;
}

export interface GuardProfileMoment {
  eventType: string;
  occurredAt: string;
  freedomHours: number;
}

export interface GuardProfileExportData {
  locale: string;
  exportedAt?: string | Date;
  username: string;
  avatarUrl?: string | null;
  rankName: string;
  totalIntercepts: number;
  longestStreakDays: number;
  unlockedBadges: number;
  freedomHours: number;
  months: GuardProfileMonthSummary[];
  topCategories: Array<{ name: string; count: number }>;
  greenAdoptionRate: number;
  moments: GuardProfileMoment[];
  summaryCount: number;
  summaryHours: number;
}

export interface GuardProfileSection {
  id: 'cover' | 'overview' | 'heatmap' | 'insights' | 'moments' | 'summary';
  title: string;
  lines: string[];
}

// ============ locale 内联标签 (纯函数, 不依赖 i18n hook) ============

const INTENSITY_LABELS: Record<string, Record<GuardIntensity, string>> = {
  zh: { gentle: '温和', balanced: '平衡', strict: '坚决' },
  en: { gentle: 'Gentle', balanced: 'Balanced', strict: 'Strict' },
};

const NIGHT_WINDOW_LABELS: Record<string, Record<NightWindowPreset, string>> = {
  zh: { early: '早睡型', standard: '标准型', nightOwl: '夜猫型', off: '关闭' },
  en: { early: 'Early sleeper', standard: 'Standard', nightOwl: 'Night owl', off: 'Off' },
};

const STYLE_NAME_LABELS: Record<string, Record<GuardStyleId, string>> = {
  zh: { interceptor: '沉稳派', substitutor: '替代派', reuser: '复用派', balanced: '均衡派' },
  en: { interceptor: 'The Calm One', substitutor: 'The Substitutor', reuser: 'The Reuser', balanced: 'The All-Rounder' },
};

const EVIDENCE_LABELS: Record<string, Record<GuardEvidenceSource, string>> = {
  zh: {
    auto_challenge: '自动挑战',
    chat_decision: '聊天决策',
    green_alt: '绿色替代 / 复用',
    commitment: '口头承诺',
    manual: '手动记录',
    reset_audit: '重置审计',
  },
  en: {
    auto_challenge: 'Automatic challenge',
    chat_decision: 'Chat decision',
    green_alt: 'Green alternative / reuse',
    commitment: 'Verbal commitment',
    manual: 'Manual entry',
    reset_audit: 'Reset audit',
  },
};

function isZh(locale: string): boolean {
  return locale === 'zh';
}

function scopeSummaryLine(scope: GuardScope, locale: string): string {
  const strict = GUARD_SCOPE_CATEGORIES.filter((c) => scope[c] === 'strict');
  const exempt = GUARD_SCOPE_CATEGORIES.filter((c) => scope[c] === 'exempt');
  if (strict.length === 0 && exempt.length === 0) {
    return isZh(locale) ? '全品类守护' : 'All categories guarded';
  }
  if (isZh(locale)) {
    return `${strict.length} 类加严 · ${exempt.length} 类豁免`;
  }
  return `${strict.length} stricter · ${exempt.length} exempted`;
}

function nightWindowLine(preset: NightWindowPreset, locale: string): string {
  const label = NIGHT_WINDOW_LABELS[locale === 'zh' ? 'zh' : 'en'][preset];
  const range = NIGHT_WINDOW_OPTIONS[preset].rangeLabel;
  return range ? `${label} ${range}` : label;
}

function freedomHoursLabel(hours: number, locale: string): string {
  return formatFreedomTime(Number.isFinite(hours) && hours > 0 ? hours : 0, locale);
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function eventLabel(eventType: string, locale: string): string {
  const zh = isZh(locale);
  if (eventType === 'challenge_completed') return zh ? '拦截心动' : 'Intercepted impulse';
  if (eventType === 'mindful_recovery') return zh ? '绿色替代 / 复用' : 'Green swap / reuse';
  return eventType || (zh ? '守护行动' : 'Guard action');
}

function monthLabel(monthKey: string, locale: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function momentTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function renderGuardProfileExport(
  data: GuardProfileExportData,
): { sections: GuardProfileSection[] } {
  const zh = isZh(data.locale);
  const exportedAt = data.exportedAt ? new Date(data.exportedAt) : new Date();
  const exportDate = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { dateStyle: 'long' })
    .format(Number.isNaN(exportedAt.getTime()) ? new Date() : exportedAt);
  const maxMonth = data.months.reduce((best, item) => Math.max(best, item.intercepts), 0);
  const topCategories = data.topCategories.slice(0, 3);
  const moments = data.moments.slice(0, 3);

  return {
    sections: [
      {
        id: 'cover',
        title: zh ? '守护档案' : 'Guard Profile',
        lines: [
          data.rankName,
          data.username,
          zh ? `导出日期：${exportDate}` : `Exported on ${exportDate}`,
        ],
      },
      {
        id: 'overview',
        title: zh ? '守护战绩总览' : 'Guard Wins Overview',
        lines: [
          zh ? `累计拦截：${data.totalIntercepts} 次` : `Total intercepts: ${data.totalIntercepts}`,
          zh ? `最长连续守护：${data.longestStreakDays} 天` : `Longest guard streak: ${data.longestStreakDays} days`,
          zh ? `已解锁勋章：${data.unlockedBadges} 枚` : `Badges unlocked: ${data.unlockedBadges}`,
          zh ? `总守护金额：${freedomHoursLabel(data.freedomHours, data.locale)}自由时间` : `Total guarded: ${freedomHoursLabel(data.freedomHours, data.locale)} of free time`,
        ],
      },
      {
        id: 'heatmap',
        title: zh ? '月度热力图摘要' : 'Monthly Heatmap Summary',
        lines: data.months.length
          ? [
              ...data.months.map((month) => `${monthLabel(month.monthKey, data.locale)} · ${month.intercepts}`),
              zh ? `最高单月：${maxMonth} 次` : `Best month: ${maxMonth} intercepts`,
            ]
          : [zh ? '还没有月度守护记录。' : 'No monthly guard records yet.'],
      },
      {
        id: 'insights',
        title: zh ? '消费洞察' : 'Spending Insights',
        lines: [
          topCategories.length
            ? `${zh ? '高频品类 Top 3' : 'Top 3 categories'}: ${topCategories.map((item) => `${item.name} × ${item.count}`).join(' · ')}`
            : zh ? '高频品类：暂无足够记录' : 'Top categories: not enough records yet',
          zh ? `最优替换策略：绿色替代采纳率 ${percent(data.greenAdoptionRate)}` : `Best swap strategy: green swap adoption ${percent(data.greenAdoptionRate)}`,
          zh ? `省时总计：${freedomHoursLabel(data.freedomHours, data.locale)}` : `Total time saved: ${freedomHoursLabel(data.freedomHours, data.locale)}`,
        ],
      },
      {
        id: 'moments',
        title: zh ? '最值时刻' : 'Most Valuable Moments',
        lines: moments.length
          ? moments.map((moment) => `${eventLabel(moment.eventType, data.locale)} · ${momentTime(moment.occurredAt, data.locale)} · ${freedomHoursLabel(moment.freedomHours, data.locale)}`)
          : [zh ? '最值时刻会随着守护记录自动出现。' : 'Valuable moments appear automatically as you guard.'],
      },
      {
        id: 'summary',
        title: zh ? '底部总结' : 'Closing Summary',
        lines: [
          zh
            ? `你过去 6 个月守护了 ${data.summaryCount} 次，相当于省出 ${freedomHoursLabel(data.summaryHours, data.locale)}自由时间。`
            : `Over the past 6 months, you guarded ${data.summaryCount} times and won back ${freedomHoursLabel(data.summaryHours, data.locale)} of free time.`,
        ],
      },
    ],
  };
}

/**
 * 配置区文本行 — 时薪是金额数字, 只进完整版 (includeRate=true);
 * 分享版结构性 amount-free, 不带时薪行。
 */
function settingsLines(
  settings: GuardProfileSettingsSummary,
  locale: string,
  includeRate: boolean,
): string[] {
  const zh = isZh(locale);
  const labels = INTENSITY_LABELS[zh ? 'zh' : 'en'];
  const lines = [
    zh
      ? `守护强度：${labels[settings.intensity]}`
      : `Guard intensity: ${labels[settings.intensity]}`,
    zh
      ? `守护范围：${scopeSummaryLine(settings.scope, locale)}`
      : `Guard scope: ${scopeSummaryLine(settings.scope, locale)}`,
    zh
      ? `深夜时段：${nightWindowLine(settings.nightWindow, locale)}`
      : `Late-night hours: ${nightWindowLine(settings.nightWindow, locale)}`,
  ];
  if (includeRate) {
    lines.push(zh ? `时薪：$${settings.hourlyRate}/小时` : `Hourly rate: $${settings.hourlyRate}/hr`);
  }
  return lines;
}

/**
 * 分享版文本 builder — 入参类型上无金额 (结构性 amount-free):
 * 只收设置摘要 + GuardProfileStatsShare (次数/小时/天数/风格名)。
 * 文案以小象第一人称, 非羞辱框架。
 */
export function buildGuardProfileShareText(
  settings: GuardProfileSettingsSummary,
  stats: GuardProfileStatsShare | null,
  locale: string,
): string {
  const zh = isZh(locale);
  const lines: string[] = [];
  lines.push(zh ? '🐘 我和主人的守护档案' : '🐘 My human\u2019s guard profile, by me');
  lines.push(...settingsLines(settings, locale, false).map((l) => `· ${l}`));

  if (!stats) {
    lines.push(
      zh
        ? '成果还在路上——等我们再一起守护几次（满 5 次），这里会自动补全 🐘'
        : 'Our wins are still on the way — after 5 guard actions together this part fills itself in 🐘',
    );
    lines.push(zh ? '—— 小象 Symy' : '— Symy the elephant');
    return lines.join('\n');
  }

  const { trackCounts, styleId, styleStreakDays, activeDays, freedomHours } = stats;
  const styleName = STYLE_NAME_LABELS[zh ? 'zh' : 'en'][styleId];
  const hoursLabel = formatFreedomTime(freedomHours, locale);
  if (zh) {
    lines.push(
      `· 我陪主人拦下了 ${trackCounts.guard} 次心动，找到 ${trackCounts.alt} 次绿色替代，复用了 ${trackCounts.reuse} 次`,
      `· 我们的守护风格是${styleName}，已经保持了 ${styleStreakDays} 天`,
      `· 一起走过了 ${activeDays} 天，赢回约 ${hoursLabel}的自由时光`,
      '—— 小象 Symy',
    );
  } else {
    lines.push(
      `· ${trackCounts.guard} impulses set down gently, ${trackCounts.alt} greener swaps, ${trackCounts.reuse} reuses — we did them together`,
      `· Our guard style is ${styleName}, held for ${styleStreakDays} days`,
      `· ${activeDays} days side by side, about ${hoursLabel} of freedom won back`,
      '— Symy the elephant',
    );
  }
  return lines.join('\n');
}

/**
 * 构建守护档案导出 (纯函数)。
 * 设置逐项 normalize 降级; 成果复用 58-a moments + 56-c style 聚合;
 * 三轨合计 <5 → insufficient, 统计区降级 warm 提示。
 */
export function buildGuardProfileExport(input: GuardProfileExportInput): GuardProfileExport {
  const locale = isZh(input.locale) ? 'zh' : 'en';
  const zh = locale === 'zh';

  const settings: GuardProfileSettingsSummary = {
    intensity: normalizeGuardIntensity(input.rawIntensity),
    scope: normalizeGuardScope(input.rawScope),
    nightWindow: normalizeNightWindow(input.rawNightWindow),
    hourlyRate:
      Number.isFinite(input.hourlyRate) && (input.hourlyRate as number) > 0
        ? (input.hourlyRate as number)
        : DEFAULT_HOURLY_RATE,
  };

  const moments = aggregateGuardMoments(input.events ?? []);
  const style = aggregateGuardStyleProfile(input.events ?? []);
  const evidence = buildGuardLedgerEvidence(input.evidenceEvents ?? input.events ?? []);
  const totalActions =
    moments.trackCounts.guard + moments.trackCounts.alt + moments.trackCounts.reuse;
  const sufficient = totalActions >= GUARD_STYLE_MIN_SAMPLE_SIZE && moments.status === 'ok';

  const stats: GuardProfileStatsShare | null = sufficient
    ? {
        trackCounts: moments.trackCounts,
        activeDays: moments.activeDays,
        styleId: style.styleId,
        styleStreakDays: style.styleStreakDays,
        freedomHours: moneyToHours(moments.totalSaved, settings.hourlyRate),
      }
    : null;

  // 完整版: 配置全貌 + 成果 + 金额 (仅用户自见)
  const fullLines: string[] = [];
  fullLines.push(zh ? '🐘 我的守护档案' : '🐘 My Guard Profile');
  fullLines.push(zh ? '—— 我的配置 ——' : '— My setup —');
  fullLines.push(...settingsLines(settings, locale, true));
  fullLines.push(zh ? '—— 我的成果 ——' : '— My wins —');
  if (!stats) {
    fullLines.push(
      zh
        ? '成果还在路上——再积累几次守护（满 5 次），这里会自动补全 🐘'
        : 'Your wins are still on the way — after 5 guard actions this section fills itself in 🐘',
    );
  } else {
    const styleName = STYLE_NAME_LABELS[locale][stats.styleId];
    const hoursLabel = formatFreedomTime(stats.freedomHours, locale);
    if (zh) {
      fullLines.push(
        `拦截 ${stats.trackCounts.guard} 次 · 替代 ${stats.trackCounts.alt} 次 · 复用 ${stats.trackCounts.reuse} 次`,
        `守护风格：${styleName}（连续 ${stats.styleStreakDays} 天）`,
        `活跃 ${stats.activeDays} 天 · 守护自由约 ${hoursLabel}`,
        `累计省钱估算：约 $${Math.round(moments.totalSaved)}（自留参考，不进分享版）`,
      );
    } else {
      fullLines.push(
        `${stats.trackCounts.guard} intercepts · ${stats.trackCounts.alt} swaps · ${stats.trackCounts.reuse} reuses`,
        `Guard style: ${styleName} (held for ${stats.styleStreakDays} days)`,
        `${stats.activeDays} active days · about ${hoursLabel} of freedom won back`,
        `Estimated savings so far: ~$${Math.round(moments.totalSaved)} (for your eyes only — never in the share version)`,
      );
    }
  }

  fullLines.push(zh ? '—— 证据（仅自己可见）——' : '— Evidence (private) —');
  if (evidence.status === 'insufficient') {
    fullLines.push(zh ? '证据不足：还没有可解释的守护行动。' : 'Insufficient evidence: no explainable guard actions yet.');
  } else {
    for (const item of evidence.summary.filter((entry) => entry.count > 0)) {
      const label = EVIDENCE_LABELS[locale][item.source];
      const excluded = item.includedInWinCalculations
        ? ''
        : zh ? '（不进入战绩计算）' : ' (excluded from wins)';
      fullLines.push(zh ? `${label}：${item.count} 条 / ${item.days} 天${excluded}` : `${label}: ${item.count} rows / ${item.days} days${excluded}`);
    }
    for (const row of evidence.latestRows) {
      const label = EVIDENCE_LABELS[locale][row.source];
      const excluded = row.includedInWinCalculations
        ? ''
        : zh ? '（不进入战绩计算）' : ' (excluded from wins)';
      fullLines.push(`${row.date} · ${label} · ${row.subject} · ${row.category}${excluded}`);
    }
  }
  fullLines.push(
    zh
      ? '守护小时 = 全时段有效守护金额 ÷ 私人时薪；按 trigger_id 去重；本地时区。'
      : 'Guarded hours = all-time guarded amount ÷ private hourly rate; deduplicated by trigger_id; local timezone.',
  );

  return {
    status: sufficient ? 'ok' : 'insufficient',
    settings,
    stats,
    privateStats: { totalSavedEstimate: moments.totalSaved },
    evidence,
    fullText: fullLines.join('\n'),
    shareText: buildGuardProfileShareText(settings, stats, locale),
  };
}
