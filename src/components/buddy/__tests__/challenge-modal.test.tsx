/**
 * batch4-b/batch6-a tests — 绿色守护挑战改版 (challenge-definitions SSOT + challenge-modal 库视图)
 *
 * 覆盖矩阵:
 *  - 内容库不变量: ≥16 条 / id 唯一 / tier 分层合法 / 奖励只指向 ALL_BADGES 已注册 id (constants 只读)
 *  - 每条挑战 en/zh 三组 i18n 齐全 (title/desc/done); 文案无羞耻词 / 禁碳足迹数值
 *  - calcChallengeProgress 每个 progressSource 分支 + null 诚实契约 (数据未知 ≠ 0)
 *  - challengeMoneyLeft 三个周期直读真实管道; 无数据返回 null (不造假金额)
 *  - 弹窗: 挑战展示 (默认库视图, 17 条 + tier 分组 + 每周主推) / 进度渲染 (N/target + 完成态) /
 *    钱行渲染 / 诚实降级 (无数据显示 "—" 且无钱行) / 原冲动表单零回归
 *  - batch6-a 专项 (轮换纯函数/旧 9 条冻结/tier 折叠) 见 challenge-rotation.test.ts
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeModal } from '../challenge-modal';
import {
  GUARDIAN_CHALLENGES,
  calcChallengeProgress,
  challengeMoneyLeft,
  pickWeeklyFeatureChallenge,
} from '../challenge-definitions';
import { ALL_BADGES, BADGE_INFO } from '../constants';
import type { BuddyState } from '@/types/buddy-state';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

// ===== i18n mock — 真实 en.json 嵌套解析 (缺失 key 原样返回 → 测试能发现漏 key) =====
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
      const resolve = (root: Record<string, unknown>, k: string): string => {
        let cur: unknown = root;
        for (const part of k.split('.')) {
          if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[part];
          } else {
            return k;
          }
        }
        return typeof cur === 'string' ? cur : k;
      };
      let out = resolve(en as unknown as Record<string, unknown>, key);
      if (out === key && values?.defaultValue) out = values.defaultValue;
      // 最小插值 ({badge} / {amount} / {n})
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          if (k !== 'defaultValue') out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return out;
    },
    locale: 'en',
  }),
}));

// weekly-review fetch 走 apiFetch — 每个 case 自行配置返回值
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// batch5-a: 晒卡弹层 (ShareModal) 的 PNG 生成 — 不发真实网络请求
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

// FreedomPreview 内部有自己的 fetch — 测试中不关心, mock 掉
vi.mock('../freedom-preview', () => ({
  FreedomPreview: () => null,
}));

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

const TODAY = '2026-09-06';

function mockWeekData(overrides: Record<string, unknown> = {}) {
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).startsWith('/api/buddy/weekly-review')) {
      return Promise.resolve({
        challengesCompleted: 2,
        totalSaved: 12.5,
        tokensEarned: 40,
        streakDays: 3,
        todayDateStr: TODAY,
        dailyBreakdown: [
          { date: '2026-09-04', count: 1, savedAmount: 9 },
          { date: '2026-09-05', count: 1, savedAmount: 0 },
          { date: TODAY, count: 1, savedAmount: 3.5 },
        ],
        ...overrides,
      });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

const enLib = (en.buddy as unknown as Record<string, never>).challengeLib as unknown as {
  challenges: Record<string, { title: string; desc: string; done: string }>;
};
const zhLib = (zh.buddy as unknown as Record<string, never>).challengeLib as unknown as typeof enLib;

describe('guardian challenge registry invariants (batch4-b)', () => {
  it('has at least 16 challenges with unique ids (batch6-a content expansion)', () => {
    expect(GUARDIAN_CHALLENGES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(GUARDIAN_CHALLENGES.map((c) => c.id)).size).toBe(GUARDIAN_CHALLENGES.length);
  });

  it('gives every challenge a valid difficulty tier (batch6-a)', () => {
    const allowedTiers = ['starter', 'regular', 'hard'];
    for (const c of GUARDIAN_CHALLENGES) {
      expect(allowedTiers, `${c.id} tier must be starter/regular/hard`).toContain(c.tier);
    }
    // 每层都有内容 — 分组展示不出现空层
    for (const tier of allowedTiers) {
      expect(GUARDIAN_CHALLENGES.some((c) => c.tier === tier), `tier ${tier} populated`).toBe(true);
    }
  });

  it('binds every challenge to a real progress source with a positive target', () => {
    const allowed: string[] = [
      'today_see_it', 'today_chat', 'week_see_it', 'week_streak_days',
      'week_money_left', 'total_see_it', 'total_money_left', 'dream_funds_funded',
    ];
    for (const c of GUARDIAN_CHALLENGES) {
      expect(allowed, `${c.id} source must be a real pipeline`).toContain(c.progressSource);
      expect(c.target, `${c.id} target`).toBeGreaterThan(0);
    }
  });

  it('points every reward at a registered BadgeDef (display-only, no new grant logic)', () => {
    for (const c of GUARDIAN_CHALLENGES) {
      const def = ALL_BADGES.find((b) => b.id === c.rewardBadgeId);
      expect(def, `${c.id} reward ${c.rewardBadgeId} must exist in ALL_BADGES`).toBeTruthy();
      expect(BADGE_INFO[c.rewardBadgeId], `${c.rewardBadgeId} needs BADGE_INFO (chip never falls back gray)`).toBeTruthy();
    }
  });

  it.each(['en', 'zh'] as const)('defines title/desc/done for every challenge in %s', (lang) => {
    const lib = lang === 'en' ? enLib : zhLib;
    for (const c of GUARDIAN_CHALLENGES) {
      const copy = lib.challenges[c.id];
      expect(copy?.title, `${lang} ${c.id}.title`).toBeTruthy();
      expect(copy?.desc, `${lang} ${c.id}.desc`).toBeTruthy();
      expect(copy?.done, `${lang} ${c.id}.done`).toBeTruthy();
    }
  });

  it('keeps shame and carbon numbers out of challenge copy (honor, not shame)', () => {
    const shamePattern = /(你不该|浪费|失败|羞耻|丢人|shouldn'?t|waste|shame|guilt trip|you failed)/i;
    const carbonPattern = /(\d+\s*(kg|公斤)|CO2|CO₂|棵真树|kg 碳)/i;
    for (const [lang, lib] of [['en', enLib], ['zh', zhLib]] as const) {
      for (const c of GUARDIAN_CHALLENGES) {
        const copy = lib.challenges[c.id];
        for (const field of ['title', 'desc', 'done'] as const) {
          expect(copy[field], `${lang} ${c.id}.${field} shame check`).not.toMatch(shamePattern);
          expect(copy[field], `${lang} ${c.id}.${field} carbon check`).not.toMatch(carbonPattern);
        }
      }
    }
  });
});

describe('calcChallengeProgress — real pipelines and the null contract', () => {
  const defFor = (id: string) => GUARDIAN_CHALLENGES.find((c) => c.id === id)!;

  it('returns null — never fake 0 — when the source pipeline is unknown', () => {
    expect(calcChallengeProgress(defFor('daily_green_gate'), {})).toBeNull();
    expect(calcChallengeProgress(defFor('daily_elephant_chat'), {})).toBeNull();
    expect(calcChallengeProgress(defFor('weekly_three_guards'), { week: null })).toBeNull();
    expect(calcChallengeProgress(defFor('milestone_first_guard'), { buddyState: null })).toBeNull();
  });

  it('today_see_it reads the challenge/limit count; today_chat reads dailyTasks.chatted', () => {
    expect(calcChallengeProgress(defFor('daily_green_gate'), { todaySeeItCount: 2 })).toBe(2);
    expect(calcChallengeProgress(defFor('daily_green_gate'), { todaySeeItCount: 0 })).toBe(0);
    expect(calcChallengeProgress(defFor('daily_elephant_chat'), { chattedToday: true })).toBe(1);
    expect(calcChallengeProgress(defFor('daily_elephant_chat'), { chattedToday: false })).toBe(0);
  });

  it('week_* reads the weekly-review aggregates', () => {
    const inputs = { week: { challengesCompleted: 2, totalSaved: 12.5, streakDays: 3, dailyBreakdown: [] } };
    expect(calcChallengeProgress(defFor('weekly_three_guards'), inputs)).toBe(2);
    expect(calcChallengeProgress(defFor('weekly_streak_keeper'), inputs)).toBe(3);
    expect(calcChallengeProgress(defFor('weekly_fifty_left'), inputs)).toBe(12.5);
  });

  it('total_* / dream_funds_funded read buddyState (same pipeline as calcBadgeProgress)', () => {
    const funded = { id: 'a', name: 'A', target: 100, current: 25, emoji: '🌱' };
    const empty = { id: 'b', name: 'B', target: 100, current: 0, emoji: '🌷' };
    const inputs = { buddyState: makeBuddyState({ challengesCompleted: 10, totalSaved: 137, dreamFunds: [funded, empty] }) };
    expect(calcChallengeProgress(defFor('milestone_green_guardian'), inputs)).toBe(10);
    expect(calcChallengeProgress(defFor('milestone_money_meadow'), inputs)).toBe(137);
    // 口径同勋章: 钱真进基金才算, 空基金不算
    expect(calcChallengeProgress(defFor('milestone_first_seed'), inputs)).toBe(1);
  });

  it('returns null when buddyState exists but an all-time field is missing (N7)', () => {
    const inputs = { buddyState: makeBuddyState({ challengesCompleted: undefined }) };
    expect(calcChallengeProgress(defFor('milestone_green_guardian'), inputs)).toBeNull();
  });
});

describe('challengeMoneyLeft — in-app truth line per period', () => {
  const defFor = (id: string) => GUARDIAN_CHALLENGES.find((c) => c.id === id)!;
  const week = {
    challengesCompleted: 2,
    totalSaved: 12.5,
    streakDays: 3,
    todayDateStr: TODAY,
    dailyBreakdown: [
      { date: '2026-09-05', count: 1, savedAmount: 0 },
      { date: TODAY, count: 1, savedAmount: 3.5 },
    ],
  };

  it('daily challenges read today savedAmount from dailyBreakdown', () => {
    expect(challengeMoneyLeft(defFor('daily_green_gate'), { week })).toBe(3.5);
  });

  it('weekly challenges read the 7-day totalSaved', () => {
    expect(challengeMoneyLeft(defFor('weekly_three_guards'), { week })).toBe(12.5);
  });

  it('all_time challenges read buddyState.totalSaved', () => {
    expect(challengeMoneyLeft(defFor('milestone_money_meadow'), { buddyState: makeBuddyState({ totalSaved: 137 }) })).toBe(137);
  });

  it('returns null when the pipeline has no data — UI must not invent amounts', () => {
    expect(challengeMoneyLeft(defFor('daily_green_gate'), { week: null })).toBeNull();
    expect(challengeMoneyLeft(defFor('weekly_fifty_left'), {})).toBeNull();
    expect(challengeMoneyLeft(defFor('milestone_first_seed'), { buddyState: null })).toBeNull();
    // 无今天条目 (数据不全) → null, 不拿昨天的数充数
    expect(challengeMoneyLeft(defFor('daily_green_gate'), {
      week: { ...week, todayDateStr: '2099-01-01' },
    })).toBeNull();
  });
});

// ===== 弹窗渲染 =====
function openModal(props: Partial<Parameters<typeof ChallengeModal>[0]> = {}) {
  render(
    <ChallengeModal
      open
      onClose={() => {}}
      onSubmit={() => {}}
      isDemo={false}
      {...props}
    />,
  );
}

describe('challenge modal — guardian library view (batch4-b)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      challengesCompleted: 0, totalSaved: 0, streakDays: 0,
      dailyBreakdown: [], todayDateStr: TODAY,
    });
  });

  it('shows the guardian library by default with tier groups and the weekly feature (挑战展示)', async () => {
    mockWeekData();
    // challengesCompleted > 0 → hard 区默认展开, 全部条目可见
    await openModal({ buddyState: makeBuddyState({ challengesCompleted: 3 }) });

    // 默认库视图; 原 impulse 表单不在 DOM
    expect(screen.getByTestId('challenge-view-library')).toBeTruthy();
    expect(screen.queryByTestId('challenge-view-custom')).toBeNull();

    // 每周主推在场, 且被主推的挑战全库只出现一次 (移出分组, 不重复)
    expect(screen.getByTestId('weekly-feature')).toBeTruthy();
    const featureId = pickWeeklyFeatureChallenge().id;
    expect(screen.getAllByTestId(`guardian-challenge-${featureId}`)).toHaveLength(1);

    // 17 条挑战全部展示 (标题走真实 en.json), 每条恰好一次
    for (const c of GUARDIAN_CHALLENGES) {
      expect(screen.getAllByText(enLib.challenges[c.id].title)).toHaveLength(1);
    }
    // tier 分组都在 (starter/regular 标题 + hard 折叠开关)
    expect(screen.getByText('Easy starts')).toBeTruthy();
    expect(screen.getByText('Steady guards')).toBeTruthy();
    expect(screen.getByTestId('hard-tier-toggle').getAttribute('aria-expanded')).toBe('true');
    // 每张卡带周期小徽章 (分组轴换 tier 后周期信息仍一眼可见)
    expect(screen.getByTestId('challenge-period-chip-daily_green_gate').textContent).toBe('Daily');
    // 自定义入口存在 (原表单一键可达)
    expect(screen.getByTestId('challenge-custom-entry')).toBeTruthy();
  });

  it('renders real progress and completed titles (进度渲染)', async () => {
    mockWeekData();
    const funded = { id: 'a', name: 'A', target: 100, current: 25, emoji: '🌱' };
    await openModal({
      todaySeeItCount: 1,
      chattedToday: true,
      buddyState: makeBuddyState({ challengesCompleted: 4, totalSaved: 37, dreamFunds: [funded] }),
    });

    // 今日挑战完成 → 完成态展示守护称号 (不再显示 N/target)
    await screen.findByTestId('guardian-challenge-daily_green_gate');
    expect(screen.getByText(enLib.challenges.daily_green_gate.done)).toBeTruthy();
    expect(screen.getByText(enLib.challenges.daily_elephant_chat.done)).toBeTruthy();

    // 未完成 → 真实 N/target (buddyState 管道同步可达)
    expect(screen.getByTestId('guardian-challenge-progress-milestone_green_guardian').textContent).toBe('4/10');
    expect(screen.getByTestId('guardian-challenge-progress-milestone_money_meadow').textContent).toBe('37/100');

    // weekly 数据异步到达 → 真实 2/3
    await waitFor(() => {
      expect(screen.getByTestId('guardian-challenge-progress-weekly_three_guards').textContent).toBe('2/3');
    });

    // 展开详情: 奖励徽记指向 + 周期内真实留下的钱 (钱行)
    fireEvent.click(screen.getByTestId('guardian-challenge-weekly_three_guards').querySelector('button')!);
    expect(screen.getByText('Toward: Green Guardian')).toBeTruthy();
    expect(screen.getByTestId('guardian-challenge-money-weekly_three_guards').textContent).toContain('30 min');

    fireEvent.click(screen.getByTestId('guardian-challenge-milestone_money_meadow').querySelector('button')!);
    expect(screen.getByTestId('guardian-challenge-money-milestone_money_meadow').textContent).toContain('1.5 hours');

    // 每日钱行 — 今天 (todayDateStr) 的真实 savedAmount, 不是拿别的天充数
    fireEvent.click(screen.getByTestId('guardian-challenge-daily_green_gate').querySelector('button')!);
    expect(screen.getByTestId('guardian-challenge-money-daily_green_gate').textContent).toContain('8 min');
  });

  it('degrades honestly: unknown pipelines show "—", no money line, no fake numbers (诚实降级)', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    await openModal({ buddyState: makeBuddyState() });

    await screen.findByTestId('guardian-challenge-weekly_three_guards');
    // 周/今日源未知 → "—" 而不是 0
    expect(screen.getByTestId('guardian-challenge-progress-weekly_three_guards').textContent).toBe('—/3');
    expect(screen.getByTestId('guardian-challenge-progress-daily_green_gate').textContent).toBe('—/1');
    // buddyState 管道在 → 真实 0 如实显示
    expect(screen.getByTestId('guardian-challenge-progress-milestone_green_guardian').textContent).toBe('0/10');
    // 没有任何钱行 (0/null 都不渲染), 诚实 note 在场
    expect(screen.queryByTestId(/^guardian-challenge-money-/)).toBeNull();
    expect(screen.getByText(/Progress counts only what really happened\./)).toBeTruthy();
  });

  it('keeps the impulse form intact behind the custom tab (零回归)', async () => {
    mockWeekData();
    const onSubmit = vi.fn();
    await openModal({ onSubmit });

    fireEvent.click(screen.getByTestId('challenge-tab-custom'));
    expect(screen.getByTestId('challenge-view-custom')).toBeTruthy();

    const nameInput = document.getElementById('challenge-item-name') as HTMLInputElement;
    const amountInput = document.getElementById('challenge-amount') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Vinyl record' } });
    fireEvent.change(amountInput, { target: { value: '42' } });
    // happy-dom 的 validity.stepMismatch 对 step=0.01 恒为 true (浮点取模缺陷, 浏览器无此问题),
    // 点击路径会被 amountValid 挡住 — 走 Enter 提交路径 (同一套 itemName/amount 校验逻辑)
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('Vinyl record', 42);
  });
});

// ===== batch6-a: tier 分组 + 新手 hard 折叠 + 每周主推位 =====
describe('challenge modal — tier grouping, newbie hard collapse, weekly feature (batch6-a)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      challengesCompleted: 0, totalSaved: 0, streakDays: 0,
      dailyBreakdown: [], todayDateStr: TODAY,
    });
  });

  /** hard 层里找一条不是本周主推的 — 主推条永远在顶部轮换位单独渲染 */
  function hardCardHiddenForNewbie(): string {
    const featuredId = pickWeeklyFeatureChallenge().id;
    const def = GUARDIAN_CHALLENGES.find((c) => c.tier === 'hard' && c.id !== featuredId)!;
    return def.id;
  }

  it('collapses the hard tier for newbies (challengesCompleted === 0) — invite tone, not shame', async () => {
    await openModal({ buddyState: makeBuddyState() }); // 0 次完成 → 新手

    await screen.findByTestId('challenge-tier-hard');
    const hiddenId = hardCardHiddenForNewbie();
    // hard 卡收起, starter/regular 照常展示
    expect(screen.queryByTestId(`guardian-challenge-${hiddenId}`)).toBeNull();
    expect(screen.getByTestId('guardian-challenge-weekly_three_guards')).toBeTruthy();
    // 收起态文案是邀请语气, 无羞辱
    expect(screen.getByText(/Saved for later/)).toBeTruthy();
    // 展开开关可达, aria-expanded 如实
    expect(screen.getByTestId('hard-tier-toggle').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByTestId('hard-tier-toggle'));
    expect(screen.getByTestId(`guardian-challenge-${hiddenId}`)).toBeTruthy();
    expect(screen.getByTestId('hard-tier-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the hard tier open for returning users (challengesCompleted > 0)', async () => {
    await openModal({ buddyState: makeBuddyState({ challengesCompleted: 2 }) });

    await screen.findByTestId('challenge-tier-hard');
    const hiddenId = hardCardHiddenForNewbie();
    expect(screen.getByTestId(`guardian-challenge-${hiddenId}`)).toBeTruthy();
    expect(screen.queryByText(/Saved for later/)).toBeNull();
  });

  it('renders the weekly feature as a single weekly-period challenge with a period chip', async () => {
    await openModal({ buddyState: makeBuddyState({ challengesCompleted: 1 }) });

    const section = await screen.findByTestId('weekly-feature');
    const featured = pickWeeklyFeatureChallenge();
    expect(featured.period).toBe('weekly');
    // 主推卡在轮换位内, 且带周期徽章
    expect(section.querySelector(`[data-testid="guardian-challenge-${featured.id}"]`)).toBeTruthy();
    expect(
      section.querySelector(`[data-testid="challenge-period-chip-${featured.id}"]`)?.textContent,
    ).toBe('This week');
    // 全库单实例 (分组里不再重复渲染)
    expect(screen.getAllByTestId(`guardian-challenge-${featured.id}`)).toHaveLength(1);
  });
});

// ===== batch5-a: 完成态晒入口 → challenge 分享卡 =====
describe('challenge share entry — completed only, face-only export (batch5-a)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      challengesCompleted: 0, totalSaved: 0, streakDays: 0,
      dailyBreakdown: [], todayDateStr: TODAY,
    });
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
  });

  it('completed challenge can be shared: entry opens share-modal on the challenge template', async () => {
    mockWeekData();
    await openModal({
      todaySeeItCount: 1,
      chattedToday: true,
      buddyState: makeBuddyState({ challengesCompleted: 4, streak: 3, totalSaved: 37 }),
    });

    // 完成的今日挑战有晒入口; 未完成的里程碑挑战没有 (荣誉非羞辱)
    await screen.findByTestId('challenge-share-daily_green_gate');
    expect(screen.queryByTestId('challenge-share-milestone_green_guardian')).toBeNull();

    // 唤起 share-modal — challenge 模板默认选中, 挑战卡在场
    fireEvent.click(screen.getByTestId('challenge-share-daily_green_gate'));
    await screen.findByTestId('challenge-card');
    const chip = screen.getByTestId('template-chip-challenge') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    // 面子/里子: 该挑战周期真实留下的钱 ($3.50) 只在 app 内私密提示行, 绝不在分享卡子树
    const hint = screen.getByTestId('private-saved-hint');
    expect(hint.textContent).toContain('8 min');
    const card = screen.getByTestId('challenge-card');
    expect(card.contains(hint)).toBe(false);
    expect(card.textContent).not.toMatch(/[$¥€£]/);

    // Escape 先关晒卡弹层 — 不连带关掉挑战弹窗
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('challenge-card')).toBeNull());
    expect(screen.getByTestId('challenge-view-library')).toBeTruthy();
  });

  it('in-progress challenges show progress and encouragement — no share entry anywhere', async () => {
    // streakDays 压到 2: batch6-a 的 weekly_three_day_chain (3 天) 也保持进行中,
    // 让 "全部进行中" 的用例前提在 17 条库里仍成立
    mockWeekData({ streakDays: 2 });
    await openModal({ todaySeeItCount: 0, chattedToday: false, buddyState: makeBuddyState() });

    await screen.findByTestId('guardian-challenge-weekly_three_guards');
    // 无任何晒入口 (晒卡弹层也没被唤起) — 进行中看到的是进度, 不是羞辱
    expect(screen.queryByTestId(/^challenge-share-/)).toBeNull();
    expect(screen.queryByTestId('share-modal')).toBeNull();
  });
});
