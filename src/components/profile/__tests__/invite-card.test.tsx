/**
 * batch7-b tests — 邀请链路绿色化 (守护叙事改造)
 *
 * 覆盖矩阵:
 *  - 奖励数字口径: en/zh 邀请文案中的数字 (+30 天 / 5 人 / 10 人 / 当次 +60 天 / 双向)
 *    必须与 invitation-reward.ts 源码常量一致 (测试内解析常量, 改数字不改文案会红)
 *  - 守护称号梯度: resolveGuardianTier 边界 (0/1/4/5/9/10) + 阈值对齐 invitation-reward.ts;
 *    tier i18n key en/zh 齐全
 *  - 文案守卫: 邀请域无市侩词 (拉新/薅/佣金/referral/cashback), 无羞辱措辞, 镜子时代词已清零
 *  - 组件四态: loading → loaded (链接+里程碑+称号) → 复制 → error 重试; 称号随 stats 切换
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { InviteCard, resolveGuardianTier } from '../invite-card';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

// ===== i18n mock — 真实 en.json 嵌套解析 (缺失 key 原样返回 → 测试能发现漏 key) =====
// t 按 locale 缓存引用 — 真实 next-intl 的 t 是稳定引用, 否则 loadInviteLink 每次渲染重建 → useEffect 反复触发
const i18nState = vi.hoisted(() => ({ t: null as null | ((key: string, values?: Record<string, string | number> & { defaultValue?: string }) => string) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    if (!i18nState.t) {
      i18nState.t = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
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
        if (values) {
          for (const [k, v] of Object.entries(values)) {
            if (k !== 'defaultValue') out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return out;
      };
    }
    return { t: i18nState.t, locale: 'en' };
  },
}));

// apiFetch — 每个 case 自行配置返回值
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetch: apiFetchMock,
}));

// batch24-c: ShareModal 打桩 — 只验证入口传参 (模板 id / 等阶 / 面子数据), PNG 管线由 share 域测试守卫
const shareModalProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('@/components/share/share-modal', () => ({
  ShareModal: (props: Record<string, unknown>) => {
    shareModalProps.last = props;
    return <div data-testid="share-modal-stub" />;
  },
}));

// ===== invitation-reward.ts 常量 — 从源码解析 (SSOT), 不硬编码数字 =====
const rewardSrc = readFileSync(join(process.cwd(), 'src/lib/invitation-reward.ts'), 'utf-8');
function rewardConst(name: string): number {
  const m = rewardSrc.match(new RegExp(`const ${name} = (\\d+)`));
  if (!m) throw new Error(`invitation-reward.ts: constant ${name} not found`);
  return Number(m[1]);
}
const BASE_DAYS = rewardConst('INVITE_REWARD_PREMIUM_DAYS'); // 每邀 1 人双方各得
const MILESTONE_EVERY = rewardConst('MILESTONE_EVERY'); // 每 N 人里程碑
const MILESTONE_BONUS = rewardConst('MILESTONE_BONUS_DAYS'); // 里程碑额外天数
const BADGE_AT = rewardConst('MILESTONE_BADGE_AT'); // 徽章门槛
/** 阶梯模型 (方案 D): 总天数 = n×30 + floor(n/5)×30 — 与 invitation-reward.ts calcReferrerTotalDays 一致 */
const totalDays = (n: number) => n * BASE_DAYS + Math.floor(n / MILESTONE_EVERY) * MILESTONE_BONUS;
/** 第 BADGE_AT 人完成那一步的 referrer 增量 (基础 + 里程碑叠加) */
const stepDeltaAtBadge = totalDays(BADGE_AT) - totalDays(BADGE_AT - 1);

// ===== i18n 取词工具 =====
type MsgTree = Record<string, unknown>;
function msg(root: MsgTree, key: string): string {
  let cur: unknown = root;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as MsgTree)) {
      cur = (cur as MsgTree)[part];
    } else {
      throw new Error(`missing i18n key: ${key}`);
    }
  }
  if (typeof cur !== 'string') throw new Error(`non-string i18n value: ${key}`);
  return cur;
}

const INVITE_KEYS = [
  'invite.covenantPill',
  'invite.covenantHeading',
  'invite.covenantSubtitle',
  'invite.covenantJoinLabel',
  'invite.covenantFooter',
  'profile.inviteFriends',
  'profile.inviteFriendsDesc',
  'profile.inviteRewardDesc',
  'profile.inviteCopy',
  'profile.inviteCopied',
  'profile.inviteCopySuccess',
  'profile.inviteLinkLoading',
  'profile.inviteStatsTotal',
  'profile.inviteStatsCompleted',
  'profile.inviteMilestoneTitle',
  'profile.inviteMilestone1',
  'profile.inviteMilestone5',
  'profile.inviteMilestone10',
  'profile.inviteTierTrainee',
  'profile.inviteTier1',
  'profile.inviteTier5',
  'profile.inviteTier10',
  'profile.inviteTierNext',
  'profile.inviteBeFirst',
  'profile.inviteLoadError',
  'chat.inviteRewardToast',
  'milestone.invitePrompt',
  'milestone.invitePrompt50',
] as const;

// ============================================================
// 1. 奖励数字口径 — en/zh 与 invitation-reward.ts 一致
// ============================================================
describe('invite copy numbers match invitation-reward.ts (en/zh)', () => {
  it('inviteRewardDesc: 双向 +30 天 / 每 5 人额外 +30 天 / 10 人当次 +60 天 + 徽章', () => {
    for (const tree of [en as MsgTree, zh as MsgTree]) {
      const text = msg(tree, 'profile.inviteRewardDesc');
      expect(text).toContain(`+${BASE_DAYS}`); // 双方各 +30 天
      expect(text).toContain(`+${MILESTONE_BONUS}`); // 里程碑额外 +30 天
      expect(text).toContain(`${BADGE_AT}`); // 满 10 位
      expect(text).toContain(`+${stepDeltaAtBadge}`); // 当次 +60 天
      expect(text).toMatch(/badge|徽章/);
    }
    expect(msg(en as MsgTree, 'profile.inviteRewardDesc')).toMatch(/both/i);
    expect(msg(zh as MsgTree, 'profile.inviteRewardDesc')).toContain('双方');
  });

  it('milestone rows: 1 人 / 5 人 / 10 人数字齐全且双向不变', () => {
    const m1en = msg(en as MsgTree, 'profile.inviteMilestone1');
    const m1zh = msg(zh as MsgTree, 'profile.inviteMilestone1');
    expect(m1en).toContain(`+${BASE_DAYS}`);
    expect(m1en).toMatch(/both/i);
    expect(m1zh).toContain(`+${BASE_DAYS}`);
    expect(m1zh).toContain('双方');

    const m5en = msg(en as MsgTree, 'profile.inviteMilestone5');
    const m5zh = msg(zh as MsgTree, 'profile.inviteMilestone5');
    for (const text of [m5en, m5zh]) {
      expect(text).toContain(`${MILESTONE_EVERY}`);
      expect(text).toContain(`+${MILESTONE_BONUS}`);
    }

    const m10en = msg(en as MsgTree, 'profile.inviteMilestone10');
    const m10zh = msg(zh as MsgTree, 'profile.inviteMilestone10');
    for (const text of [m10en, m10zh]) {
      expect(text).toContain(`${BADGE_AT}`);
      expect(text).toContain(`+${stepDeltaAtBadge}`);
      expect(text).toMatch(/badge|徽章/);
    }
  });

  it('reward landing toast + milestone prompts carry the same numbers', () => {
    expect(msg(en as MsgTree, 'chat.inviteRewardToast')).toContain(`+${BASE_DAYS}`);
    expect(msg(zh as MsgTree, 'chat.inviteRewardToast')).toContain(`+${BASE_DAYS}`);

    const promptEn = msg(en as MsgTree, 'milestone.invitePrompt');
    const promptZh = msg(zh as MsgTree, 'milestone.invitePrompt');
    expect(promptEn).toContain(`+${BASE_DAYS}`);
    expect(promptEn).toMatch(/both/i);
    expect(promptZh).toContain(`+${BASE_DAYS}`);
    expect(promptZh).toContain('各');

    const p50En = msg(en as MsgTree, 'milestone.invitePrompt50');
    const p50Zh = msg(zh as MsgTree, 'milestone.invitePrompt50');
    for (const text of [p50En, p50Zh]) {
      expect(text).toContain(`+${BASE_DAYS}`);
      expect(text).toContain(`${MILESTONE_EVERY}`);
      expect(text).toContain(`+${MILESTONE_BONUS}`);
      expect(text).toContain(`${BADGE_AT}`);
      expect(text).toContain(`+${stepDeltaAtBadge}`);
    }
  });

  it('invitation-reward.ts numeric constants stay at the batch7-b baseline (模型一字不动)', () => {
    // 红线: 本任务奖励模型零改动 — 任何数字漂移都应被显式发现
    expect(BASE_DAYS).toBe(30);
    expect(MILESTONE_EVERY).toBe(5);
    expect(MILESTONE_BONUS).toBe(30);
    expect(BADGE_AT).toBe(10);
    expect(stepDeltaAtBadge).toBe(60);
  });
});

// ============================================================
// 2. 守护称号梯度 — 阈值对齐 invitation-reward.ts, en/zh 齐全
// ============================================================
describe('guardian tier ladder (display-only mapping)', () => {
  it('boundaries: 0=见习, 1=同行, 4 仍同行, 5=搭档, 9 仍搭档, 10=大使', () => {
    expect(resolveGuardianTier(0).key).toBe('profile.inviteTierTrainee');
    expect(resolveGuardianTier(1).key).toBe('profile.inviteTier1');
    expect(resolveGuardianTier(4).key).toBe('profile.inviteTier1');
    expect(resolveGuardianTier(5).key).toBe('profile.inviteTier5');
    expect(resolveGuardianTier(9).key).toBe('profile.inviteTier5');
    expect(resolveGuardianTier(10).key).toBe('profile.inviteTier10');
    expect(resolveGuardianTier(99).next).toBeUndefined(); // 封顶
  });

  it('ladder thresholds mirror invitation-reward.ts (5 人里程碑 / 10 人徽章)', () => {
    expect(resolveGuardianTier(1).next?.at).toBe(MILESTONE_EVERY); // 1 → 5
    expect(resolveGuardianTier(MILESTONE_EVERY).next?.at).toBe(BADGE_AT); // 5 → 10
    expect(resolveGuardianTier(BADGE_AT).next).toBeUndefined();
  });

  it('tier keys exist in both en.json and zh.json', () => {
    for (const key of ['profile.inviteTierTrainee', 'profile.inviteTier1', 'profile.inviteTier5', 'profile.inviteTier10', 'profile.inviteTierNext']) {
      expect(msg(en as MsgTree, key)).toBeTruthy();
      expect(msg(zh as MsgTree, key)).toBeTruthy();
    }
  });
});

// ============================================================
// 3. 文案守卫 — 荣誉非市侩, 无羞辱, 镜子时代词清零
// ============================================================
describe('invite copy guard (honor, not hustle)', () => {
  it('no mercenary referral-commission wording in invite domain (en/zh)', () => {
    const mercenary = /拉新|薅|佣金|返利|割韭菜|奖励|返现|赚钱|commission|cashback|affiliate|referral|reward|rebate|make money/i;
    for (const key of INVITE_KEYS) {
      expect(msg(en as MsgTree, key)).not.toMatch(mercenary);
      expect(msg(zh as MsgTree, key)).not.toMatch(mercenary);
    }
  });

  it('no shaming wording in invite domain (en/zh)', () => {
    const shaming = /羞耻|丢人|害臊|should be ashamed|shame on you|you should be/i;
    for (const key of INVITE_KEYS) {
      expect(msg(en as MsgTree, key)).not.toMatch(shaming);
      expect(msg(zh as MsgTree, key)).not.toMatch(shaming);
    }
  });

  it('mirror-era "seeing" wording zeroed in invite domain (en/zh)', () => {
    for (const key of INVITE_KEYS) {
      expect(msg(en as MsgTree, key)).not.toMatch(/seeing|lights up|mark of light/i);
      expect(msg(zh as MsgTree, key)).not.toMatch(/看见|点亮|照见|光的印记/);
    }
  });
});

// ============================================================
// 4. 组件四态 — loading / loaded / 复制 / error 重试
// ============================================================
const LOADED_PAYLOAD = {
  refCode: 'abc12345',
  inviteLink: 'https://symy.ai/?ref=abc12345',
  stats: { totalInvited: 3, completed: 1 },
};

describe('InviteCard four states (en render)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('loading: skeleton, no title yet', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<InviteCard />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    expect(container.textContent).not.toContain('green guardian');
  });

  it('loaded: guardian title + link + milestones + tier chip', async () => {
    apiFetchMock.mockResolvedValue(LOADED_PAYLOAD);
    const { container } = render(<InviteCard />);
    await waitFor(() => expect(container.textContent).toContain('green guardian'));
    expect(container.textContent).toContain('One more guardian, a gentler planet');
    expect(container.textContent).toContain('?ref=abc12345');
    expect(container.textContent).toContain('Guardian milestones');
    expect(container.textContent).toContain('+30 days Premium for both');
    expect(container.textContent).toContain('Fellow Guardian'); // completed=1 → 同行守护者
    expect(container.textContent).toContain('Just 4 more to reach Guardian Partner');
    expect(container.textContent).toContain('Companions invited: 3');
    expect(container.textContent).toContain('Guarding together: 1');
  });

  it('copy: clipboard called with invite link, button flips to Copied', async () => {
    apiFetchMock.mockResolvedValue(LOADED_PAYLOAD);
    const { container } = render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Copy')).toBeTruthy());
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/?ref=abc12345'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(container.textContent).toContain('Guardian link copied');
  });

  it('error → retry: error card first, retry loads content', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(<InviteCard />);
    await waitFor(() => expect(container.textContent).toContain("Couldn't load invite info — tap to retry."));
    expect(container.textContent).not.toContain('green guardian');
    apiFetchMock.mockResolvedValue(LOADED_PAYLOAD);
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(container.textContent).toContain('green guardian'));
  });

  it('tier follows stats: trainee at zero, partner at 5, ambassador (capped) at 10', async () => {
    const cases: Array<{ stats: typeof LOADED_PAYLOAD.stats; tier: string; hint: string | null }> = [
      { stats: { totalInvited: 0, completed: 0 }, tier: 'Trainee Guardian', hint: 'Just 1 more to reach Fellow Guardian' },
      { stats: { totalInvited: 5, completed: 5 }, tier: 'Guardian Partner', hint: 'Just 5 more to reach Guardian Ambassador' },
      { stats: { totalInvited: 12, completed: 10 }, tier: 'Guardian Ambassador', hint: null },
    ];
    for (const c of cases) {
      apiFetchMock.mockResolvedValue({ ...LOADED_PAYLOAD, stats: c.stats });
      const { container, unmount } = render(<InviteCard />);
      await waitFor(() => expect(container.textContent).toContain(c.tier));
      if (c.hint) {
        expect(container.textContent).toContain(c.hint);
      } else {
        expect(container.textContent).not.toContain('more to reach');
      }
      unmount();
    }
  });
});

// ============================================================
// 5. batch24-c 晒战绩入口 — 守护战绩一图流 (share-modal guardian-stats 模板)
// ============================================================
describe('batch24-c share record entry (guardian stats image)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    shareModalProps.last = null;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('button appears and opens share-modal with guardian-stats template + honor-only data', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/invite/link') return Promise.resolve(LOADED_PAYLOAD);
      if (url === '/api/buddy/state') return Promise.resolve({ buddyState: { streak: 12, badges: ['a', 'b', 'c'], totalSaved: 22.5 } });
      if (url === '/api/challenge/stats') return Promise.resolve({ totalPassed: 12 });
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    const { container } = render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Copy')).toBeTruthy());
    expect(screen.getByTestId('guardian-share-btn')).toBeTruthy();

    fireEvent.click(screen.getByTestId('guardian-share-btn'));
    await waitFor(() => expect(screen.getByTestId('share-modal-stub')).toBeTruthy());

    const props = shareModalProps.last!;
    expect(props.initialTemplate).toBe('guardian-stats');
    expect(props.streakDays).toBe(12);
    expect(props.interceptCount).toBe(12);
    // 12 次拦截 → companion 等阶 (既有 profile.guardRank.* 键解析, 不新造等阶)
    const rank = props.guardRank as { name: string; level: number; emoji: string };
    expect(rank.name).toBe('Companion Guardian');
    expect(rank.level).toBe(2);
    expect(rank.emoji).toBe('🤝');
    // 金额只走 medal.savedCents 通道给 modal 换算小时 (22.5 → 2250), 图面无金额由卡测试守卫
    expect((props.medal as { savedCents: number }).savedCents).toBe(2250);
    expect(container.textContent).not.toContain('¥');
  });

  it('loading state disables the button and flips label to Creating', async () => {
    let resolveBuddy!: (v: unknown) => void;
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/invite/link') return Promise.resolve(LOADED_PAYLOAD);
      if (url === '/api/buddy/state') return new Promise((res) => { resolveBuddy = res; });
      return Promise.resolve({ totalPassed: 1 });
    });
    render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Copy')).toBeTruthy());

    fireEvent.click(screen.getByTestId('guardian-share-btn'));
    await waitFor(() => expect(screen.getByText('Creating…')).toBeTruthy());
    expect((screen.getByTestId('guardian-share-btn') as HTMLButtonElement).disabled).toBe(true);

    resolveBuddy({ buddyState: { streak: 1, badges: [], totalSaved: 0 } });
    await waitFor(() => expect(screen.getByTestId('share-modal-stub')).toBeTruthy());
  });

  it('API failure shows error capsule + retry recovers (zero-data user gets sprout guide, no half-empty card)', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/invite/link') return Promise.resolve(LOADED_PAYLOAD);
      return Promise.reject(new Error('stats down'));
    });
    const { container } = render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Copy')).toBeTruthy());

    fireEvent.click(screen.getByTestId('guardian-share-btn'));
    await waitFor(() => expect(screen.getByTestId('guardian-share-error')).toBeTruthy());
    expect(container.textContent).toContain("Couldn't load your record — tap to retry.");
    // 不出半空图
    expect(screen.queryByTestId('share-modal-stub')).toBeNull();

    // 重试成功 — 零数据用户也开卡 (卡内出引导态而非 0/0/0, 见卡测试)
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/invite/link') return Promise.resolve(LOADED_PAYLOAD);
      if (url === '/api/buddy/state') return Promise.resolve({ buddyState: { streak: 0, badges: [], totalSaved: 0 } });
      return Promise.resolve({ totalPassed: 0 });
    });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByTestId('share-modal-stub')).toBeTruthy());
    expect(screen.queryByTestId('guardian-share-error')).toBeNull();
    const props = shareModalProps.last!;
    const rank = props.guardRank as { name: string; level: number };
    expect(rank.name).toBe('Sprout');
    expect(rank.level).toBe(0);
  });
});
