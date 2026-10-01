import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';

const withAuthMock = vi.hoisted(() => vi.fn((handler: unknown) => handler));

vi.mock('@/lib/with-auth', () => ({
  withAuth: withAuthMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from '../route';

type Handler = (ctx: { supabase: unknown; user: { id: string } }) => Promise<Response>;

const sections = [
  'profiles',
  'buddy_state',
  'dream_funds',
  'active_challenges',
  'chat_messages',
  'health_events',
  'impulse_events',
  'user_embeddings',
  'email_receipts',
  'invitations',
  'butterfly_sessions',
  'challenge_participants',
] as const;

function createSupabase(failingSections: readonly string[]) {
  const userId = '00000000-0000-4000-8000-000000000001';

  const supabase = {
    from(section: string) {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => query,
        or: () => query,
        then: (
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          if (failingSections.includes(section)) {
            return onRejected?.(new Error(`${section} network failure`));
          }
          return onFulfilled?.({ data: [], error: null });
        },
      };

      return query;
    },
  };

  return { supabase, user: { id: userId } };
}

describe('GET /api/user/export-data', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.warn).mockClear();
    withAuthMock.mockClear();
    withAuthMock.mockImplementation((handler: unknown) => handler);
  });

  it('keeps the error marker and logs structured fields when a section throws', async () => {
    const handler = GET as unknown as Handler;
    const { supabase, user } = createSupabase(['profiles']);

    const response = await handler({ supabase, user } as never);
    const body = await response.json();

    expect(body.profiles).toEqual({ error: 'fetch_failed' });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('[Export] profiles fetch_failed', {
      section: 'profiles',
      requestId: expect.stringMatching(/^[a-z0-9]{8}$/),
      userId: user.id,
      error: 'profiles network failure',
    });
  });

  it('logs every failed section with the same request id', async () => {
    const handler = GET as unknown as Handler;
    const { supabase, user } = createSupabase(sections);

    const response = await handler({ supabase, user } as never);
    const body = await response.json();

    expect(logger.error).toHaveBeenCalledTimes(sections.length);
    for (const section of sections) {
      expect(body[section]).toEqual({ error: 'fetch_failed' });
    }

    const requestIds = vi
      .mocked(logger.error)
      .mock.calls.map(([, fields]) => (fields as { requestId: string }).requestId);
    expect(new Set(requestIds).size).toBe(1);
  });
});
