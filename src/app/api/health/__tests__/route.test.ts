import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() },
}));

const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedWarn = vi.mocked(logger.warn);

function makeSupabase(error: unknown = null) {
  const abortSignal = vi.fn((_signal: AbortSignal) => Promise.resolve({ error }));
  const limit = vi.fn(() => ({ abortSignal }));
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return {
    supabase: { from } as unknown as NonNullable<ReturnType<typeof createAdminClient>['supabase']>,
    select,
    limit,
    abortSignal,
  };
}

function makePostgrestError(code: string) {
  return { message: 'probe failed', code };
}

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
  mockedWarn.mockClear();
  process.env.LETTA_API_KEY = 'letta-key';
});

afterEach(() => {
  delete process.env.LETTA_API_KEY;
});

describe('GET /api/health', () => {
  it('returns ok when the profiles probe succeeds and Letta is configured', async () => {
    const probe = makeSupabase();
    const timeoutSignal = AbortSignal.timeout(1);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeoutSignal);
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ supabase: 'ok', letta: 'ok' });
    expect(probe.supabase.from).toHaveBeenCalledWith('profiles');
    expect(probe.select).toHaveBeenCalledWith('id', { head: true });
    expect(probe.limit).toHaveBeenCalledWith(1);
    expect(timeoutSpy).toHaveBeenCalledWith(4500);
    expect(probe.abortSignal).toHaveBeenCalledWith(timeoutSignal);
    timeoutSpy.mockRestore();
  });

  it('returns degraded when admin environment variables are missing', async () => {
    mockedCreateAdminClient.mockReturnValue({ supabase: null, error: 'missing environment' });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { supabase: 'fail', letta: 'ok' } });
  });

  it('does not probe the optional agent-count RPC', async () => {
    const probe = makeSupabase();
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });

    const response = await GET();
    const body = await response.json();

    expect(body.checks.supabase).toBe('ok');
    expect(probe.supabase.from).not.toHaveBeenCalledWith('get_available_agent_count');
  });

  it('returns degraded when the profiles table is unavailable', async () => {
    const probe = makeSupabase(makePostgrestError('PGRST205'));
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { supabase: 'fail', letta: 'ok' } });
  });

  it('returns degraded when the probe times out', async () => {
    const probe = makeSupabase(makePostgrestError(''));
    const controller = new AbortController();
    controller.abort();
    probe.abortSignal.mockImplementation((signal: AbortSignal) => {
      expect(signal.aborted).toBe(true);
      return Promise.resolve({ error: { message: 'The operation was aborted', code: '' } });
    });
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { supabase: 'fail', letta: 'ok' } });
  });

  it('returns degraded when the probe throws', async () => {
    const probe = makeSupabase();
    probe.abortSignal.mockRejectedValue(new Error('network unavailable'));
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { supabase: 'fail', letta: 'ok' } });
  });

  it('marks Letta skip only because this endpoint does not call the API without a key', async () => {
    const probe = makeSupabase();
    mockedCreateAdminClient.mockReturnValue({ supabase: probe.supabase, error: null });
    delete process.env.LETTA_API_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks).toEqual({ supabase: 'ok', letta: 'skip' });
  });
});
