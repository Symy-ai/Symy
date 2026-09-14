/**
 * guard-diary — 每日守护日记生成器 (batch47-b)
 *
 * 小象替用户写的"一句话日记": 纯模板函数, 输入某日守护事件
 * (health_events challenge_reward, 与 guard_ledger 同管道的最小子集),
 * 输出一句文案 + 结构化字段。零 API / 零 Letta 调用, 零成本零延迟。
 *
 * 口径红线:
 * - estSaved (今日省下估算金额) 只存在于结构化字段, 由卡片私有展开面消费,
 *   永不进日记文案 (文案只出次数/小时), 永不进分享面。
 * - 零守护日 → 陪伴版文案: 无金额、无羞辱暗示 (不出现"没忍住"类表述)。
 * - 品类解析复用 guard-category-insight 的 resolveGuardCategory (零两套口径)。
 * - 模板轮换按日期哈希确定性选择 (同一天同数据 → 同文案, 可测试可回看)。
 */

import {
  resolveGuardCategory,
  type GuardInsightCategory,
  type GuardCategoryEventInput,
} from '@/lib/guard-category-insight';

export type GuardDiaryLocale = 'zh' | 'en';

/** 日记形态 — 按当日数据特征选择 */
export type GuardDiaryVariant = 'companion' | 'night' | 'category' | 'standard';

/** 单条守护事件的最小输入形状 (health_events camelCase 子集, 同 GuardCategoryEventInput) */
export type GuardDiaryEventInput = GuardCategoryEventInput & {
  createdAt: string;
};

/** 生成结果 — text 是面子 (零金额), estSaved 是里子 (仅私有面) */
export interface GuardDiary {
  /** 当日日期 (YYYY-MM-DD, 本地时区) */
  date: string;
  /** 日记文案 (一句, 零金额) */
  text: string;
  variant: GuardDiaryVariant;
  guardCount: number;
  /** 赢回小时数 = estSaved / hourlyRate */
  hoursReclaimed: number;
  /** 今日省下估算金额 — 仅卡片私有展开面可见, 永不进分享面 */
  estSaved: number;
  /** 深夜 (22:00–05:59 本地) 守护次数 */
  nightGuardCount: number;
  /** 今日次数最多的品类 (other 不参与; 全 other → undefined) */
  topCategory: GuardInsightCategory | undefined;
}

/** 品类展示名 (zh/en) — other 不出日记 */
const CATEGORY_NAMES: Record<Exclude<GuardInsightCategory, 'other'>, Record<GuardDiaryLocale, string>> = {
  electronics: { zh: '数码', en: 'tech' },
  clothing: { zh: '衣服', en: 'clothes' },
  beauty: { zh: '美妆', en: 'beauty' },
  home: { zh: '家居', en: 'home' },
  food: { zh: '零食', en: 'food' },
};

/** 模板库 — 每形态 2 套按日期轮换; 占位符 {count} {hours} {category} */
const TEMPLATES: Record<GuardDiaryVariant, Record<GuardDiaryLocale, string[]>> = {
  companion: {
    zh: [
      '今天没有诱惑来找你，小象陪你安静地过了一天 🐘',
      '今天风平浪静，小象在你身边打了个盹 🐘',
    ],
    en: [
      'No temptation came knocking today — your elephant kept you quiet company 🐘',
      'A calm day. Your elephant dozed off beside you 🐘',
    ],
  },
  night: {
    zh: [
      '今天深夜替你守住了 {count} 次冲动，多赚回 {hours} 小时 🐘',
      '深夜的购物车最吵，小象替你按住了 {count} 次，赚回 {hours} 小时 🐘',
    ],
    en: [
      'Late last night your elephant guarded {count} impulses for you — {hours} hours won back 🐘',
      'The midnight cart was loud, but {count} urges were gently stopped — {hours} hours reclaimed 🐘',
    ],
  },
  category: {
    zh: [
      '今天最想买的是{category}，{count} 次在点头之前停了下来，赚回 {hours} 小时 🐘',
      '今天的{category}格外心动，但你守住了 {count} 次，赢回 {hours} 小时 🐘',
    ],
    en: [
      '{category} tempted you most today — you paused {count} times before nodding, winning back {hours} hours 🐘',
      'Today\u2019s {category} pull was strong, yet your elephant helped you hold the line {count} times — {hours} hours yours again 🐘',
    ],
  },
  standard: {
    zh: [
      '今天替你守住了 {count} 次冲动，赢回 {hours} 小时属于你的时间 🐘',
      '今天 {count} 次想买的念头路过，都没有停留，赚回 {hours} 小时 🐘',
    ],
    en: [
      'Today your elephant guarded {count} impulses — {hours} hours of your life won back 🐘',
      '{count} urges passed through today and none stayed — {hours} hours reclaimed 🐘',
    ],
  },
};

/** 小时数展示 — 保留 1 位小数并去尾零 (1.5 → "1.5", 2.0 → "2") */
export function formatDiaryHours(hours: number): string {
  const rounded = Math.round((Number(hours) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 深夜判定: 本地 22:00–05:59 */
function isNightHour(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const hour = d.getHours();
  return hour >= 22 || hour < 6;
}

/** 本地日期键 YYYY-MM-DD (日记的"当日"按本地时区) */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 日期哈希 → 模板轮换索引 (确定性, 同日同形态稳定) */
function rotationIndex(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i += 1) {
    hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  }
  return hash % 2;
}

/**
 * 生成某日守护日记。
 *
 * 形态选择优先级: 零守护 → companion; 有深夜守护 → night;
 * 有非 other 主品类 → category; 其余 → standard。
 * hourlyRate 非法时回退 25 (与 guard-category-insight 同默认)。
 */
export function generateGuardDiary(
  events: GuardDiaryEventInput[] | null | undefined,
  options: { locale?: GuardDiaryLocale; hourlyRate?: number; date?: string } = {},
): GuardDiary {
  const locale: GuardDiaryLocale = options.locale === 'en' ? 'en' : 'zh';
  const rate = Number.isFinite(options.hourlyRate) && (options.hourlyRate as number) > 0
    ? (options.hourlyRate as number)
    : 25;
  const date = options.date || localDateKey();
  const list = Array.isArray(events) ? events : [];

  let guardCount = 0;
  let estSaved = 0;
  let nightGuardCount = 0;
  const counts = new Map<GuardInsightCategory, number>();

  for (const e of list) {
    if (!e || typeof e.createdAt !== 'string' || !e.createdAt) continue;
    guardCount += 1;
    if (isNightHour(e.createdAt)) nightGuardCount += 1;
    const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : null;
    const category = resolveGuardCategory(meta);
    if (category !== 'other') {
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    const amount = Number(meta?.amount);
    if (Number.isFinite(amount) && amount > 0) estSaved += amount;
  }

  const hoursReclaimed = estSaved / rate;
  const topCategory = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];

  let variant: GuardDiaryVariant;
  if (guardCount === 0) {
    variant = 'companion';
  } else if (nightGuardCount > 0) {
    variant = 'night';
  } else if (topCategory) {
    variant = 'category';
  } else {
    variant = 'standard';
  }

  const template = TEMPLATES[variant][locale][rotationIndex(date)];
  const text = template
    .replaceAll('{count}', String(guardCount))
    .replaceAll('{hours}', formatDiaryHours(hoursReclaimed))
    .replaceAll(
      '{category}',
      topCategory && topCategory !== 'other' ? CATEGORY_NAMES[topCategory][locale] : '',
    );

  return { date, text, variant, guardCount, hoursReclaimed, estSaved, nightGuardCount, topCategory };
}
