/**
 * Component/unit tests for the green honor badge library (batch3-c)
 *
 * 覆盖矩阵:
 *  - 注册表不变量: ≥12 枚 / id 唯一 / 旧 6 枚 id+target+progressType 不变 (已解锁用户兼容)
 *  - 每枚勋章 en/zh 三组 i18n key 齐全 + BADGE_INFO 注册 (BadgeChip 不落灰色 fallback)
 *  - 绿色荣誉红线: 文案禁碳足迹数值 (kg/CO2/碳)
 *  - calcBadgeProgress 每个 progressType 分支 (含新增 dream_fund_funded)
 *  - 达标即解锁 (progressMet → earned), 未达标显示 N/target 进度
 *  - 分组渲染: guardian → growth → milestone 顺序
 *  - 旧 id 徽章在 badges 数组中时正常展示不丢失
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ALL_BADGES, BADGE_GROUP_ORDER, BADGE_INFO, BadgeChip } from '../constants';
import {
  EVERGREEN_STREAK_DAYS,
  MONEY_FOREST_WON_BACK_HOURS,
  DREAM_GARDENER_COMPLETED_FUNDS,
} from '../../../lib/badge-constants';
import { BadgesSection, calcBadgeProgress, isProgressTrackable } from '../badges-section';
import type { BuddyState } from '@/types/buddy-state';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

// 旧 6 枚徽章 — id / progressTarget / progressType 必须保持不变 (badges 数组数据兼容)
const LEGACY_BADGES = [
  { id: 'impulse_shield', progressTarget: 1, progressType: 'challenge_wins' },
  { id: 'first_save', progressTarget: 1, progressType: 'total_saves' },
  { id: 'streak_7', progressTarget: 7, progressType: 'streak_days' },
  { id: 'boss_slayer', progressTarget: 1, progressType: 'big_truth' },
  { id: 'rational_lawyer', progressTarget: 3, progressType: 'clear_mind_streak' },
  { id: 'dream_builder', progressTarget: 1, progressType: 'dream_fund_count' },
] as const;

// batch3-c 新增 7 枚绿色勋章
const NEW_BADGE_IDS = [
  'green_guardian_10', 'streak_guardian_30', 'quiet_night_master',
  'money_meadow_100', 'money_forest_500', 'first_dream_funded', 'dream_gardener_3',
];

function makeBuddyState(overrides: Partial<BuddyState> = {}): BuddyState {
  return {
    vitality: 80,
    tokens: 10,
    health: 'healthy',
    level: 3,
    xp: 40,
    xpToNext: 100,
    streak: 0,
    dreamFunds: [],
    badges: [],
    totalSaved: 0,
    challengesCompleted: 0,
    lastHealingKitAt: null,
    version: 1,
    growthStage: 'young',
    personality: 'unknown',
    intimacy: 10,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

// i18n mock — t 返回真实英文文案 (与 en.json 一致), 未知 key 原样返回
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.viewAll': 'View All',
        'buddy.earned': 'Seen',
        'buddy.unlockCondition': 'Unlock:',
        'buddy.progress': 'Progress',
        'buddy.notUnlockedYet': 'Not unlocked yet',
        'buddy.badgesCollection': 'Marks Collection',
        'buddy.earnBadgesDesc': 'Marks appear as you see with Symy',
        'buddy.badgeGroups.guardian': 'Guardian Marks',
        'buddy.badgeGroups.growth': 'Growth Marks',
        'buddy.badgeGroups.milestone': 'Milestone Marks',
        'buddy.badgeNames.impulse_shield': 'First Guard',
        'buddy.badgeNames.first_save': 'First Guard',
        'buddy.badgeNames.streak_7': '7 Days of Seeing',
        'buddy.badgeNames.boss_slayer': 'Big Truth',
        'buddy.badgeNames.rational_lawyer': 'Clear Mind',
        'buddy.badgeNames.dream_builder': 'Dream Builder',
        'buddy.badgeNames.light_bearer': 'Light Bearer',
        'buddy.badgeNames.green_guardian_10': 'Green Guardian',
        'buddy.badgeNames.streak_guardian_30': 'Evergreen Guardian',
        'buddy.badgeNames.quiet_night_master': 'Quiet Night Keeper',
        'buddy.badgeNames.money_meadow_100': 'Money Meadow',
        'buddy.badgeNames.money_forest_500': 'Money Forest',
        'buddy.badgeNames.first_dream_funded': 'First Seed',
        'buddy.badgeNames.dream_gardener_3': 'Dream Gardener',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
  }),
}));

function openCollection(badges: string[], buddyState: BuddyState) {
  render(<BadgesSection badges={badges} buddyState={buddyState} />);
  fireEvent.click(screen.getByText('View All'));
}

// batch4-a: 「晒」入口会挂载 ShareModal — mock PNG 导出 (不发 CDN 请求) 与 api (stats/hourly-rate 不该被触发)
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: () => Promise.resolve('data:image/png;base64,AAA') }),
}));
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
apiFetchMock.mockResolvedValue({ refCode: '' });

describe('badge registry invariants (batch3-c green honor library)', () => {
  it('has at least 12 badges with unique ids', () => {
    expect(ALL_BADGES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ALL_BADGES.map((b) => b.id)).size).toBe(ALL_BADGES.length);
  });

  it('keeps legacy badge ids, targets and progressTypes intact (earned-user compatibility)', () => {
    for (const legacy of LEGACY_BADGES) {
      const def = ALL_BADGES.find((b) => b.id === legacy.id);
      expect(def, `legacy badge ${legacy.id} must stay in registry`).toBeTruthy();
      expect(def?.progressTarget).toBe(legacy.progressTarget);
      expect(def?.progressType).toBe(legacy.progressType);
    }
  });

  it('adds the 7 new green badges', () => {
    for (const id of NEW_BADGE_IDS) {
      expect(ALL_BADGES.find((b) => b.id === id), `${id} missing`).toBeTruthy();
    }
  });

  it.each(['en', 'zh'] as const)('defines names, descriptions and unlock conditions for every badge in %s', (lang) => {
    const messages = lang === 'en' ? en : zh;
    const buddy = messages.buddy as unknown as Record<string, Record<string, string>>;
    for (const badge of ALL_BADGES) {
      expect(buddy.badgeNames[badge.id], `${lang} badgeNames.${badge.id}`).toBeTruthy();
      expect(buddy.badgeDescriptions[badge.id], `${lang} badgeDescriptions.${badge.id}`).toBeTruthy();
      expect(buddy.badgeUnlock[badge.id], `${lang} badgeUnlock.${badge.id}`).toBeTruthy();
    }
  });

  it('registers every badge in BADGE_INFO so chips never fall back to the generic trophy', () => {
    for (const badge of ALL_BADGES) {
      expect(BADGE_INFO[badge.id], `BADGE_INFO.${badge.id} missing`).toBeTruthy();
    }
  });

  it('assigns every badge to a non-empty group in BADGE_GROUP_ORDER', () => {
    for (const badge of ALL_BADGES) {
      expect(BADGE_GROUP_ORDER).toContain(badge.group);
    }
    for (const group of BADGE_GROUP_ORDER) {
      expect(ALL_BADGES.filter((b) => b.group === group).length, `group ${group} empty`).toBeGreaterThan(0);
    }
  });

  it('keeps carbon-footprint numbers out of copy (green is imagery, not metrics)', () => {
    const carbonPattern = /(\d+\s*(kg|公斤)|CO2|CO₂|棵真树|kg 碳)/i;
    const buddyEn = en.buddy as unknown as Record<string, Record<string, string>>;
    const buddyZh = zh.buddy as unknown as Record<string, Record<string, string>>;
    for (const badge of ALL_BADGES) {
      for (const buddy of [buddyEn, buddyZh]) {
        expect(buddy.badgeUnlock[badge.id]).not.toMatch(carbonPattern);
        expect(buddy.badgeDescriptions[badge.id]).not.toMatch(carbonPattern);
      }
    }
  });
});

describe('calcBadgeProgress — every progressType branch', () => {
  const defFor = (progressType: string) =>
    ALL_BADGES.find((b) => b.progressType === progressType)!;

  it('returns 0 without buddyState', () => {
    expect(calcBadgeProgress(ALL_BADGES[0], null)).toBe(0);
    expect(calcBadgeProgress(ALL_BADGES[0], undefined)).toBe(0);
  });

  it('challenge_wins reads challengesCompleted (green_guardian_10)', () => {
    const def = defFor('challenge_wins');
    expect(calcBadgeProgress(def, makeBuddyState({ challengesCompleted: 10 }))).toBe(10);
    expect(calcBadgeProgress(def, makeBuddyState({ challengesCompleted: 4 }))).toBe(4);
  });

  it('total_saves reads totalSaved (money_meadow_100)', () => {
    const def = defFor('total_saves');
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 500 }))).toBe(500);
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 137 }))).toBe(137);
  });

  it('streak_days reads streak (streak_guardian_30)', () => {
    const def = defFor('streak_days');
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 30 }))).toBe(30);
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 12 }))).toBe(12);
  });

  it('dream_fund_count reads dreamFunds length (dream_builder)', () => {
    const def = defFor('dream_fund_count');
    const funds = [
      { id: 'a', name: 'A', target: 100, current: 10, emoji: '🌱' },
      { id: 'b', name: 'B', target: 100, current: 0, emoji: '🌷' },
      { id: 'c', name: 'C', target: 100, current: 50, emoji: '🎁' },
    ];
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: funds }))).toBe(3);
  });

  it('dream_fund_funded counts only funds that actually received money (first_dream_funded)', () => {
    const def = defFor('dream_fund_funded');
    const fund = (id: string, current: number) => ({ id, name: id, target: 100, current, emoji: '🌱' });
    // 三个基金只有一个真的存过钱 → 进度 1, 不是 3
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: [fund('a', 0), fund('b', 25), fund('c', 0)] }))).toBe(1);
    // 空基金不算 — "建了基金" ≠ "钱进了基金"
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: [fund('a', 0)] }))).toBe(0);
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: [] }))).toBe(0);
  });

  it('big_truth / clear_mind_streak are AI-awarded: progress 0 and not trackable', () => {
    for (const progressType of ['big_truth', 'clear_mind_streak']) {
      const def = defFor(progressType);
      expect(calcBadgeProgress(def, makeBuddyState({ challengesCompleted: 99, totalSaved: 9999 }))).toBe(0);
      expect(isProgressTrackable(progressType as 'big_truth' | 'clear_mind_streak')).toBe(false);
    }
  });
});

// ===== batch106-b (BP p19 荣誉资产): 四枚荣誉徽章判定口径 =====
describe('batch106-b — BP p19 honor badge criteria', () => {
  const defById = (id: string) => ALL_BADGES.find((b) => b.id === id)!;
  const fund = (id: string, current: number, target = 100) => ({ id, name: id, target, current, emoji: '🌱' });

  it('pins thresholds to configurable constants (BP values)', () => {
    expect(EVERGREEN_STREAK_DAYS).toBe(30);
    expect(MONEY_FOREST_WON_BACK_HOURS).toBe(100);
    expect(DREAM_GARDENER_COMPLETED_FUNDS).toBe(3);
    expect(defById('streak_guardian_30').progressTarget).toBe(EVERGREEN_STREAK_DAYS);
    expect(defById('money_forest_500').progressTarget).toBe(MONEY_FOREST_WON_BACK_HOURS);
    expect(defById('dream_gardener_3').progressTarget).toBe(DREAM_GARDENER_COMPLETED_FUNDS);
  });

  it('Evergreen Guardian boundary: 29 days not earned, 30 days earned', () => {
    const def = defById('streak_guardian_30');
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 29 }))).toBe(29);
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 30 }))).toBe(30);
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 29 }))).toBeLessThan(def.progressTarget);
    expect(calcBadgeProgress(def, makeBuddyState({ streak: 30 }))).toBeGreaterThanOrEqual(def.progressTarget);
  });

  it('Money Forest boundary: 99h not earned, 100h earned — hours, not currency', () => {
    const def = defById('money_forest_500');
    // 默认时薪 $25: 99h = 2475, 100h = 2500
    expect(def.progressType).toBe('won_back_hours');
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 2475 }))).toBe(99);
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 2475 }))).toBeLessThan(def.progressTarget);
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 2500 }))).toBe(100);
    // 亚小时向下取整 — 99.96h 显示 99, 不虚标达标
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 2499 }))).toBe(99);
    // 用户自设时薪跟随: $50/h 时 5000 才到 100h, 2475 只算 49h
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 5000 }), 50)).toBe(100);
    expect(calcBadgeProgress(def, makeBuddyState({ totalSaved: 2475 }), 50)).toBe(49);
  });

  it('Dream Gardener boundary: 2 completed funds not earned, 3 earned — completion is current ≥ target', () => {
    const def = defById('dream_gardener_3');
    expect(def.progressType).toBe('dream_fund_completed');
    const twoDone = [fund('a', 100), fund('b', 130), fund('c', 99)];
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: twoDone }))).toBe(2);
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: twoDone }))).toBeLessThan(def.progressTarget);
    const threeDone = [fund('a', 100), fund('b', 130), fund('c', 100)];
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: threeDone }))).toBe(3);
    // 恰好等于 target 算完成; 建了没走完不算; target=0 的空壳不算
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: [fund('a', 99), fund('b', 100), fund('c', 40)] }))).toBe(1);
    expect(calcBadgeProgress(def, makeBuddyState({ dreamFunds: [fund('a', 0), fund('b', 0), fund('c', 0)] }))).toBe(0);
    // 默认储蓄池 (savings) 不计入梦想基金完成 — 与 isDreamFundAchieved 权威语义一致
    expect(
      calcBadgeProgress(def, makeBuddyState({ dreamFunds: [fund('a', 100), fund('b', 100), fund('savings', 500)] }))
    ).toBe(2);
  });

  it('honest degradation: no data → progress 0, badge stays locked, no share entry', () => {
    // 纯函数层 — 数据缺失全部归 0
    expect(calcBadgeProgress(defById('money_forest_500'), null)).toBe(0);
    expect(calcBadgeProgress(defById('money_forest_500'), makeBuddyState({ totalSaved: 0 }))).toBe(0);
    expect(calcBadgeProgress(defById('dream_gardener_3'), makeBuddyState({ dreamFunds: [] }))).toBe(0);
    expect(calcBadgeProgress(defById('dream_gardener_3'), undefined)).toBe(0);

    // 组件层 — 零数据不出晒入口, 看到的是进度引导而非虚假荣誉
    openCollection(['streak_7'], makeBuddyState());
    expect(screen.queryByTestId('badge-share-money_forest_500')).toBeNull();
    expect(screen.queryByTestId('badge-share-dream_gardener_3')).toBeNull();
    expect(screen.getAllByText('0/100').length).toBeGreaterThanOrEqual(1); // meadow 与 forest 同目标值
    expect(screen.getByText('0/3')).toBeTruthy();
  });
});

describe('marks collection panel', () => {
  it('shows every trackable new badge as earned when the mock state reaches its target', () => {
    const funded = (id: string, current: number) => ({ id, name: id, target: 100, current, emoji: '🌱' });
    const high = makeBuddyState({
      challengesCompleted: 10,
      // 100h × 默认时薪 $25 = 2500 — batch106-b Money Forest 按 won_back_hours 判定
      totalSaved: 2500,
      streak: 30,
      // batch106-b Dream Gardener 按「完成」判定 — 3 个基金全部走到 target
      dreamFunds: [funded('a', 120), funded('b', 100), funded('c', 150)],
    });
    // 传入 streak_7 是因为 View All 按钮仅在已有徽章时渲染; streak_30=30 时它本就进度达标, Seen 计数不变
    openCollection(['streak_7'], high);
    // 10 枚数据达标: impulse_shield, green_guardian_10, streak_7, streak_guardian_30,
    // first_save, money_meadow_100, money_forest_500 (100h), first_dream_funded,
    // dream_builder, dream_gardener_3 (3 个完成)
    expect(screen.getAllByText('Seen')).toHaveLength(10);
    for (const name of ['Green Guardian', 'Evergreen Guardian', 'Money Forest', 'First Seed', 'Dream Gardener']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    // AI 授予型 4 枚不达标: 无 Seen 标记
    expect(screen.queryByText('Quiet Night Keeper')?.closest('div')?.textContent).not.toContain('Seen');
  });

  it('shows "current/target" progress (not shame copy) when below target', () => {
    openCollection(['streak_7'], makeBuddyState({ challengesCompleted: 4 }));
    expect(screen.getByText('4/10')).toBeTruthy(); // green_guardian_10
    expect(screen.getByText('Green Guardian')).toBeTruthy();
  });

  it('renders the three groups in order with localized titles', () => {
    openCollection(['streak_7'], makeBuddyState());
    const sections = screen.getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Guardian Marks',
      'Growth Marks',
      'Milestone Marks',
    ]);
  });

  it('keeps legacy badges visible as earned when they are in the badges array (old id compatibility)', () => {
    openCollection(['impulse_shield', 'streak_7'], makeBuddyState());
    // 零进度 mock — 这两枚只可能来自 badges 数组 (历史解锁), 必须照常展示
    // (名字同时出现在顶栏 chip 与面板卡片, 用 getAllByText)
    expect(screen.getAllByText('Seen')).toHaveLength(2);
    expect(screen.getAllByText('First Guard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('7 Days of Seeing').length).toBeGreaterThanOrEqual(1);
  });
});

describe('BadgeChip', () => {
  it('renders a new green badge with its registered emoji and localized name', () => {
    render(<BadgeChip badge="green_guardian_10" />);
    expect(screen.getByText('🌿')).toBeTruthy();
    expect(screen.getByText('Green Guardian')).toBeTruthy();
  });
});

// ===== batch4-a: 勋章晒卡入口 =====
describe('badge share entry (batch4-a)', () => {
  it('shows the share entry only on earned badges and opens the badge share card', async () => {
    openCollection(['green_guardian_10'], makeBuddyState({ challengesCompleted: 12 }));

    // 已解锁 → 「晒」入口出现
    fireEvent.click(screen.getByTestId('badge-share-green_guardian_10'));

    // ShareModal 打开且 badge 模板直接选中 (badge 卡渲染, chip 高亮)
    await waitFor(() => expect(screen.getByTestId('share-modal')).toBeTruthy());
    expect(screen.getByTestId('badge-card')).toBeTruthy();
    const chip = screen.getByTestId('template-chip-badge') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    // 已传 interceptCount → 不该触发 stats fetch (诚实降级原则不破坏)
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/challenge/stats');
  });

  it('gives locked badges positive guidance without any share entry', () => {
    openCollection(['streak_7'], makeBuddyState({ challengesCompleted: 4 }));

    // 未解锁的 green_guardian_10: 无晒入口 (荣誉非羞耻 — 晒入口只对已获得者出现)
    expect(screen.queryByTestId('badge-share-green_guardian_10')).toBeNull();
    expect(screen.queryByTestId('badge-share-money_forest_500')).toBeNull();
    // 看到的是正面引导: 解锁进度 N/target
    expect(screen.getByText('Green Guardian')).toBeTruthy();
    expect(screen.getByText('4/10')).toBeTruthy();
    expect(screen.queryByTestId('share-modal')).toBeNull();
  });
});
