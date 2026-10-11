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
  // 🔧 R571: GDPR 补全 13 表
  'user_inventory',
  'shopping_facts',
  'refund_requests',
  'heal_sessions',
  'daily_reflections',
  'daily_reflection_votes',
  'inward_daily_reflection',
  'inward_reflection_resonates',
  'inward_why_wall',
  'user_intervention_profile',
  'premium_waitlist',
  'push_notification_log',
  'push_subscriptions',
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

  it('成功路径 → 12 section 全透传 + 下载契约头 (attachment/no-store)', async () => {
    const handler = GET as unknown as Handler;
    const { supabase, user } = createSupabase([]);
    const response = await handler({ supabase, user } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="symy-data-export-00000000-/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    for (const section of sections) {
      expect(body[section]).toEqual([]);
    }
  });

  it('query error (非 throw) → warn 日志 + 数据回退空数组, 响应仍 200', async () => {
    // or() 路径: maybeSingle 错误 → route 走 if(error) warn 分支
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
            onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
            _onRejected?: (reason: unknown) => unknown
          ) => {
            if (section === 'chat_messages') {
              return onFulfilled?.({ data: null, error: { message: 'rls denied' } });
            }
            return onFulfilled?.({ data: [], error: null });
          },
        };
        return query;
      },
    };
    const handler = GET as unknown as Handler;
    const response = await handler({ supabase, user: { id: userId } } as never);
    expect(response.status).toBe(200);
    expect(logger.warn).toHaveBeenCalledWith('[Export] chat_messages query error:', 'rls denied');
    const body = await response.json();
    expect(body.chat_messages).toEqual([]);
  });

  it('Content-Disposition filename 含 userId 前8位 + 时间戳 (防泄漏: 只露前缀)', async () => {
    const handler = GET as unknown as Handler;
    const { supabase, user } = createSupabase([]);
    const response = await handler({ supabase, user } as never);
    const cd = response.headers.get('Content-Disposition') ?? '';
    // userId = 00000000-0000-4000-8000-000000000001 → 只露前 8 位
    expect(cd).not.toContain(user.id);
    expect(cd).toContain(user.id.substring(0, 8));
  });

  it('R571 GDPR 补全: push_subscriptions 凭据列过滤 (select 不含 endpoint/p256dh_key/auth_key)', async () => {
    const handler = GET as unknown as Handler;
    const { supabase, user } = createSupabase([]);
    const selectSpyCalls: Array<{ section: string; columns: string }> = [];

    // 包装 supabase.from 捕获 push_subscriptions 的 select 列
    const origFrom = supabase.from.bind(supabase);
    const wrapped = {
      from(section: string) {
        const query = origFrom(section) as unknown as Record<string, (...args: unknown[]) => unknown>;
        return {
          select: (...selectArgs: unknown[]) => {
            if (section === 'push_subscriptions') {
              selectSpyCalls.push({ section, columns: String(selectArgs[0] ?? '') });
            }
            return query.select(...selectArgs);
          },
          eq: (...eqArgs: unknown[]) => query.eq(...eqArgs),
          order: (...orderArgs: unknown[]) => query.order(...orderArgs),
          limit: (...limitArgs: unknown[]) => query.limit(...limitArgs),
          maybeSingle: () => query.maybeSingle(),
          or: (...orArgs: unknown[]) => query.or(...orArgs),
          then: query.then.bind(query) as typeof query.then,
        };
      },
    };

    await handler({ supabase: wrapped, user } as never);

    expect(selectSpyCalls.length).toBe(1);
    const cols = selectSpyCalls[0].columns;
    expect(cols).toContain('preferences');
    expect(cols).toContain('created_at');
    expect(cols).not.toContain('endpoint');
    expect(cols).not.toContain('p256dh_key');
    expect(cols).not.toContain('auth_key');
  });
});
