import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔒 getUserAgentId 瞬态失败重试回归锁 (2026-09-30, "Symy is quiet" 间歇 503)
 *
 * 事故: profiles 查询瞬时抖动 → data=undefined, error 存在 → 旧代码无 error 分支,
 * 直接 return null → 已有 agent 的用户被打 503 "AI service temporarily unavailable"。
 * 生产时间线: 02:29-02:35 zh 探针连续 503, 02:39 起自愈 (Supabase 抖动窗口)。
 *
 * 修法: 查询失败 ≠ 没有 agent — 退避 250ms 重试一次。
 */
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { from: mockFrom } }),
}));

import { getUserAgentId } from '../letta-agent-manager';

describe('getUserAgentId 瞬态失败重试 (Symy is quiet 503 修复)', () => {
  beforeEach(() => { vi.restoreAllMocks(); mockMaybeSingle.mockReset(); });

  it('正常查询: 返回 letta_agent_id 不重试', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { letta_agent_id: 'agent-123' }, error: null });
    const r = await getUserAgentId('7018f956-ad98-41ce-95cf-bcea402b2503');
    expect(r).toBe('agent-123');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('profile 存在但 letta_agent_id 为 null: 返回 null 不重试 (真没有 agent ≠ 失败)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { letta_agent_id: null }, error: null });
    const r = await getUserAgentId('7018f956-ad98-41ce-95cf-bcea402b2503');
    expect(r).toBeNull();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('瞬态失败→重试成功: 第二次返回数据, 不再打用户 503', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset', code: 'PGRST301' } })
      .mockResolvedValueOnce({ data: { letta_agent_id: 'agent-456' }, error: null });
    const r = await getUserAgentId('7018f956-ad98-41ce-95cf-bcea402b2503');
    expect(r).toBe('agent-456');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  it('持续失败→两次都挂: 落 null (此时 503 文案与真实状态一致)', async () => {
    mockMaybeSingle
      .mockResolvedValue({ data: null, error: { message: 'persistent outage', code: 'PGRST301' } });
    const r = await getUserAgentId('7018f956-ad98-41ce-95cf-bcea402b2503');
    expect(r).toBeNull();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });
});
