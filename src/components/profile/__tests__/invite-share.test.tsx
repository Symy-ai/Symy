// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InviteCard } from '../invite-card';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      if (key === 'profile.inviteShare') return 'Share title';
      if (key === 'common.retry') return 'Retry';
      return params?.defaultValue ?? key;
    },
  }),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

const ShareModalMock = vi.hoisted(() => vi.fn(() => null));
vi.mock('@/components/share/share-modal', () => ({ ShareModal: ShareModalMock }));

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
});
