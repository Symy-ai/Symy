// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InviteCard, resolveGuardianTier } from '../invite-card';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      if (key === 'profile.inviteShare') return 'Share title';
      if (key === 'common.retry') return 'Retry';
      if (key === 'profile.inviteTierTrainee') return 'Trainee Guardian';
      if (key === 'profile.inviteTier1') return 'Fellow Guardian';
      if (key === 'profile.inviteTier5') return 'Guardian Partner';
      if (key === 'profile.inviteTier10') return 'Guardian Ambassador';
      return params?.defaultValue ?? key;
    },
  }),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/guard-rank', () => ({
  getGuardRank: () => ({ id: 'partner', level: 4, emoji: '🛡️', name: 'Guardian Partner' }),
}));

const ShareModalMock = vi.hoisted(() => vi.fn(() => null));
vi.mock('@/components/share/share-modal', () => ({ ShareModal: ShareModalMock }));

describe('resolveGuardianTier 守护称号梯度 (纯展示映射)', () => {
  it('0 人 → Trainee, next at 1', () => {
    const tier = resolveGuardianTier(0);
    expect(tier.key).toBe('profile.inviteTierTrainee');
    expect(tier.next?.at).toBe(1);
  });

  it('1 人 → Fellow, next at 5; 5 人 → Partner, next at 10; 10 人 → Ambassador 无 next', () => {
    expect(resolveGuardianTier(1).key).toBe('profile.inviteTier1');
    expect(resolveGuardianTier(1).next?.at).toBe(5);
    expect(resolveGuardianTier(5).key).toBe('profile.inviteTier5');
    expect(resolveGuardianTier(5).next?.at).toBe(10);
    const top = resolveGuardianTier(10);
    expect(top.key).toBe('profile.inviteTier10');
    expect(top.next).toBeUndefined();
  });
});

describe('InviteCard share entry', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    ShareModalMock.mockReset();
    ShareModalMock.mockReturnValue(null);
  });

  it('opens the invite share modal with the real ref code and completed count', async () => {
    apiFetchMock.mockResolvedValue({
      refCode: 'real8',
      inviteLink: 'https://symy.ai/?ref=real8',
      stats: { totalInvited: 6, completed: 5 },
    });

    render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Share title')).toBeTruthy());
    fireEvent.click(screen.getByText('Share title'));

    await waitFor(() => expect(ShareModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        initialTemplate: 'invite',
        inviteCard: { refCode: 'real8', completedCount: 5 },
      }),
      undefined,
    ));
  });

  it('邀请链接加载失败 → 错误态 + 重试恢复 (batch7-b 同套清理)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('net'));
    render(<InviteCard />);
    await waitFor(() => expect(screen.getByText(/Couldn't load invite info/)).toBeTruthy());
    // 重试成功
    apiFetchMock.mockResolvedValue({
      refCode: 'r2',
      inviteLink: 'https://symy.ai/?ref=r2',
      stats: { totalInvited: 1, completed: 1 },
    });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByText('Share title')).toBeTruthy());
  });

  it('晒战绩: 并行双管道 → guardianData 形状 (batch24-c) + 金额只换算 cents 不上图', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/invite/link') {
        return { refCode: 'x', inviteLink: 'https://symy.ai/?ref=x', stats: { totalInvited: 0, completed: 0 } };
      }
      if (url === '/api/buddy/state') {
        return { buddyState: { streak: 7, badges: ['b1', 'b2'], totalSaved: 12.34 } };
      }
      if (url === '/api/challenge/stats') {
        return { totalPassed: 9 };
      }
      return {} as Record<string, unknown>;
    });
    render(<InviteCard />);
    await waitFor(() => expect(screen.getByText('Share title')).toBeTruthy());
    // 晒战绩按钮 (data-testid 锚)
    fireEvent.click(screen.getByTestId('guardian-share-btn'));
    await waitFor(() => {
      expect(ShareModalMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          open: true,
          initialTemplate: 'guardian-stats',
          streakDays: 7,
          interceptCount: 9,
          medal: { itemTitle: '', savedCents: 1234 }, // 12.34 → cents (分享铁律: 金额只在 modal 换算, 不上图)
        }),
        undefined,
      );
    });
  });
});
