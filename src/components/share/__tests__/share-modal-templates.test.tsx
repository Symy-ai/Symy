/**
 * Component tests for ShareModal template system (batch2-b + batch4-a badge + batch5-a challenge)
 *
 * 测试矩阵 (模板扩展部分; 旧 share-modal.test.tsx 断言不动, 这里只加新):
 *   - 默认选中拦截卡, chips 渲染
 *   - 次数已知 → 里程碑 chip 出现; fetch 失败 → 里程碑 chip 诚实降级隐藏
 *   - 切换模板 → 卡片跟着切, PNG 重新生成
 *   - 私密提示行: 金额只出现在 modal, 不出现在卡片子树 (面子/里子分离)
 *   - badge / challenge 模板: 无专属数据 → chip 不出现; 晒入口传入 → 直开对应卡
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ShareModal } from '../share-modal';
import type { InterceptMedalData } from '@/types/intercept-medal';

// Mock html-to-image CDN loader — 不发真实网络请求
const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

// Mock api-client — challenge stats
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Mock i18n — 缺 key 走 defaultValue
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = params?.defaultValue ?? key;
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

vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(0)}`,
}));

const medal: InterceptMedalData = {
  itemTitle: 'Air Fryer',
  savedCents: 8900,
  date: '2026-09-05T10:00:00Z',
};

// batch4-a: badge 模板数据 (BadgeDef 只读引用形状)
const badgeDef = {
  id: 'green_guardian_10',
  emoji: '🌿',
  color: 'bg-green-500/10 border-green-500/20',
  unlockConditionKey: 'buddy.badgeUnlock.green_guardian_10',
  progressTarget: 10,
  progressType: 'challenge_wins' as const,
  group: 'guardian' as const,
};

// batch5-a: challenge 模板数据 (GuardianChallenge 只读引用形状)
const challengeDef = {
  id: 'daily_green_gate',
  period: 'daily' as const,
  titleKey: 'buddy.challengeLib.challenges.daily_green_gate.title',
  descKey: 'buddy.challengeLib.challenges.daily_green_gate.desc',
  doneTitleKey: 'buddy.challengeLib.challenges.daily_green_gate.done',
  progressSource: 'today_see_it' as const,
  target: 1,
  rewardBadgeId: 'impulse_shield',
};

describe('ShareModal templates', () => {
  beforeEach(() => {
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ totalSaw: 26, totalPassed: 23, totalFailed: 3 });
  });

  it('defaults to intercept card and renders template chips once count is known', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    // 默认拦截卡 (既有路径零回归)
    expect(screen.getByTestId('intercept-card')).toBeTruthy();

    // stats 到位后里程碑 chip 出现
    await waitFor(() => expect(screen.getByTestId('template-chip-milestone')).toBeTruthy());
    expect(screen.getByTestId('template-chip-intercept')).toBeTruthy();
    expect(screen.getByTestId('template-chip-streak')).toBeTruthy();

    // 默认选中拦截卡
    const interceptChip = screen.getByTestId('template-chip-intercept') as HTMLButtonElement;
    expect(interceptChip.getAttribute('aria-pressed')).toBe('true');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/challenge/stats', expect.anything());
  });

  it('hides milestone chip honestly when stats fetch fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));

    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    // fetch 失败后里程碑 chip 不出现 (不猜数), 其余模板不受影响
    await expect(waitFor(() => screen.getByTestId('template-chip-milestone'), { timeout: 300 })).rejects.toBeTruthy();
    expect(screen.getByTestId('template-chip-intercept')).toBeTruthy();
    expect(screen.getByTestId('template-chip-streak')).toBeTruthy();
  });

  it('switches card + regenerates PNG when picking another template', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={12} />);

    await waitFor(() => expect(screen.getByTestId('template-chip-streak')).toBeTruthy());
    const callsAfterOpen = toPngMock.mock.calls.length;

    fireEvent.click(screen.getByTestId('template-chip-streak'));
    expect(screen.getByTestId('streak-card')).toBeTruthy();
    expect(screen.queryByTestId('intercept-card')).toBeNull();
    await waitFor(() => expect(toPngMock.mock.calls.length).toBeGreaterThan(callsAfterOpen));

    fireEvent.click(screen.getByTestId('template-chip-milestone'));
    expect(screen.getByTestId('milestone-card')).toBeTruthy();
    expect(screen.queryByTestId('streak-card')).toBeNull();
  });

  it('renders milestone card in anticipation state from fetched count', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    fireEvent.click(await screen.findByTestId('template-chip-milestone'));
    const card = screen.getByTestId('milestone-card');
    // 23 次 → 已解锁庆祝态 + 下一个里程碑进度 (期待感)
    expect(card.textContent).toContain('Guard #23');
    expect(card.textContent).toContain('23/50');
  });

  it('keeps the private saved amount out of the card subtree', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    // 私密提示行在 modal 里 (里子可见)
    const hint = await screen.findByTestId('private-saved-hint');
    expect(hint.textContent).toContain('3.6 hours');

    // 但绝不在分享卡子树内 (面子/里子分离)
    const card = screen.getByTestId('intercept-card');
    expect(card.contains(hint)).toBe(false);
    expect(card.textContent).not.toMatch(/[$¥]/);
  });

  // ===== batch4-a: badge 模板 =====

  it('keeps the badge chip out of the modal when no badge data is passed', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    await waitFor(() => expect(screen.getByTestId('template-chip-milestone')).toBeTruthy());
    expect(screen.queryByTestId('template-chip-badge')).toBeNull();
    // batch5-a: challenge chip 同规则 — 无专属数据不出现
    expect(screen.queryByTestId('template-chip-challenge')).toBeNull();
  });

  it('opens straight onto the badge card when launched from the badges share entry', async () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        medal={medal}
        streakDays={3}
        initialTemplate="badge"
        badgeCard={{ badge: badgeDef, progressValue: 12 }}
      />
    );

    // badge 模板默认选中, chips 四枚齐全
    expect(screen.getByTestId('badge-card')).toBeTruthy();
    const chip = screen.getByTestId('template-chip-badge') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('12 guards won')).toBeTruthy();
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 面子/里子: 金额私密行仍在 modal, 但绝不在 badge 卡子树
    const hint = screen.getByTestId('private-saved-hint');
    expect(hint.textContent).toContain('3.6 hours');
    expect(screen.getByTestId('badge-card').contains(hint)).toBe(false);
    expect(screen.getByTestId('badge-card').textContent).not.toMatch(/[$¥]/);
  });

  it('switching from badge template to intercept keeps both cards working', () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        medal={medal}
        streakDays={3}
        initialTemplate="badge"
        badgeCard={{ badge: badgeDef, progressValue: 12 }}
      />
    );

    expect(screen.getByTestId('badge-card')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-chip-intercept'));
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(screen.queryByTestId('badge-card')).toBeNull();

    fireEvent.click(screen.getByTestId('template-chip-badge'));
    expect(screen.getByTestId('badge-card')).toBeTruthy();
    expect(screen.queryByTestId('intercept-card')).toBeNull();
  });

  // ===== batch5-a: challenge 模板 =====

  it('opens straight onto the challenge card when launched from the challenge share entry', async () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        medal={medal}
        streakDays={3}
        interceptCount={23}
        initialTemplate="challenge"
        challengeCard={{ challenge: challengeDef }}
      />
    );

    // challenge 模板默认选中, 五枚 chips 齐全
    expect(screen.getByTestId('challenge-card')).toBeTruthy();
    const chip = screen.getByTestId('template-chip-challenge') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('template-chip-intercept')).toBeTruthy();
    expect(screen.queryByTestId('template-chip-badge')).toBeNull(); // 无 badgeCard 仍不出现
    // 面子 chips: 23 次守护 + 3 天连续
    expect(screen.getByText('23 guards won')).toBeTruthy();
    expect(screen.getByText('3 days in a row')).toBeTruthy();
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 面子/里子: 金额私密行仍在 modal, 但绝不在 challenge 卡子树
    const hint = screen.getByTestId('private-saved-hint');
    expect(hint.textContent).toContain('3.6 hours');
    expect(screen.getByTestId('challenge-card').contains(hint)).toBe(false);
    expect(screen.getByTestId('challenge-card').textContent).not.toMatch(/[$¥]/);
  });

  it('switching from challenge template to intercept keeps both cards working', () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        medal={medal}
        streakDays={3}
        interceptCount={23}
        initialTemplate="challenge"
        challengeCard={{ challenge: challengeDef }}
      />
    );

    expect(screen.getByTestId('challenge-card')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-chip-intercept'));
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(screen.queryByTestId('challenge-card')).toBeNull();

    fireEvent.click(screen.getByTestId('template-chip-challenge'));
    expect(screen.getByTestId('challenge-card')).toBeTruthy();
    expect(screen.queryByTestId('intercept-card')).toBeNull();
  });

  it('falls back to intercept when initialTemplate is challenge but no challenge data is passed', () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} initialTemplate="challenge" />);

    // 缺数据不出现空卡 — 诚实落回拦截卡
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(screen.queryByTestId('challenge-card')).toBeNull();
    expect(screen.queryByTestId('template-chip-challenge')).toBeNull();
  });

  // ===== batch24-c: guardian-stats 模板 (守护战绩一图流, chip 只在 guardRank 传入时出现) =====

  it('keeps the guardian-stats chip out of the modal when no rank snapshot is passed', async () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    await waitFor(() => expect(screen.getByTestId('template-chip-milestone')).toBeTruthy());
    // 既有入口零回归: 不传 guardRank 就不出守护战绩 chip
    expect(screen.queryByTestId('template-chip-guardian-stats')).toBeNull();
  });

  it('opens straight onto the guardian-stats card when launched from the invite share entry', async () => {
    render(
      <ShareModal
        open
        onClose={vi.fn()}
        medal={medal}
        streakDays={12}
        interceptCount={23}
        guardRank={{ name: 'Companion Guardian', level: 2, emoji: '🤝' }}
        initialTemplate="guardian-stats"
      />
    );

    expect(screen.getByTestId('guardian-stats-card')).toBeTruthy();
    const chip = screen.getByTestId('template-chip-guardian-stats') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(toPngMock).toHaveBeenCalled());

    // 面子/里子: 三统计全面子, 金额永不出卡
    const card = screen.getByTestId('guardian-stats-card');
    expect(card.textContent).not.toMatch(/[$¥]/);
  });

  it('falls back to intercept when initialTemplate is guardian-stats but no rank data is passed', () => {
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} initialTemplate="guardian-stats" />);

    // 缺数据不出现空卡 — 诚实落回拦截卡
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(screen.queryByTestId('guardian-stats-card')).toBeNull();
    expect(screen.queryByTestId('template-chip-guardian-stats')).toBeNull();
  });
});
