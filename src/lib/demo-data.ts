/**
 * Demo 数据层 — 未登录用户也能浏览完整 App 体验
 *
 * 设计原则:
 * 1. 数据真实感 — 金额、日期、平台名都要像真实用户数据
 * 2. 展示核心功能 — 每个 tab 都能展示 Symy 的核心价值
 * 3. 吸引注册 — 让用户觉得 "如果我注册了，这就是我的数据"
 *
 * 合并自 mock-data.ts — 旧的 mock 数据已统一到此处。
 */

import type { BuddyState, BuddyHealth, DreamFund } from '@/types/buddy-state';
import type { ChatMessage } from '@/types/chat-message';
import type { ImpulseEvent } from '@/lib/impulse-detector';
import { DEFAULT_HOURLY_RATE, moneyToHours } from '@/lib/freedom-time';
// 🔧 ARCH fix (Round 56 R56-Bug10): 用共享 SAVINGS_FUND_TARGET 替代硬编码 1000000
import { SAVINGS_FUND_TARGET } from '@/lib/buddy-defaults';

/** Translation function shape used by localized helpers */
export type TFn = (key: string, values?: Record<string, string | number>) => string;

// ====== Demo Notification Types (from mock-data.ts) ======

export interface TikTokShopNotification {
  id: string;
  platform: string;
  item: string;
  amount: number;
  category: string;
  isLivestream: boolean;
  isFlashSale: boolean;
  timestamp: Date;
  thumbnail: string;
  isGreenPick?: boolean;
  altSuggestion?: string;
  type?: 'guardian-story';
}

interface DemoItem {
  item: string;
  amount: number;
  category: string;
  thumbnail: string;
  isGreenPick?: boolean;
  altSuggestion?: string;
}

export const DEMO_GREEN_ITEMS: DemoItem[] = [
  { item: 'Organic Cotton Canvas Tote', amount: 24.99, category: 'Fashion & Accessories', thumbnail: '👜', isGreenPick: true },
  { item: 'Secondhand Picture Storybooks (4-pack)', amount: 12.50, category: 'Books & Media', thumbnail: '📚', isGreenPick: true },
  { item: 'Borosilicate Glass Meal Prep Containers', amount: 29.99, category: 'Kitchen & Dining', thumbnail: '🫙', isGreenPick: true },
  { item: 'Bicycle Repair Tool Kit', amount: 34.99, category: 'Tools & Repair', thumbnail: '🔧', isGreenPick: true },
  { item: 'Bamboo Toothbrush Set (4-pack)', amount: 9.99, category: 'Personal Care', thumbnail: '🦷', isGreenPick: true },
  { item: 'Refillable Shampoo & Body Wash Set', amount: 19.99, category: 'Personal Care', thumbnail: '🧴', isGreenPick: true },
  { item: 'Recycled Wool Socks', amount: 14.99, category: 'Fashion & Accessories', thumbnail: '🧦', isGreenPick: true },
  { item: 'Compostable Dish Sponges (6-pack)', amount: 7.99, category: 'Household Essentials', thumbnail: '🧽', isGreenPick: true },
  { item: 'Solid Wood Cutting Board', amount: 27.50, category: 'Kitchen & Dining', thumbnail: '🪵', isGreenPick: true },
  { item: 'Organic Linen Pillowcases', amount: 39.99, category: 'Home Decor', thumbnail: '🛏️', isGreenPick: true },
];

export const DEMO_IMPULSE_ITEMS: DemoItem[] = [
  { item: 'LED Strip Lights 32ft RGB', amount: 12.99, category: 'Home Decor', thumbnail: '💡', altSuggestion: 'Try warm LED bulbs you already own' },
  { item: 'Mini Projector HD 1080p', amount: 89.99, category: 'Novelty Items', thumbnail: '📽️', altSuggestion: 'Borrow one for movie night first' },
  { item: 'Kawaii Sticker Pack 100pc', amount: 6.99, category: 'Collectibles', thumbnail: '⭐', altSuggestion: 'Make one page of digital favorites' },
  { item: 'Portable Blender USB', amount: 19.99, category: 'Fitness Gadgets', thumbnail: '🥤', altSuggestion: 'Use the blender already in your kitchen' },
  { item: 'Moon Lamp 3D Printed 7"', amount: 22.99, category: 'Novelty Items', thumbnail: '🌙', altSuggestion: 'Keep the night-light you already love' },
  { item: 'Anime Figure Collection', amount: 45.99, category: 'Collectibles', thumbnail: '🎭', altSuggestion: 'Add it to a 7-day wish list first' },
  { item: 'Smart Watch Fitness Tracker', amount: 49.99, category: 'Fitness Gadgets', thumbnail: '⌚', altSuggestion: 'Take three walks with your phone first' },
  { item: 'Oversized Hoodie Pastel', amount: 34.99, category: 'Fashion & Accessories', thumbnail: '🧥', altSuggestion: 'Check a secondhand shop first' },
];

const TIKTOK_ITEMS: DemoItem[] = [...DEMO_GREEN_ITEMS, ...DEMO_IMPULSE_ITEMS];

export type GuardianStoryNotification = TikTokShopNotification & {
  type: 'guardian-story';
  savedHours: number;
  hourlyRate: number;
};

export const GUARDIAN_STORY_INTERVAL = 4;

export function generateGuardianStoryNotification(): GuardianStoryNotification {
  const itemData = DEMO_IMPULSE_ITEMS[Math.floor(Math.random() * DEMO_IMPULSE_ITEMS.length)];

  return {
    id: `guardian-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'guardian-story',
    platform: 'TikTok Shop',
    item: itemData.item,
    amount: itemData.amount,
    category: itemData.category,
    isLivestream: true,
    isFlashSale: false,
    timestamp: new Date(),
    thumbnail: '🐘',
    altSuggestion: itemData.altSuggestion,
    savedHours: moneyToHours(itemData.amount, DEFAULT_HOURLY_RATE),
    hourlyRate: DEFAULT_HOURLY_RATE,
  };
}

export function generateRandomNotification(): TikTokShopNotification {
  const itemData = TIKTOK_ITEMS[Math.floor(Math.random() * TIKTOK_ITEMS.length)];
  const isLivestream = Math.random() > 0.5;
  const isFlashSale = Math.random() > 0.6;

  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    platform: 'TikTok Shop',
    item: itemData.item,
    amount: itemData.amount,
    category: itemData.category,
    isLivestream,
    isFlashSale,
    timestamp: new Date(),
    thumbnail: itemData.thumbnail,
    isGreenPick: itemData.isGreenPick,
    altSuggestion: itemData.altSuggestion,
  };
}

// ====== Demo Quick Replies (chat-tab uses these) ======
export const QUICK_REPLIES = [
  "I feel regret 😔",
  "Bought it on livestream",
  "Just clicked without thinking",
  "I don't really need it",
  "Help me refund this",
];

/** Localized version of QUICK_REPLIES */
export function getLocalizedQuickReplies(t: TFn): string[] {
  // 🔧 F4 fix: 重新设计快捷回复分类 — 分为"我买了"和"我没买"两组
  //   旧代码: 5 个混杂语境的回复 (过去行为 + 当前商品), 用户不知该选哪个
  //   新代码: 4 个清晰分类的回复 (2个"买了" + 2个"没买"), 用户快速表达挑战结果
  return [
    t('demo.quickReplies.boughtIt'),
    t('demo.quickReplies.boughtImpulse'),
    t('demo.quickReplies.resisted'),
    t('demo.quickReplies.dontNeed'),
  ];
}

// ====== Demo Buddy State ======
// 🔧 V3-8 fix: demo level 从 5 → 2, 与新用户一致, 避免注册后"我的 Symy 比 Alex 的差"落差感
//   保留其他 demo 数据 (dream funds/vitality/streak) 展示功能, 但 level 与新人一致
export const DEMO_BUDDY_STATE: BuddyState = {
  vitality: 85,
  tokens: 30,
  health: 'thriving' as BuddyHealth,
  level: 2,
  xp: 47,
  xpToNext: 130,
  streak: 1,
  dreamFunds: [
    // 🔧 P1-K-1 fix: Demo 展示更真实的斩杀线场景 ($12,000 信用卡债务, 已还 $1,200)
    { id: 'df-1', name: 'Credit Card Payoff', target: 12000, current: 1200, emoji: '💳' },
    // 🔧 BUG-199 fix: 对齐 buddy-defaults.ts 的 target ($5000) 和 emoji (🏔️)
    { id: 'df-2', name: 'Iceland Trip', target: 5000, current: 1260, emoji: '🏔️' },
    // 🔧 Bug 7 根因修复: 添加 Savings 溢出基金 (与 buddy-defaults.ts 一致)
    // 🔧 ARCH fix (Round 56 R56-Bug10): 用共享 SAVINGS_FUND_TARGET (与 buddy-defaults 一致)
    { id: 'df-savings', name: 'Savings', target: SAVINGS_FUND_TARGET, current: 0, emoji: '🏦' },
  ] as DreamFund[],
  badges: ['impulse_shield'],
  totalSaved: 487.50,
  challengesCompleted: 12,
  // 🔧 BUG-273 fix: 添加 lastHealingKitAt 字段，匹配 BuddyState 接口
  lastHealingKitAt: null,
  version: 0,
  // P1-5: 宠物陪伴感与个性成长系统 demo 值
  growthStage: 'baby',
  personality: 'unknown',
  intimacy: 15,
  dailyNeeds: { clarity: 80, connection: 70 },
  proactiveMessages: [],
  personalityAwakenedAt: null,
  lastActiveAt: null,
};

// ====== Demo Chat Messages ======
// Demo messages follow the elephant tone: warmly celebrate guarded choices without shame.
export const DEMO_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'demo-1',
    role: 'assistant',
    content: "7 days of you holding the gate — Symy is so proud 🐘✨",
    timestamp: new Date(Date.now() - 3600000 * 4),
  },
  {
    id: 'demo-2',
    role: 'user',
    content: "I almost bought a $89 mini projector on TikTok just now... but I stopped myself!",
    timestamp: new Date(Date.now() - 3600000 * 3.8),
  },
  {
    id: 'demo-3',
    role: 'assistant',
    content: "$89 = 4.5 hours of your life, and you paused before paying. That money could sail toward Iceland instead. Symy trumpets! 🐘🎉",
    reasoning: 'User resisted a purchase. Elephant tone: brief sincere celebration + where the money could go. Freedom translation: $89 ÷ $20/hr = 4.45 hours.',
    timestamp: new Date(Date.now() - 3600000 * 3.6),
  },
  {
    id: 'demo-4',
    role: 'user',
    content: "Just late night scrolling... I almost clicked buy but then I thought about my Iceland trip fund",
    timestamp: new Date(Date.now() - 3600000 * 3.4),
  },
  {
    id: 'demo-5',
    role: 'assistant',
    content: "Late-night scrolling put it in your head — and you still paused. That's $89 sailing toward Iceland. One guarded choice at a time 🐘",
    timestamp: new Date(Date.now() - 3600000 * 3.2),
  },
];

export function getLocalizedDemoChatMessages(t: TFn): ChatMessage[] {
  return [
    {
      id: 'demo-1',
      role: 'assistant',
      content: t('demo.chatHistory.streak'),
      timestamp: new Date(Date.now() - 3600000 * 4),
    },
    {
      id: 'demo-2',
      role: 'user',
      content: t('demo.chatHistory.projectorUser'),
      timestamp: new Date(Date.now() - 3600000 * 3.8),
    },
    {
      id: 'demo-3',
      role: 'assistant',
      content: t('demo.chatHistory.projectorAssistant'),
      timestamp: new Date(Date.now() - 3600000 * 3.6),
    },
    {
      id: 'demo-4',
      role: 'user',
      content: t('demo.chatHistory.lateNightUser'),
      timestamp: new Date(Date.now() - 3600000 * 3.4),
    },
    {
      id: 'demo-5',
      role: 'assistant',
      content: t('demo.chatHistory.lateNightAssistant'),
      timestamp: new Date(Date.now() - 3600000 * 3.2),
    },
  ];
}

// ====== Demo Impulse Events (for Insights tab) ======
export const DEMO_IMPULSE_EVENTS: ImpulseEvent[] = [
  {
    id: 'demo-evt-1',
    platform: 'TikTok Shop',
    item: 'LED Strip Lights 32ft RGB',
    amount: 12.99,
    timestamp: new Date(Date.now() - 3600000 * 2),
    category: 'Home Decor',
    isLivestream: true,
    isFlashSale: true,
    impulseScore: 75,
    reasons: ['Late night purchase (22:00-06:00)', 'Flash sale detected', 'Impulsive category: Home Decor'],
  },
  {
    id: 'demo-evt-2',
    platform: 'Amazon',
    item: 'Wireless Earbuds Pro Max',
    amount: 29.99,
    timestamp: new Date(Date.now() - 3600000 * 6),
    category: 'Phone Accessories',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 35,
    reasons: ['Impulsive category: Phone Accessories'],
  },
  {
    id: 'demo-evt-3',
    platform: 'SHEIN',
    item: 'Summer Dress Collection',
    amount: 45.50,
    timestamp: new Date(Date.now() - 3600000 * 12),
    category: 'Fashion & Accessories',
    isLivestream: true,
    isFlashSale: true,
    impulseScore: 68,
    reasons: ['Flash sale detected', 'Impulsive category: Fashion', 'Livestream purchase'],
  },
  {
    id: 'demo-evt-4',
    platform: 'Temu',
    item: 'Portable Blender USB-C',
    amount: 19.99,
    timestamp: new Date(Date.now() - 3600000 * 24),
    category: 'Fitness Gadgets',
    isLivestream: false,
    isFlashSale: false,
    impulseScore: 25,
    reasons: ['Impulsive category: Fitness Gadgets'],
  },
  {
    id: 'demo-evt-5',
    platform: 'Target',
    item: 'Oversized Hoodie Pastel',
    amount: 34.99,
    timestamp: new Date(Date.now() - 3600000 * 48),
    category: 'Fashion & Accessories',
    isLivestream: true,
    isFlashSale: true,
    impulseScore: 55,
    reasons: ['Flash sale detected', 'Impulsive category: Fashion', 'Livestream purchase'],
  },
];

// ====== Demo Stats (for Insights tab) ======
export const DEMO_STATS = {
  totalEvents: 47,
  impulseInterventions: 23,
  moneySaved: 487.50,
  daysStreak: 7,
};

// ====== Demo Quick Replies ======
export const DEMO_QUICK_REPLIES = [
  "I almost bought something...",
  "Help me think before I buy",
  "I resisted the inducement! 🎉",
  "I regret a purchase 😔",
  "What's my spending pattern?",
];

/** Localized version of DEMO_QUICK_REPLIES */
export function getLocalizedChatQuickReplies(t: TFn): string[] {
  return [
    t('demo.chatQuickReplies.almostBought'),
    t('demo.chatQuickReplies.helpThink'),
    t('demo.chatQuickReplies.resisted'),
    t('demo.chatQuickReplies.regretPurchase'),
    t('demo.chatQuickReplies.spendingPattern'),
  ];
}

// ====== Demo AI Response — 模拟 AI 回复（不调用真实 API）======
export const DEMO_AI_RESPONSES: Record<string, string> = {
  default: "Symy sees the choice in front of you — sign up and we'll guard it together.",
  impulse: "Symy saw the purchase, and we can track what it really cost. Sign up to see the pattern.",
  resist: "You paused — Symy is proud. Sign up to keep guarding what matters.",
  refund: "You returned it — that's a guarded win. Sign up to track every save.",
  pattern: "Late-night scrolling and livestream FOMO are guardable moments. Sign up to see your own.",
};

/** Localized version of DEMO_AI_RESPONSES */
export function getLocalizedDemoAIResponses(t: TFn): Record<string, string> {
  return {
    default: t('demo.aiResponses.default'),
    impulse: t('demo.aiResponses.impulse'),
    resist: t('demo.aiResponses.resist'),
    refund: t('demo.aiResponses.refund'),
    pattern: t('demo.aiResponses.pattern'),
    bnpl: t('demo.aiResponses.bnpl'),
    // 🔧 P0-5 fix: Demo 模式挑战中后续消息的 fallback 回复 (避免复读第一次的"item + price + hours")
    //   旧代码: getDemoChallengeReply fallback 路径不区分第一次 vs 后续, 都返回同样的 "iPhone 17 Pro. $1099. 55 hours..." → 用户感到被忽略
    //   修复: isFollowUp=true 时走这些回复, 承认情绪 + 引导 sign up, 不复读
    challengeFollowUp: t('demo.aiResponses.challengeFollowUp'),
    challengeFollowUpWant: t('demo.aiResponses.challengeFollowUpWant'),
    challengeFollowUpFriends: t('demo.aiResponses.challengeFollowUpFriends'),
    challengeFollowUpNeed: t('demo.aiResponses.challengeFollowUpNeed'),
  };
}

/** Localized version of demo dream funds */
export function getLocalizedDreamFunds(t: TFn): DreamFund[] {
  return [
    // 🔧 P1-K-1 fix: Demo 展示更真实的斩杀线场景 ($12,000 信用卡债务, 已还 $1,200)
    { id: 'df-1', name: t('demo.dreamFunds.creditCardPayoff'), target: 12000, current: 1200, emoji: '💳' },
    { id: 'df-2', name: t('demo.dreamFunds.icelandTrip'), target: 5000, current: 1260, emoji: '🏔️' },
    // 🔧 Bug 7 根因修复: 添加 Savings 溢出基金 (与 buddy-defaults.ts 一致)
    { id: 'df-savings', name: t('demo.dreamFunds.savings', { defaultValue: 'Savings' }), target: SAVINGS_FUND_TARGET, current: 0, emoji: '🏦' },
  ];
}

// Default seed fund ids whose names should be localized for display. User-created
// funds keep their original name. BUG-003/004: seed names ("Credit Card Payoff",
// "Iceland Trip") were English even on /zh because the DB seeds English defaults.
const DEFAULT_FUND_NAME_KEY: Record<string, string> = {
  'df-1': 'demo.dreamFunds.creditCardPayoff',
  'df-2': 'demo.dreamFunds.icelandTrip',
  'df-savings': 'demo.dreamFunds.savings',
};

/**
 * Localize the names of default seed dream funds by id for real users.
 * Funds whose id isn't a known default (i.e. user-created) are left untouched.
 */
export function localizeDefaultDreamFunds(funds: DreamFund[], t: TFn): DreamFund[] {
  return funds.map(f => {
    const key = DEFAULT_FUND_NAME_KEY[f.id];
    return key ? { ...f, name: t(key, { defaultValue: f.name }) } : f;
  });
}

/**
 * Localized demo buddy state — same as DEMO_BUDDY_STATE but with translated dream fund names.
 * 🔧 BUG-5 fix (i18n): page.tsx uses this instead of raw DEMO_BUDDY_STATE so demo dream funds
 *   show in the user's locale (e.g. "信用卡还款" instead of "Credit Card Payoff").
 */
export function getDemoBuddyState(t: TFn): BuddyState {
  return {
    ...DEMO_BUDDY_STATE,
    dreamFunds: getLocalizedDreamFunds(t),
  };
}
