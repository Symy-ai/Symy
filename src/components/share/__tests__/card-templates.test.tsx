/**
 * Component tests for share card templates (batch2-b 模板注册制 + batch4-a badge 卡 + batch5-a challenge 卡)
 *
 * 测试矩阵:
 *   - 注册表: 5 款模板 id 齐全 (intercept/streak/milestone/badge/challenge)
 *   - StreakCard: 有 streak → 大号天数; streak=0 → 鼓励态 (不出 0, 非羞耻)
 *   - MilestoneCard: 未解锁 → 期待态 N/10; 解锁 → 第 N 次守护; 全达成 → 传奇态
 *   - BadgeCard: 勋章主视觉 + 称号 + 面子统计 (progressType 映射); AI 授予型不出数字;
 *     total_saves 面子换算赢回小时, 金额永不上卡
 *   - ChallengeCard: 绿门徽记 + 挑战名 + 完成称号 + 达成祝贺 + 面子 chips;
 *     快照为 0 不出数字 (荣誉不靠数字撑)
 *   - 里程碑状态机: getMilestoneState 边界 (0/9/10/50/99/100/120)
 *   - formatHoursNumber: ≥10 取整, <10 保留 1 位, 非正数与亚小时 (<0.1h) 空串
 *   - formatShareHoursLabel: 亚小时出分钟且与 app 内 formatFreedomTime 同向 (两通道数字一致)
 *   - 红线: 所有模板所有状态渲染文本不含货币符号 (面子/里子分离)
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SHARE_TEMPLATES,
  formatHoursNumber,
  formatShareHoursLabel,
  getMilestoneState,
  getShareTemplate,
  type ShareTemplateRenderProps,
} from '../card-templates';
import { formatFreedomTime } from '@/lib/freedom-time';
import { StreakCard } from '../streak-card';
import { MilestoneCard } from '../milestone-card';
import { BadgeCard, getBadgeDisplayName } from '../badge-card';
import { ChallengeCard, getChallengeDisplayName } from '../challenge-card';
import { WeeklyCard } from '../weekly-card';
import type { BadgeDef } from '@/components/buddy/constants';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';

// Mock i18n — 固定英文字典, 缺 key 时走 defaultValue (与生产 provider 行为一致)
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        'share.dailyReport.hoursWonBack': '{hours} won back',
        'share.dailyReport.aGreenChoice': 'a green choice',
        'share.interceptMedal.wonBackLabel': 'You won back',
        'share.interceptMedal.brandTagline': 'Become a guardian with me',
        'share.streakCard.pill': 'Streak Medal',
        'share.streakCard.daysUnit': 'days',
        'share.streakCard.daysLabel': 'Consecutive guards',
        'share.streakCard.encourageTitle': 'Your streak starts today',
        'share.streakCard.encourageSub': 'Every guard grows a new leaf',
        'share.milestoneCard.pill': 'Guard Milestone',
        'share.milestoneCard.guardLabel': 'Guard #{count}',
        'share.milestoneCard.lockedEyebrow': 'Almost there',
        'share.milestoneCard.unlockHint': '{remaining} more guards to unlock',
        'share.milestoneCard.allReachedLabel': 'All milestones reached',
        'share.milestoneCard.legendLabel': 'Guard legend',
        'share.badgeCard.pill': 'Green Honor',
        'share.badgeCard.warm.guardian': 'Quietly guarded, one choice at a time.',
        'share.badgeCard.warm.growth': 'Small keepings, slowly growing into something real.',
        'share.badgeCard.warm.milestone': 'One urge noticed, then gently let pass.',
        'share.badgeCard.statGuards': '{count} guards won',
        'share.badgeCard.statDays': '{days} days in a row',
        'share.badgeCard.statDreams': '{count} dreams growing',
        'share.badgeCard.statDreamsFunded': '{count} dreams funded',
        'share.badgeCard.statHours': '{hours} hours won back in total',
        'share.badgeCard.statDreamsCompleted': '{count} dreams completed',
        'buddy.badgeNames.green_guardian_10': 'Green Guardian',
        'buddy.badgeNames.streak_7': '7 Days of Guarding',
        'buddy.badgeNames.money_forest_500': 'Money Forest',
        'buddy.badgeNames.money_meadow_100': 'Money Meadow',
        'share.template.challenge': 'Challenge Win',
        'share.challengeCard.pill': 'Guard Challenge',
        'share.challengeCard.warm': 'The gate held because you showed up. This little elephant is doing a happy trunk dance.',
        'share.template.weekly': 'Weekly Report',
        'share.weeklyCard.pill': 'Weekly Green Report',
        'share.weeklyCard.title': 'Seven days, quietly held',
        'share.weeklyCard.warm': 'This week kept showing up for you. Symy is proud to stand beside you.',
        'share.weeklyCard.hoursWonBack': '{hours} won back',
        'share.weeklyCard.guardDays': 'Days guarded',
        'share.weeklyCard.intercepts': 'Intercepts',
        'share.weeklyCard.streak': 'Streak',
        'buddy.challengeLib.challenges.daily_green_gate.title': 'Guard the green gate once today',
        'buddy.challengeLib.challenges.daily_green_gate.done': "Today's gatekeeper",
        'buddy.challengeLib.challenges.milestone_green_guardian.title': 'Ten guards strong',
        'buddy.challengeLib.challenges.milestone_green_guardian.done': 'Green Guardian',
      };
      let result = translations[key] ?? params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

const badgeDef = (over: Partial<BadgeDef> = {}): BadgeDef => ({
  id: 'green_guardian_10',
  emoji: '🌿',
  color: 'bg-green-500/10 border-green-500/20',
  unlockConditionKey: 'buddy.badgeUnlock.green_guardian_10',
  progressTarget: 10,
  progressType: 'challenge_wins',
  group: 'guardian',
  ...over,
});

const challengeDef = (over: Partial<GuardianChallenge> = {}): GuardianChallenge => ({
  id: 'daily_green_gate',
  period: 'daily',
  titleKey: 'buddy.challengeLib.challenges.daily_green_gate.title',
  descKey: 'buddy.challengeLib.challenges.daily_green_gate.desc',
  doneTitleKey: 'buddy.challengeLib.challenges.daily_green_gate.done',
  progressSource: 'today_see_it',
  target: 1,
  rewardBadgeId: 'impulse_shield',
  ...over,
});

const baseData: ShareTemplateRenderProps = {
  medal: { itemTitle: 'Air Fryer', savedCents: 8900 },
  streakDays: 12,
  interceptCount: 23,
  savedHours: 4.5,
  badgeCard: { badge: badgeDef(), progressValue: 23 },
  challengeCard: { challenge: challengeDef() },
  weeklyCard: { guardDays: 5, intercepts: 3, streakDays: 2, savedHours: 12.4 },
};

describe('card template registry', () => {
  it('exposes the eight share templates in stable order', () => {
    expect(SHARE_TEMPLATES.map((tp) => tp.id)).toEqual([
      'intercept',
      'streak',
      'milestone',
      'badge',
      'challenge',
      'weekly',
      'dream',
      'guardian-stats',
      'invite',
    ]);
  });
});

describe('WeeklyCard', () => {
  it('renders the seven-day honor fields and no money on the export surface', () => {
    const { container } = render(
      <WeeklyCard guardDays={5} intercepts={3} streakDays={2} savedHours={12.4} date="2026-09-05T10:00:00Z" />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Seven days, quietly held');
    expect(text).toContain('12 hours won back');
    expect(text).toContain('Days guarded');
    expect(text).toContain('Intercepts');
    expect(text).toContain('Streak');
    expect(text).not.toMatch(/[$¥€£]|\bUSD\b|\bCNY\b|\d+\.\d{2}\b/);
  });

  it('renders sub-hour wins as minutes (same face numbers as the app) and the green-choice fallback below 0.1h', () => {
    const { container, unmount } = render(
      <WeeklyCard guardDays={1} intercepts={1} streakDays={1} savedHours={0.14} />
    );
    expect(container.textContent).toContain('8 min won back');
    unmount();

    const tiny = render(<WeeklyCard guardDays={1} intercepts={1} streakDays={1} savedHours={0.04} />);
    expect(tiny.container.textContent).toContain('a green choice');
    expect(tiny.container.textContent).not.toContain('0.0');
  });
});

describe('StreakCard', () => {
  it('renders hours hero + big day count when streak > 0', () => {
    const { container } = render(<StreakCard savedHours={4.5} streakDays={12} />);
    expect(container.textContent).toContain('4.5 hours won back');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('days');
    expect(container.textContent).toContain('Consecutive guards');
  });

  it('shows encouraging state (no zero, no shame copy) when streak = 0', () => {
    const { container } = render(<StreakCard savedHours={4.5} streakDays={0} />);
    expect(container.textContent).toContain('Your streak starts today');
    expect(container.textContent).toContain('Every guard grows a new leaf');
    // 赢回小时英雄数字仍在
    expect(container.textContent).toContain('4.5 hours won back');
    // 不出 0 天失败态
    expect(container.textContent).not.toMatch(/\b0\b\s*days/);
  });

  it('renders localized date from ISO input', () => {
    const { container } = render(<StreakCard savedHours={4.5} streakDays={3} date="2026-09-05T10:00:00Z" />);
    expect(container.textContent).toContain('September 5, 2026');
  });

  it('renders an optional honor-only rank line and preserves the legacy output without it', () => {
    const { unmount: unmountWithoutRank } = render(<StreakCard savedHours={4.5} streakDays={12} />);
    expect(screen.queryByTestId('streak-card-rank')).toBeNull();
    expect(screen.getByTestId('streak-card')).toBeTruthy();
    unmountWithoutRank();

    render(
      <StreakCard savedHours={4.5} streakDays={12} guardRank={{ name: 'Companion Guardian', level: 2, emoji: '🤝' }} />,
    );
    expect(screen.getByTestId('streak-card-rank').textContent).toContain('Companion Guardian');
    expect(screen.getByTestId('streak-card-rank').textContent).toContain('L2');
    expect(screen.getByTestId('streak-card').textContent).not.toMatch(/[$¥€£]|\bUSD\b|\bCNY\b|\d+\.\d{2}\b/);
  });
});

describe('MilestoneCard', () => {
  it('shows anticipation state N/10 when below first milestone', () => {
    const { container } = render(<MilestoneCard savedHours={4.5} interceptCount={3} />);
    expect(container.textContent).toContain('Almost there');
    expect(container.textContent).toContain('3/10');
    expect(container.textContent).toContain('7 more guards to unlock');
    expect(container.textContent).toContain('4.5 hours won back');
  });

  it('celebrates Guard #N with next-milestone progress when unlocked', () => {
    const { container } = render(<MilestoneCard savedHours={4.5} interceptCount={23} />);
    expect(container.textContent).toContain('Guard #23');
    expect(container.textContent).toContain('23/50');
    expect(container.textContent).toContain('27 more guards to unlock');
    expect(container.textContent).not.toContain('Almost there');
  });

  it('shows legend state when all milestones reached', () => {
    const { container } = render(<MilestoneCard savedHours={4.5} interceptCount={120} />);
    expect(container.textContent).toContain('Guard #120');
    expect(container.textContent).toContain('All milestones reached');
  });

  it('renders localized date from ISO input', () => {
    const { container } = render(<MilestoneCard savedHours={4.5} interceptCount={10} date="2026-09-05T10:00:00Z" />);
    expect(container.textContent).toContain('September 5, 2026');
  });
});

describe('BadgeCard (batch4-a)', () => {
  it('renders medallion + title + face stats for an unlocked guardian badge', () => {
    const { container } = render(
      <BadgeCard badge={badgeDef()} progressValue={12} savedHours={4.5} />
    );
    expect(container.querySelector('[data-testid="badge-card"]')).toBeTruthy();
    expect(container.textContent).toContain('Green Guardian');
    expect(container.textContent).toContain('12 guards won');
    expect(container.textContent).toContain('4.5 hours won back');
    expect(container.textContent).toContain('Green Honor');
    expect(container.textContent).toContain('Quietly guarded, one choice at a time.');
  });

  it('maps progressType to the matching face stat (days / dreams)', () => {
    const streak = render(
      <BadgeCard badge={badgeDef({ id: 'streak_7', progressType: 'streak_days', progressTarget: 7, group: 'guardian' })} progressValue={9} savedHours={4.5} />
    );
    expect(streak.container.textContent).toContain('9 days in a row');
    streak.unmount();

    const dreams = render(
      <BadgeCard
        badge={badgeDef({ id: 'first_dream_funded', emoji: '🎁', progressType: 'dream_fund_funded', progressTarget: 1, group: 'growth' })}
        progressValue={2}
        savedHours={4.5}
      />
    );
    expect(dreams.container.textContent).toContain('2 dreams funded');
    expect(dreams.container.textContent).toContain('Small keepings, slowly growing into something real.');
  });

  it('shows no numeric chip for AI-awarded badges — honor without numbers, no shame', () => {
    const { container } = render(
      <BadgeCard
        badge={badgeDef({ id: 'boss_slayer', emoji: '🦉', progressType: 'big_truth', progressTarget: 1, group: 'milestone' })}
        progressValue={0}
        savedHours={4.5}
      />
    );
    expect(container.textContent).not.toContain('guards won');
    expect(container.textContent).not.toContain('days in a row');
    // 温度话与赢回小时仍在 — 没有数字也有荣誉
    expect(container.textContent).toContain('One urge noticed');
    expect(container.textContent).toContain('4.5 hours won back');
  });

  it('converts total_saves face to won-back hours — money never renders on the card', () => {
    const { container } = render(
      <BadgeCard
        badge={badgeDef({ id: 'money_meadow_100', emoji: '🌱', progressType: 'total_saves', progressTarget: 100, group: 'growth' })}
        progressValue={100}
        savedHours={20}
      />
    );
    expect(container.textContent).toContain('20 hours won back');
    // 不出任何金额痕迹 (进度值 100 是钱数, 不得出现)
    expect(container.textContent).not.toMatch(/[$¥€£]/);
    expect(container.textContent).not.toContain('100');
  });

  // batch106-b (BP p19): Money Forest / Dream Gardener 的新口径 chip — 进度本体就是面子数字
  it('shows the won-back-hours chip for Money Forest and hides it at zero (honest degradation)', () => {
    const { container } = render(
      <BadgeCard
        badge={badgeDef({ id: 'money_forest_500', emoji: '🌳', progressType: 'won_back_hours', progressTarget: 100, group: 'growth' })}
        progressValue={100}
        savedHours={100}
      />
    );
    expect(container.textContent).toContain('100 hours won back in total');
    expect(container.textContent).not.toMatch(/[$¥€£]/);

    const zero = render(
      <BadgeCard
        badge={badgeDef({ id: 'money_forest_500', emoji: '🌳', progressType: 'won_back_hours', progressTarget: 100, group: 'growth' })}
        progressValue={0}
        savedHours={0}
      />
    );
    expect(zero.container.textContent).not.toContain('hours won back in total');
  });

  it('shows the dreams-completed chip for Dream Gardener and hides it at zero', () => {
    const { container } = render(
      <BadgeCard
        badge={badgeDef({ id: 'dream_gardener_3', emoji: '🌷', progressType: 'dream_fund_completed', progressTarget: 3, group: 'growth' })}
        progressValue={3}
        savedHours={12}
      />
    );
    expect(container.textContent).toContain('3 dreams completed');

    const zero = render(
      <BadgeCard
        badge={badgeDef({ id: 'dream_gardener_3', emoji: '🌷', progressType: 'dream_fund_completed', progressTarget: 3, group: 'growth' })}
        progressValue={0}
        savedHours={0}
      />
    );
    expect(zero.container.textContent).not.toContain('dreams completed');
  });

  it('falls back to a human-readable name for unknown badge ids', () => {
    const t = (key: string) => (key === 'buddy.badgeNames.green_guardian_10' ? 'Green Guardian' : key);
    expect(getBadgeDisplayName('green_guardian_10', t)).toBe('Green Guardian');
    expect(getBadgeDisplayName('mystery_thing', t)).toBe('Mystery Thing');
  });
});

describe('ChallengeCard (batch5-a)', () => {
  it('renders gate emblem + challenge name + done title + warm line + face stats', () => {
    const { container } = render(
      <ChallengeCard challenge={challengeDef()} streakDays={12} guardsWon={23} savedHours={4.5} />
    );
    expect(container.querySelector('[data-testid="challenge-card"]')).toBeTruthy();
    expect(container.textContent).toContain('Guard the green gate once today');
    expect(container.textContent).toContain("Today's gatekeeper");
    expect(container.textContent).toContain('The gate held because you showed up');
    expect(container.textContent).toContain('23 guards won');
    expect(container.textContent).toContain('12 days in a row');
    expect(container.textContent).toContain('4.5 hours won back');
    expect(container.textContent).toContain('Guard Challenge');
  });

  it('shows no numeric chips when the completion snapshot is zero — honor without numbers', () => {
    const { container } = render(
      <ChallengeCard challenge={challengeDef()} streakDays={0} guardsWon={0} savedHours={0} />
    );
    expect(container.textContent).not.toContain('guards won');
    expect(container.textContent).not.toContain('days in a row');
    // 英雄数字走「一次绿色的选择」兜底 — 不出 0
    expect(container.textContent).toContain('a green choice');
    expect(container.textContent).not.toContain('0 guards');
    expect(container.textContent).not.toContain('0 days');
    expect(container.textContent).not.toContain('0 hours');
  });

  it('maps rewardBadgeId to the registered emblem emoji', () => {
    const { container } = render(
      <ChallengeCard challenge={challengeDef({ rewardBadgeId: 'streak_7' })} guardsWon={1} savedHours={4.5} />
    );
    const emblem = container.querySelector('[role="img"]');
    expect(emblem?.textContent).toBeTruthy();
    expect(emblem?.textContent).not.toBe('🌿'); // streak_7 的 BADGE_INFO emoji, 不是兜底叶
  });

  it('registry challenge template renders the challenge card, and renders null without data', () => {
    const rendered = render(getShareTemplate('challenge').render({ ...baseData }));
    expect(rendered.container.querySelector('[data-testid="challenge-card"]')).toBeTruthy();
    rendered.unmount();

    const empty = render(getShareTemplate('challenge').render({ ...baseData, challengeCard: undefined }));
    expect(empty.container.textContent).toBe('');
  });

  it('falls back to a human-readable name for unknown challenge title keys', () => {
    const t = (key: string) => key;
    expect(
      getChallengeDisplayName(
        challengeDef({ id: 'mystery_challenge', titleKey: 'buddy.challengeLib.challenges.mystery_challenge.title' }),
        t,
      ),
    ).toBe('Mystery Challenge');
  });
});

describe('getMilestoneState', () => {
  it('handles threshold boundaries', () => {
    expect(getMilestoneState(0)).toMatchObject({ count: 0, unlocked: false, next: 10, remaining: 10 });
    expect(getMilestoneState(9)).toMatchObject({ unlocked: false, next: 10, remaining: 1 });
    // 达到即解锁 (第 10 次守护 = 解锁时刻)
    expect(getMilestoneState(10)).toMatchObject({ count: 10, unlocked: true, next: 50, remaining: 40 });
    expect(getMilestoneState(50)).toMatchObject({ unlocked: true, next: 100, remaining: 50 });
    expect(getMilestoneState(99)).toMatchObject({ unlocked: true, next: 100, remaining: 1 });
    expect(getMilestoneState(100)).toMatchObject({ unlocked: true, next: null, remaining: 0 });
    expect(getMilestoneState(120)).toMatchObject({ count: 120, unlocked: true, next: null });
    // 脏输入防御
    expect(getMilestoneState(NaN)).toMatchObject({ count: 0, unlocked: false, next: 10 });
    expect(getMilestoneState(23.7)).toMatchObject({ count: 23 });
  });
});

describe('formatHoursNumber', () => {
  it('rounds ≥10, keeps 1 decimal below, empty for non-positive and sub-0.1h', () => {
    expect(formatHoursNumber(4.5)).toBe('4.5');
    expect(formatHoursNumber(4.45)).toBe('4.5');
    expect(formatHoursNumber(12.3)).toBe('12');
    // 亚小时边界: <0.1h 空串 (免出「0.0 小时」), 0.1h 起照常出数字
    expect(formatHoursNumber(0.04)).toBe('');
    expect(formatHoursNumber(0.09)).toBe('');
    expect(formatHoursNumber(0.1)).toBe('0.1');
    expect(formatHoursNumber(0.14)).toBe('0.1');
    expect(formatHoursNumber(0)).toBe('');
    expect(formatHoursNumber(-1)).toBe('');
    expect(formatHoursNumber(NaN)).toBe('');
  });
});

describe('formatShareHoursLabel', () => {
  it('sub-hour renders minutes, rounding the same way as the in-app formatFreedomTime', () => {
    // QA 边界观察 #4: $3.5 (0.14h) — 晒卡与 app 内同显「8 分钟」, 两通道数字一致
    expect(formatShareHoursLabel(0.14, 'zh')).toBe('8 分钟');
    expect(formatShareHoursLabel(0.14, 'en')).toBe('8 min');
    expect(formatShareHoursLabel(0.14, 'zh')).toBe(formatFreedomTime(0.14, 'zh'));
    expect(formatFreedomTime(0.14, 'zh')).toBe('8 分钟');
    // ≥1h 数字+单位与既有口径逐字一致
    expect(formatShareHoursLabel(4.5, 'en')).toBe('4.5 hours');
    expect(formatShareHoursLabel(4.5, 'zh')).toBe('4.5 小时');
    expect(formatShareHoursLabel(12.3, 'en')).toBe('12 hours');
  });

  it('falls back to empty string below 0.1h and for 0/negative/NaN', () => {
    // QA 边界观察 #5: $0.99 (0.04h) 不再出「0.0 小时」, 调用方走「一次绿色的选择」兜底
    expect(formatShareHoursLabel(0.04, 'zh')).toBe('');
    expect(formatShareHoursLabel(0.09, 'en')).toBe('');
    expect(formatShareHoursLabel(0, 'zh')).toBe('');
    expect(formatShareHoursLabel(-1, 'en')).toBe('');
    expect(formatShareHoursLabel(NaN, 'zh')).toBe('');
  });
});

describe('red line: no currency ever renders on any share card', () => {
  const states: Array<Partial<ShareTemplateRenderProps>> = [
    { streakDays: 0, interceptCount: 0 },
    { streakDays: 12, interceptCount: 3 },
    { streakDays: 30, interceptCount: 120 },
  ];

  it.each([0, 1, 2])(`template × state combo #%i renders no currency symbols`, (i) => {
    for (const tp of SHARE_TEMPLATES) {
      const { container, unmount } = render(tp.render({ ...baseData, ...states[i] } as ShareTemplateRenderProps));
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/[$¥€£]/);
      expect(text).not.toMatch(/\bUSD\b|\bCNY\b/);
      // 金额格式 (两位小数) 也不允许出现
      expect(text).not.toMatch(/\d+\.\d{2}\b/);
      unmount();
    }
  });
});
