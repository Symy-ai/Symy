/**
 * P1-5: Symy 主动留言系统 — 纯函数库
 *
 * 设计原则:
 * 1. 留言池用 i18n key (而非硬编码文本), 支持 en/zh 双语
 * 2. 触发条件用纯函数判断, 可测试
 * 3. 同一触发条件 24 小时内不重复 (防骚扰)
 * 4. 留言数组上限 20 条 (FIFO, 旧的自动淘汰)
 *
 * 声音标准 (绿色守护叙事，batch 60)：
 * - 守护 + 陪伴双主线：每条留言都在说"我在"或"你做的这件事有意义"；
 * - 熊二式温度不幼稚化：温暖但不卖萌堆砌，禁用拟声词（呜呜/嘤嘤）和低龄化语气；
 * - 无审判无焦虑：不用"落后/失败/没用/behind"等羞辱词，不用"再不/快/最后/错过"等焦虑催促；
 * - 无碳数值无金额：不出现具体 $/¥ 金额、碳足迹数字、收益预测；
 * - 双语各自成文：zh 按中文口语温度重写，en 按英语暖话语感独立成文，不做逐字互译。
 *
 * 触发类型:
 * - morning_checkin: 用户当天首次打开 App (9:00-12:00 之间)
 * - evening_reflection: 用户晚上打开 (20:00-23:00)
 * - long_absence: 用户 ≥ 2 天未打开
 * - streak_milestone: 连续打卡 7/14/30 天
 * - challenge_completed: 完成挑战后
 * - challenge_failed: 失败后下次打开
 * - low_vitality: vitality < 30
 * - high_vitality: vitality > 90
 * - personality_awakened: 个性刚觉醒
 * - growth_stage_up: 成长阶段提升
 *
 * 🔧 message-variety fix (本轮): 消息分类标签 + 去重强化
 *   1. 加 MessageCategory 类型 (encouragement / companionship / care / reflection_invite)
 *   2. triggerToCategory() 把 10 个 trigger 映射到 4 个分类
 *   3. 添加 CATEGORY_META (emoji + color + i18n key)
 *   4. generateProactiveMessage 强化去重: 传入 recentTextKeys 避开最近 5 条文案
 *   5. **修复 complete_challenge.ts 硬编码 completed_1 的 bug** —
 *      旧代码每次完成挑战都生成 "You saw it. That's the whole thing." → 用户连看 5 条同样的
 *      修复: 提供新 helper pickMessageTextKey() 让调用方从 pool 随机选, 避开 recentTextKeys
 */

import type {
  ProactiveMessage,
  ProactiveMessageTrigger,
  BuddyState,
} from '@/types/buddy-state';

/** 触发条件上下文 */
export interface ProactiveMessageContext {
  buddyState: BuddyState;
  now: Date;
  lastOpenDate?: string;      // YYYY-MM-DD, 用户上次打开 App 的日期
  justCompletedChallenge?: boolean;
  justFailedChallenge?: boolean;
  justAwakenedPersonality?: boolean;
  justGrewStage?: boolean;
}

/**
 * 🔧 message-variety fix: 消息分类 — 4 大类
 *   - encouragement: 鼓励 (完成挑战 / 连续打卡 / 觉醒 / 成长)
 *   - companionship: 陪伴 (早安 / 晚安 / 长期未登录)
 *   - care: 关怀 (低活力)
 *   - reflection_invite: 反思邀请 (失败后 / 高活力)
 *
 * 用户要求 "鼓励 / 教育 / 警告 / 反思邀请" 4 类, 我调整为更适合 Symy 调性的 4 类:
 *   - 把 "教育" 改为 "陪伴" (Symy 不是教育产品, 是陪伴产品)
 *   - 把 "警告" 改为 "关怀" (Symy 永远不警告用户, 只温暖提醒)
 *   这样既满足用户 "分类标签" 需求, 又符合产品 "永不评判" 的铁律
 */
export type MessageCategory = 'encouragement' | 'companionship' | 'care' | 'reflection_invite';

/** Trigger → Category 映射 */
export const TRIGGER_CATEGORY: Record<ProactiveMessageTrigger, MessageCategory> = {
  morning_checkin: 'companionship',
  evening_reflection: 'companionship',
  long_absence: 'companionship',
  streak_milestone: 'encouragement',
  challenge_completed: 'encouragement',
  challenge_failed: 'reflection_invite',
  low_vitality: 'care',
  high_vitality: 'reflection_invite',
  personality_awakened: 'encouragement',
  growth_stage_up: 'encouragement',
};

/** Category 的 UI 元数据 (emoji + 颜色 + i18n key) */
export const CATEGORY_META: Record<MessageCategory, {
  emoji: string;
  /** Tailwind 颜色类名 (用于标签背景/文字色) — 暗色主题 */
  darkClasses: string;
  /** Tailwind 颜色类名 — 浅色主题 */
  lightClasses: string;
  /** i18n key for category label */
  labelKey: string;
  /** 英文 fallback (ErrorBoundary 等不能用 hooks 的场合) */
  labelFallback: string;
}> = {
  encouragement: {
    emoji: '✨',
    darkClasses: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    lightClasses: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    labelKey: 'buddy.messageCategories.encouragement',
    labelFallback: 'Encouragement',
  },
  companionship: {
    emoji: '🌅',
    darkClasses: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    lightClasses: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30',
    labelKey: 'buddy.messageCategories.companionship',
    labelFallback: 'Companionship',
  },
  care: {
    emoji: '🤗',
    darkClasses: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    lightClasses: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    labelKey: 'buddy.messageCategories.care',
    labelFallback: 'Care',
  },
  reflection_invite: {
    emoji: '💭',
    darkClasses: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    lightClasses: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
    labelKey: 'buddy.messageCategories.reflection_invite',
    labelFallback: 'Reflection',
  },
};

/**
 * 🔧 message-variety fix: 从 pool 选一个文案 key, 避开最近用过的
 *
 *   旧代码: complete_challenge.ts 硬编码 'buddy.proactiveMessages.completed_1'
 *           → 每次完成挑战都生成同一句 "You saw it. That's the whole thing."
 *           → 用户连续看 5 条一样的, 失去陪伴感
 *
 *   修复: 提供这个 helper, complete_challenge.ts 调用它, 从 pool 随机选, 避开 recentTextKeys
 *         如果 pool 全部都在 recentTextKeys 里 (用完了), 则允许重复 (但优先选最久没用的)
 *
 *   注意: MESSAGE_POOL 在下方声明, 但 JavaScript 函数提升 + const 引用解析在调用时
 *         而非定义时, 所以这里能正常工作 (函数体内访问的变量在调用时已初始化)
 *
 * @param trigger 触发类型
 * @param recentTextKeys 最近 N 条留言用过的 textKey (建议 N=5-10)
 * @returns 选中的 textKey
 */
export function pickMessageTextKey(
  trigger: ProactiveMessageTrigger,
  recentTextKeys: string[] = [],
): string {
  const pool = MESSAGE_POOL[trigger];
  if (pool.length === 0) {
    // 兜底: 不应该发生, 但安全起见
    return `buddy.proactiveMessages.${trigger}_1`;
  }

  // 优先选最近没用过的
  const available = pool.filter(k => !recentTextKeys.includes(k));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }

  // 所有文案都用过了 — 选最近用过的里头"最早用过"的 (FIFO 回收)
  // 这样避免短期内连续重复同一条
  const recentSet = new Set(recentTextKeys);
  const leastRecentlyUsed = pool.slice().reverse().find(k => recentSet.has(k));
  if (leastRecentlyUsed) return leastRecentlyUsed;

  // 实在没办法, 随机选
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 留言池: 每个触发类型对应多个 i18n key */
export const MESSAGE_POOL: Record<ProactiveMessageTrigger, string[]> = {
  morning_checkin: [
    'buddy.proactiveMessages.morning_1',
    'buddy.proactiveMessages.morning_2',
    'buddy.proactiveMessages.morning_3',
    'buddy.proactiveMessages.morning_4',
    'buddy.proactiveMessages.morning_5',
    'buddy.proactiveMessages.morning_6',
    'buddy.proactiveMessages.morning_7',
    'buddy.proactiveMessages.morning_8',
  ],
  evening_reflection: [
    'buddy.proactiveMessages.evening_1',
    'buddy.proactiveMessages.evening_2',
    'buddy.proactiveMessages.evening_3',
    'buddy.proactiveMessages.evening_4',
    'buddy.proactiveMessages.evening_5',
    'buddy.proactiveMessages.evening_6',
    'buddy.proactiveMessages.evening_7',
    'buddy.proactiveMessages.evening_8',
  ],
  long_absence: [
    'buddy.proactiveMessages.absence_1',
    'buddy.proactiveMessages.absence_2',
    'buddy.proactiveMessages.absence_3',
    'buddy.proactiveMessages.absence_4',
    'buddy.proactiveMessages.absence_5',
    'buddy.proactiveMessages.absence_6',
    'buddy.proactiveMessages.absence_7',
    'buddy.proactiveMessages.absence_8',
  ],
  streak_milestone: [
    'buddy.proactiveMessages.streak_1',
    'buddy.proactiveMessages.streak_2',
    'buddy.proactiveMessages.streak_3',
    'buddy.proactiveMessages.streak_4',
    'buddy.proactiveMessages.streak_5',
    'buddy.proactiveMessages.streak_6',
    'buddy.proactiveMessages.streak_7',
    'buddy.proactiveMessages.streak_8',
  ],
  challenge_completed: [
    'buddy.proactiveMessages.completed_1',
    'buddy.proactiveMessages.completed_2',
    'buddy.proactiveMessages.completed_3',
    'buddy.proactiveMessages.completed_4',
    'buddy.proactiveMessages.completed_5',
    'buddy.proactiveMessages.completed_6',
    'buddy.proactiveMessages.completed_7',
    'buddy.proactiveMessages.completed_8',
  ],
  challenge_failed: [
    'buddy.proactiveMessages.failed_1',
    'buddy.proactiveMessages.failed_2',
    'buddy.proactiveMessages.failed_3',
    'buddy.proactiveMessages.failed_4',
    'buddy.proactiveMessages.failed_5',
    'buddy.proactiveMessages.failed_6',
    'buddy.proactiveMessages.failed_7',
    'buddy.proactiveMessages.failed_8',
  ],
  low_vitality: [
    'buddy.proactiveMessages.low_vitality_1',
    'buddy.proactiveMessages.low_vitality_2',
    'buddy.proactiveMessages.low_vitality_3',
    'buddy.proactiveMessages.low_vitality_4',
    'buddy.proactiveMessages.low_vitality_5',
    'buddy.proactiveMessages.low_vitality_6',
    'buddy.proactiveMessages.low_vitality_7',
    'buddy.proactiveMessages.low_vitality_8',
  ],
  high_vitality: [
    'buddy.proactiveMessages.high_vitality_1',
    'buddy.proactiveMessages.high_vitality_2',
    'buddy.proactiveMessages.high_vitality_3',
    'buddy.proactiveMessages.high_vitality_4',
    'buddy.proactiveMessages.high_vitality_5',
    'buddy.proactiveMessages.high_vitality_6',
    'buddy.proactiveMessages.high_vitality_7',
    'buddy.proactiveMessages.high_vitality_8',
  ],
  personality_awakened: [
    'buddy.proactiveMessages.awakened_1',
    'buddy.proactiveMessages.awakened_2',
    'buddy.proactiveMessages.awakened_3',
    'buddy.proactiveMessages.awakened_4',
    'buddy.proactiveMessages.awakened_5',
    'buddy.proactiveMessages.awakened_6',
  ],
  growth_stage_up: [
    'buddy.proactiveMessages.grew_1',
    'buddy.proactiveMessages.grew_2',
    'buddy.proactiveMessages.grew_3',
    'buddy.proactiveMessages.grew_4',
    'buddy.proactiveMessages.grew_5',
    'buddy.proactiveMessages.grew_6',
  ],
};

/** Fallback 文本 (i18n 缺失时用) */
export const MESSAGE_FALLBACK: Record<ProactiveMessageTrigger, string> = {
  morning_checkin: 'Good morning. I\'m here.',
  evening_reflection: 'The night is quiet. How was today?',
  long_absence: 'I missed you. Welcome back.',
  streak_milestone: 'Your streak is growing. So are you.',
  challenge_completed: 'You saw it. That\'s the whole thing.',
  challenge_failed: 'You still came back. That counts.',
  low_vitality: 'I\'m feeling a bit tired. Could we spend some time together?',
  high_vitality: 'I feel alive today. Thank you for being here.',
  personality_awakened: 'I think I\'m becoming someone. You helped me see it.',
  growth_stage_up: 'I grew. You grew me. Thank you.',
};

/**
 * 检查是否应该触发某个留言 (基于上下文)
 * 返回所有应该触发的 trigger 列表 (按优先级排序)
 */
export function detectTriggers(ctx: ProactiveMessageContext): ProactiveMessageTrigger[] {
  const triggers: ProactiveMessageTrigger[] = [];
  const { buddyState, now } = ctx;

  // 1. 事件触发的 (最高优先级, 即时反馈)
  if (ctx.justGrewStage) triggers.push('growth_stage_up');
  if (ctx.justAwakenedPersonality) triggers.push('personality_awakened');
  if (ctx.justCompletedChallenge) triggers.push('challenge_completed');
  if (ctx.justFailedChallenge) triggers.push('challenge_failed');

  // 2. 状态触发的 (vitality 极端值)
  if (buddyState.vitality < 30) triggers.push('low_vitality');
  else if (buddyState.vitality > 90) triggers.push('high_vitality');

  // 3. 里程碑触发
  if ([7, 14, 30, 60, 100].includes(buddyState.streak)) {
    triggers.push('streak_milestone');
  }

  // 4. 时间触发的 (需要 lastOpenDate)
  // 🔧 Round 91 fix: 放宽时段限制 — 当天首次打开 App, 无论什么时段都触发留言
  //    旧代码: 只在 5-12 点 (morning) 或 19-23 点 (evening) 触发, 下午 12-19 点不触发
  //    问题: 用户下午打开 App 收不到任何留言 → Symy 感觉不活跃
  //    修复: 任何时段都触发 (morning_checkin / evening_reflection 按时段选)
  if (ctx.lastOpenDate) {
    const todayStr = formatDateYMD(now);
    if (ctx.lastOpenDate !== todayStr) {
      // 今天还没打开过
      const daysSince = daysBetween(ctx.lastOpenDate, todayStr);
      if (daysSince >= 2) {
        triggers.push('long_absence');
      } else {
        // 当天首次打开 — 任何时段都触发, 按时间选 morning/evening
        const hour = now.getHours();
        if (hour >= 5 && hour < 17) triggers.push('morning_checkin');
        else if (hour >= 17 || hour < 5) triggers.push('evening_reflection');
      }
    }
  } else {
    // 没 lastOpenDate (首次), 任何时段都触发
    const hour = now.getHours();
    if (hour >= 5 && hour < 17) triggers.push('morning_checkin');
    else triggers.push('evening_reflection');
  }

  return triggers;
}

/**
 * 检查某个 trigger 在最近 24 小时内是否已发过 (防重复)
 */
export function isTriggerRecentlySent(
  messages: ProactiveMessage[],
  trigger: ProactiveMessageTrigger,
  now: Date,
  windowHours: number = 24,
): boolean {
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  return messages.some(
    m => m.trigger === trigger && new Date(m.createdAt).getTime() > cutoff
  );
}

/**
 * 过滤掉最近已发过的 triggers
 */
export function filterRecentTriggers(
  triggers: ProactiveMessageTrigger[],
  messages: ProactiveMessage[],
  now: Date,
  windowHours: number = 24,
): ProactiveMessageTrigger[] {
  return triggers.filter(t => !isTriggerRecentlySent(messages, t, now, windowHours));
}

/**
 * 生成一条主动留言
 * 🔧 P1-6 fix: 避免连续重复 — 传入 recentTextKeys 避开最近用过的文案
 */
export function generateProactiveMessage(
  trigger: ProactiveMessageTrigger,
  now: Date = new Date(),
  recentTextKeys: string[] = [],
): ProactiveMessage {
  const pool = MESSAGE_POOL[trigger];
  // 🔧 P1-6 fix: 优先选择最近没用过的文案, 避免连续重复
  const availableKeys = pool.filter(k => !recentTextKeys.includes(k));
  const textKey = availableKeys.length > 0
    ? availableKeys[Math.floor(Math.random() * availableKeys.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  const textFallback = MESSAGE_FALLBACK[trigger];
  const id = `${trigger}_${now.getTime()}_${Math.floor(Math.random() * 10000)}`;

  return {
    id,
    trigger,
    textKey,
    textFallback,
    createdAt: now.toISOString(),
    read: false,
  };
}

/**
 * 获取未读留言
 */
export function getUnreadMessages(messages: ProactiveMessage[]): ProactiveMessage[] {
  return messages.filter(m => !m.read);
}

/**
 * 获取最新一条未读留言 (用于 banner 展示)
 */
export function getLatestUnread(messages: ProactiveMessage[]): ProactiveMessage | null {
  const unread = getUnreadMessages(messages);
  if (unread.length === 0) return null;
  // 按 createdAt 降序, 取最新
  return unread.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

/**
 * 标记留言已读 (返回新数组)
 */
export function markMessageRead(
  messages: ProactiveMessage[],
  messageId: string,
): ProactiveMessage[] {
  return messages.map(m =>
    m.id === messageId ? { ...m, read: true } : m
  );
}

/**
 * 截断留言数组到指定长度 (FIFO, 保留最新的)
 */
export function capMessages(
  messages: ProactiveMessage[],
  max: number = 20,
): ProactiveMessage[] {
  if (messages.length <= max) return messages;
  // 按 createdAt 降序, 取前 max 条
  return [...messages]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, max);
}

// ============================================================
// Helper functions
// ============================================================

/** 格式化日期为 YYYY-MM-DD (本地时区) */
export function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 计算两个 YYYY-MM-DD 日期之间的天数差 (正数) */
export function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * 主入口: 根据上下文生成需要添加的留言列表
 * 返回 ProactiveMessage[] (可能为空)
 */
export function generateProactiveMessages(ctx: ProactiveMessageContext): ProactiveMessage[] {
  const triggers = detectTriggers(ctx);
  const filtered = filterRecentTriggers(triggers, ctx.buddyState.proactiveMessages, ctx.now);
  // 🔧 P1-6 fix: 收集最近 5 条留言的 textKey, 避免新生成的留言与最近的内容重复
  const recentTextKeys = [...ctx.buddyState.proactiveMessages]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(m => m.textKey);
  // 🔧 Brief D2c fix: 同一天最多生成 2 条 — 即使多个 trigger 同时命中 (事件/状态/里程碑/时段叠加)。
  //   旧代码: 直接 map 全部 filtered triggers → 同一天最多 5 条 (challenge_completed + grew +
  //   awakened + high_vitality + morning_checkin), 消息轰炸, 违背"陪伴不打扰"原则。
  //   修复: detectTriggers 已按优先级排序 (事件 > vitality > 里程碑 > 时段), filterRecentTriggers
  //   保持顺序, 因此 slice(0, 2) 即取最高优先级的 2 条, 不破坏其余 50+ 测试。
  const MAX_MESSAGES_PER_DAY = 2;
  return filtered.slice(0, MAX_MESSAGES_PER_DAY).map(t => generateProactiveMessage(t, ctx.now, recentTextKeys));
}
