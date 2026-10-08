// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChallengeCard, getChallengeDisplayName } from '../challenge-card';
import type { GuardianChallenge } from '@/components/buddy/challenge-definitions';
// TFn 未从组件导出 — 本地同签名定义
type TFn = (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => string;

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      if (params?.defaultValue !== undefined) return String(params.defaultValue);
      return key;
    },
    locale: 'en',
  }),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const m = await importOriginal();
  return m;
});

const challenge = (overrides: Partial<GuardianChallenge> = {}): GuardianChallenge =>
  ({
    id: 'no_milk_tea_week',
    period: 'weekly',
    titleKey: 'buddy.challengeLib.challenges.no_milk_tea_week.title',
    descKey: 'buddy.challengeLib.challenges.no_milk_tea_week.desc',
    doneTitleKey: 'buddy.challengeLib.challenges.no_milk_tea_week.done',
    progressSource: 'guard_count',
    target: 7,
    tier: 'easy',
    rewardBadgeId: 'milk_tea_free_7d',
    ...overrides,
  }) as unknown as GuardianChallenge;

describe('getChallengeDisplayName', () => {
  const tEcho: TFn = (key) => key;
  it('i18n 命中返回翻译', () => {
    const tHit: TFn = (key) => (key.includes('no_milk_tea_week.title') ? '无奶茶一周' : key);
    expect(getChallengeDisplayName(challenge(), tHit)).toBe('无奶茶一周');
  });
  it('i18n 缺失 (label===key) 兜底 title-case', () => {
    expect(getChallengeDisplayName(challenge(), tEcho)).toBe('No Milk Tea Week');
  });
});

describe('ChallengeCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('渲染挑战名/称号/温度话/品牌条 + 勋章 emoji', () => {
    render(<ChallengeCard challenge={challenge()} streakDays={3} guardsWon={5} savedHours={2} userName="小明" />);
    expect(screen.getByTestId('challenge-card')).toBeTruthy();
    // 挑战名 + 完成称号 (doneTitleKey defaultValue=title) 双处出现
    expect(screen.getAllByText('No Milk Tea Week').length).toBe(2);
    // 兜底温度话
    expect(screen.getByText(/gate held because you showed up/)).toBeTruthy();
    expect(screen.getByText('Symy')).toBeTruthy();
  });

  it('guardsWon/streakDays 出双 chip; 0 值不出', () => {
    render(<ChallengeCard challenge={challenge()} streakDays={3} guardsWon={5} />);
    expect(screen.getByText('5 guards won')).toBeTruthy();
    expect(screen.getByText('3 days in a row')).toBeTruthy();
    cleanup();
    const { container } = render(<ChallengeCard challenge={challenge()} streakDays={0} guardsWon={0} />);
    expect(container.textContent).not.toContain('guards won');
    expect(container.textContent).not.toContain('days in a row');
  });

  it('rewardBadgeId 未注册 → 徽记 emoji 兜底 🌿', () => {
    render(<ChallengeCard challenge={challenge({ rewardBadgeId: 'unregistered_badge' })} guardsWon={1} />);
    expect(screen.getByText('🌿')).toBeTruthy();
  });

  it('savedHours ≥0.1 渲染赢回短语; <0.1 落 a green choice', () => {
    render(<ChallengeCard challenge={challenge()} savedHours={1.5} />);
    expect(screen.getAllByText(/won back/).length).toBeGreaterThanOrEqual(2);
    cleanup();
    render(<ChallengeCard challenge={challenge()} savedHours={0.05} />);
    expect(screen.getByText('a green choice')).toBeTruthy();
  });

  it('卡面全文本不含金额符号 (¥/$/元) — 红线', () => {
    const { container } = render(
      <ChallengeCard challenge={challenge()} streakDays={7} guardsWon={9} savedHours={3} userName="测" />
    );
    expect(container.textContent ?? '').not.toMatch(/[¥$]|元|CNY|USD/);
  });

  it('非法 date 兜底今天不崩溃', () => {
    render(<ChallengeCard challenge={challenge()} guardsWon={1} date="not-a-date" />);
    expect((screen.getByTestId('challenge-card').textContent ?? '')).toMatch(
      /January|February|March|April|May|June|July|August|September|October|November|December/
    );
  });

  it('userName 缺省不渲染名字行', () => {
    const { container } = render(<ChallengeCard challenge={challenge()} guardsWon={1} />);
    expect(container.textContent).not.toContain('小明');
  });
});
