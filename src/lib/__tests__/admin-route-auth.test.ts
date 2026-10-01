/* eslint-disable require-await -- test mocks use async for API consistency */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  process.env.LETTA_API_KEY = 'test-letta-key';
  process.env.EMBEDDING_API_KEY = 'test-embedding-key';
});

const authState = { authorized: true };

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: authState.authorized, actor: 'admin' })),
}));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: vi.fn((_request: unknown, _auth: unknown, handler: () => unknown) => handler()),
  logUnauthorizedAdminAttempt: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: null, error: 'not configured' })),
}));
vi.mock('@/lib/letta-agent-pool', () => ({
  getPoolStatus: vi.fn(async () => ({ available: 1, assigned: 0 })),
  checkAndRefill: vi.fn(async () => ({ created: 0 })),
}));
vi.mock('../_lib/create-weekly-challenges-helper', () => ({
  createWeeklyChallengesWithFallback: vi.fn(async () => ({ success: true, usedFallback: false })),
}));
vi.mock('@/lib/cultivation', () => ({
  getProfile: vi.fn(),
  reassessProfile: vi.fn(),
}));
vi.mock('@/lib/admin-settings', () => ({
  checkEnvVars: vi.fn(() => []),
  getCronJobs: vi.fn(async () => []),
  getMigrationsInfo: vi.fn(async () => ({ migrations: [] })),
  runHealthChecks: vi.fn(async () => []),
}));
vi.mock('@/lib/letta-agent-admin', () => ({
  listAllUserAgents: vi.fn(async () => []),
  enableSleeptimeForAllAgents: vi.fn(),
  updateAllUserAgentModels: vi.fn(),
}));
vi.mock('@/lib/letta-http', () => ({
  LETTA_API_TIMEOUT_MS: 15_000,
  getLettaClient: vi.fn(() => ({})),
  lettaAPI: vi.fn(async () => new Response('[]', { status: 200 })),
}));
vi.mock('@/lib/letta-agent-manager', () => ({
  createAgentForUser: vi.fn(),
  enableSleeptimeForAgent: vi.fn(),
  getUserAgentId: vi.fn(),
}));
vi.mock('@/lib/letta-blocks', () => ({ upsertAgentBlock: vi.fn() }));
vi.mock('@/lib/letta-agent-validation', () => ({ validateAgentId: vi.fn() }));
vi.mock('@/lib/symy-persona', () => ({ SYMY_PERSONA_BLOCK: 'persona' }));
vi.mock('@/lib/letta-agent-tools', () => ({ SYMY_TOOL_RULES_BLOCK: 'rules' }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: authState.authorized
            ? { email: 'admin@example.com' }
            : { email: 'user@example.com' },
        },
        error: null,
      })),
    },
  })),
}));

import * as agentPool from '../../app/api/admin/agent-pool/route';
import * as agentPoolAuth from '../../app/api/admin/agent-pool-auth/route';
import * as audit from '../../app/api/admin/audit/route';
import * as weekly from '../../app/api/admin/create-weekly-challenges/route';
import * as weeklyAuth from '../../app/api/admin/create-weekly-challenges-auth/route';
import * as cultivation from '../../app/api/admin/cultivation/route';
import * as embeddings from '../../app/api/admin/embeddings/route';
import * as embeddingsTest from '../../app/api/admin/embeddings/test/route';
import * as lettaDiag from '../../app/api/admin/letta-diag/route';
import * as letta from '../../app/api/admin/letta/route';
import * as settings from '../../app/api/admin/settings/route';
import * as settingsEnv from '../../app/api/admin/settings/env/route';
import * as settingsHealth from '../../app/api/admin/settings/health/route';
import * as settingsMigrations from '../../app/api/admin/settings/migrations/route';
import * as users from '../../app/api/admin/users/route';
import * as userDetail from '../../app/api/admin/users/[id]/route';
import * as vip from '../../app/api/admin/vip/route';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { createServerClient } from '@supabase/ssr';

type Handler = (request: NextRequest, ...rest: any[]) => Promise<Response> | Response;

function request(url: string, method: string, body?: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, body });
}

// biome-ignore lint: 测试矩阵里 detail 路由 handler 需要 params context, 其余传 undefined
async function run(handler: Handler, url: string, method: string, body?: string, context?: unknown) {
  return handler(request(url, method, body), context as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authorized = false;
  vi.mocked(verifyAdminAuth).mockImplementation(() => ({
    authorized: authState.authorized,
    actor: authState.authorized ? 'admin' : undefined,
    error: authState.authorized ? undefined : 'Missing admin credentials',
  }));
  vi.mocked(cookies).mockResolvedValue({ getAll: () => [] } as never);
  vi.mocked(createServerClient).mockImplementation(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authState.authorized ? { email: 'admin@example.com' } : null },
        error: null,
      })),
    },
  }) as never);
});

describe('admin route authentication matrix', () => {
  it('rejects every admin handler without credentials', async () => {
    const userId = '0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f';
    const detailContext = () => ({ params: Promise.resolve({ id: userId }) });
    const cases: Array<[string, Handler, string, string, string | undefined, unknown, number]> = [
      ['agent-pool GET', agentPool.GET, '/api/admin/agent-pool', 'GET', undefined, undefined, 401],
      ['agent-pool POST', agentPool.POST, '/api/admin/agent-pool', 'POST', '{}', undefined, 401],
      ['agent-pool-auth GET', agentPoolAuth.GET, '/api/admin/agent-pool-auth', 'GET', undefined, undefined, 401],
      ['agent-pool-auth POST', agentPoolAuth.POST, '/api/admin/agent-pool-auth', 'POST', undefined, undefined, 401],
      ['audit GET', audit.GET, '/api/admin/audit', 'GET', undefined, undefined, 403],
      ['weekly POST', weekly.POST, '/api/admin/create-weekly-challenges', 'POST', '{}', undefined, 401],
      ['weekly-auth POST', weeklyAuth.POST, '/api/admin/create-weekly-challenges-auth', 'POST', '{}', undefined, 401],
      ['cultivation GET', cultivation.GET, '/api/admin/cultivation', 'GET', undefined, undefined, 403],
      ['cultivation POST', cultivation.POST, '/api/admin/cultivation?action=assess&user_id=x', 'POST', undefined, undefined, 403],
      ['embeddings GET', embeddings.GET, '/api/admin/embeddings', 'GET', undefined, undefined, 403],
      ['embeddings POST', embeddings.POST, '/api/admin/embeddings?action=backfill_user&user_id=x', 'POST', undefined, undefined, 403],
      ['embeddings-test GET', embeddingsTest.GET, '/api/admin/embeddings/test', 'GET', undefined, undefined, 403],
      ['letta-diag GET', lettaDiag.GET, '/api/admin/letta-diag', 'GET', undefined, undefined, 401],
      ['letta GET', letta.GET, '/api/admin/letta', 'GET', undefined, undefined, 401],
      ['letta POST', letta.POST, '/api/admin/letta', 'POST', '{}', undefined, 401],
      ['settings GET', settings.GET, '/api/admin/settings', 'GET', undefined, undefined, 401],
      ['settings POST', settings.POST, '/api/admin/settings', 'POST', '{"action":"health_check"}', undefined, 401],
      ['settings-env GET', settingsEnv.GET, '/api/admin/settings/env', 'GET', undefined, undefined, 401],
      ['settings-health GET', settingsHealth.GET, '/api/admin/settings/health', 'GET', undefined, undefined, 401],
      ['settings-migrations GET', settingsMigrations.GET, '/api/admin/settings/migrations', 'GET', undefined, undefined, 401],
      ['users GET', users.GET, '/api/admin/users', 'GET', undefined, undefined, 401],
      ['users POST', users.POST, '/api/admin/users', 'POST', '{}', undefined, 401],
      ['user-detail GET', userDetail.GET, `/api/admin/users/${userId}`, 'GET', undefined, detailContext(), 401],
      ['user-detail DELETE', userDetail.DELETE, `/api/admin/users/${userId}`, 'DELETE', undefined, detailContext(), 401],
      ['vip GET', vip.GET, '/api/admin/vip', 'GET', undefined, undefined, 401],
      ['vip POST', vip.POST, '/api/admin/vip', 'POST', '{}', undefined, 401],
    ];

    for (const [name, handler, url, method, body, context, expectedStatus] of cases) {
      const response = await run(handler, url, method, body, context);
      expect(response.status, name).toBe(expectedStatus);
    }
    expect(vi.mocked(verifyAdminAuth).mock.calls.length).toBeGreaterThanOrEqual(22);
  });

  it('allows representative handlers through the admin guard', async () => {
    authState.authorized = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":[]}', { status: 200 })));

    const pool = await agentPool.GET(request('/api/admin/agent-pool', 'GET'));
    expect(pool.status).toBe(200);

    const poolAuth = await agentPoolAuth.GET(request('/api/admin/agent-pool-auth', 'GET'));
    expect(poolAuth.status).toBe(200);

    const lettaGet = await letta.GET(request('/api/admin/letta', 'GET'));
    expect(lettaGet.status).toBe(200);

    const lettaPost = await letta.POST(request('/api/admin/letta', 'POST', '{"action":"unknown"}'));
    expect(lettaPost.status).toBe(400);

    const env = await settingsEnv.GET(request('/api/admin/settings/env', 'GET'));
    expect(env.status).toBe(200);

    const embeddingTest = await embeddingsTest.GET(request('/api/admin/embeddings/test', 'GET'));
    expect(embeddingTest.status).toBe(200);
  });
});
