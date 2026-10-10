import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  resume: vi.fn(),
  validateBody: vi.fn(),
}));

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361 定案)
  withAuth: (fn: (args: unknown) => unknown, _opts?: unknown) => fn,
}));
vi.mock('@/lib/challenge-store', () => ({ resumeChallenge: M.resume }));
vi.mock('@/lib/api-validation', () => ({
  validateBody: M.validateBody,
  isValidationError: (r: unknown) => (r as { __isValidationError?: boolean })?.__isValidationError === true,
}));

import { GET as statsGET } from '../../stats/route';
import { POST as resumePOST } from '../route';

function makeStatsArgs(passed: number | null, failed: number | null, err: unknown = null) {
  let call = 0;
  return {
    supabase: {
      from: () => {
        call++;
        const count = call === 1 ? passed : failed;
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ count, error: call === 1 ? err : null }),
            }),
          }),
        };
      },
    },
    user: { id: 'u1' },
  };
}

/**
 * challenge/stats (46行) + challenge/resume (38行) 打包。
 *
 * 锁定:
 * - stats: passed+failed 双 count 查询; totalSaw=和; 任一 error → 500 (P1-3 不受 Clear 影响)
 * - resume: 校验失败直通; 成功形状映射 (snake→camel); 失败 → 500+error 透传
 */
describe('GET /api/challenge/stats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passed+failed → totalSaw 求和', async () => {
    const r = (await statsGET(makeStatsArgs(12, 5) as never)) as Response;
    expect(await r.json()).toEqual({ totalSaw: 17, totalPassed: 12, totalFailed: 5 });
  });

  it('count null → 0 兜底', async () => {
    const r = (await statsGET(makeStatsArgs(null, null) as never)) as Response;
    expect(await r.json()).toEqual({ totalSaw: 0, totalPassed: 0, totalFailed: 0 });
  });

  it('passed 查询 error → 500', async () => {
    const r = (await statsGET(makeStatsArgs(0, 0, { message: 'rls' }) as never)) as Response;
    expect(r.status).toBe(500);
  });
});

describe('POST /api/challenge/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateBody.mockResolvedValue({ challengeId: 'ch-1' });
  });

  it('校验失败 → 400 直通', async () => {
    M.validateBody.mockResolvedValueOnce({ __isValidationError: true, status: 400 });
    const r = (await resumePOST({ request: {}, user: { id: 'u1' } } as never)) as Response;
    expect(r.status).toBe(400);
    expect(M.resume).not.toHaveBeenCalled();
  });

  it('成功 → snake→camel 形状映射', async () => {
    M.resume.mockResolvedValueOnce({
      success: true,
      challenge: { id: 'ch-1', item_name: '耳机', amount: 299, challenge_type: 'impulse' },
    });
    const r = (await resumePOST({ request: {}, user: { id: 'u1' } } as never)) as Response;
    const body = await r.json();
    expect(body.challenge).toEqual({ challengeId: 'ch-1', itemName: '耳机', amount: 299, challengeType: 'impulse' });
    expect(M.resume).toHaveBeenCalledWith('ch-1', 'u1');
  });

  it('resume 失败 → 500+error 透传', async () => {
    M.resume.mockResolvedValueOnce({ success: false, error: 'not expired' });
    const r = (await resumePOST({ request: {}, user: { id: 'u1' } } as never)) as Response;
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('not expired');
  });
});
