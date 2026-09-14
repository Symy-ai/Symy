/* eslint-disable require-await */
/**
 * batch44-a: 盲区地图 + 周守护 streak 注入到 Letta prompt 的上下文装配测试。
 *
 * 覆盖:
 * 1. `/api/blind-spot-map` 返回 2 条可见盲区 → `userContentWithStage` 含 `blind_spot:`
 * 2. `buddy_state` streak 注入 → `userContentWithStage` 含 `weekly_streak:`
 * 3. fetch 失败 → 静默降级，其余内容正常
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadLettaTurnContext } from '../letta-turn-context';

if (typeof globalThis.fetch !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
}

function createSupabaseMock() {
  const maybeSingle = vi.fn(async () => ({ data: { streak: 7, vitality: 80, health: 'balanced', level: 3, total_saved: 1234, challenges_completed: 12 }, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, maybeSingle };
}

describe('loadLettaTurnContext — batch44-a profile awareness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zh locale: injects blind spots and weekly streak into prompt', async () => {
    const supabase = createSupabaseMock();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        blind_spots: [
          { type: 'night', rate: 67, sample_count: 20, show: true },
          { type: 'livestream', rate: 45, sample_count: 12, show: true },
          { type: 'emotional', rate: null, sample_count: 4, show: false },
        ],
      }),
    }));

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: 'user-123',
      supabase: supabase as any,
      userContent: '今天要控制一下',
      locale: 'zh',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).toContain('blind_spot: night 67%');
    expect(result.userContentWithStage).toContain('blind_spot: livestream 45%');
    expect(result.userContentWithStage).toContain('weekly_streak: 7 days');
    expect(result.userContentWithStage).toContain('[PROFILE AWARENESS:');
    // zh 路径应为中文 prompt
    expect(result.userContentWithStage).toContain('我注意到你的夜间盲区是 67%');
  });

  it('en locale: injects blind spots and weekly streak into prompt', async () => {
    const supabase = createSupabaseMock();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        blind_spots: [
          { type: 'night', rate: 67, sample_count: 20, show: true },
          { type: 'amount', rate: 55, sample_count: 14, show: true },
        ],
      }),
    }));

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: 'user-123',
      supabase: supabase as any,
      userContent: 'help me stay on track',
      locale: 'en',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).toContain('blind_spot: night 67%');
    expect(result.userContentWithStage).toContain('blind_spot: amount 55%');
    expect(result.userContentWithStage).toContain('weekly_streak: 7 days');
    expect(result.userContentWithStage).toContain('[PROFILE AWARENESS:');
    // en 路径应为英文 prompt
    expect(result.userContentWithStage).toContain('I saw your night blind spot is at 67%');
  });

  it('falls back gracefully when blind-spot-map fetch fails', async () => {
    const supabase = createSupabaseMock();

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
    }));

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: 'user-123',
      supabase: supabase as any,
      userContent: 'still works',
      locale: 'en',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).not.toContain('blind_spot:');
    expect(result.userContentWithStage).toContain('weekly_streak: 7 days');
    expect(result.userContentWithStage).toContain('[PROFILE AWARENESS:');
  });

  it('falls back gracefully when blind-spot-map throws', async () => {
    const supabase = createSupabaseMock();

    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: 'user-123',
      supabase: supabase as any,
      userContent: 'still works',
      locale: 'en',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).not.toContain('blind_spot:');
    expect(result.userContentWithStage).toContain('weekly_streak: 7 days');
  });

  it('filters blind spots: show=false or sample_count<10 are excluded, max 2', async () => {
    const supabase = createSupabaseMock();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        blind_spots: [
          { type: 'night', rate: 67, sample_count: 20, show: true },
          { type: 'livestream', rate: 45, sample_count: 8, show: true },
          { type: 'amount', rate: 55, sample_count: 14, show: false },
          { type: 'impulse', rate: 30, sample_count: 50, show: true },
        ],
      }),
    }));

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: 'user-123',
      supabase: supabase as any,
      userContent: 'msg',
      locale: 'en',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).toContain('blind_spot: night 67%');
    expect(result.userContentWithStage).toContain('blind_spot: impulse 30%');
    expect(result.userContentWithStage).not.toContain('blind_spot: livestream');
    expect(result.userContentWithStage).not.toContain('blind_spot: amount');
  });

  it('omits blind spot and weekly streak when userId is missing', async () => {
    const fetchMock = vi.fn();

    (globalThis as any).fetch = fetchMock;

    const result = await loadLettaTurnContext({
      userId: undefined,
      supabase: null,
      userContent: 'msg',
      locale: 'zh',
      greenPref: 'on',
      impulseContext: undefined,
      validChallengeContext: undefined,
      factsStore: undefined,
    });

    expect(result.userContentWithStage).not.toContain('blind_spot:');
    expect(result.userContentWithStage).not.toContain('weekly_streak:');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
