import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  validateActionBody: vi.fn(),
  createAdminClient: vi.fn(),
  validateAgentId: vi.fn(() => true),
  upsertAgentBlock: vi.fn(),
  agentsUpdate: vi.fn(),
}));

vi.mock('../_shared', () => ({
  validateActionBody: M.validateActionBody,
  lettaAPI: vi.fn(),
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/letta-agent-validation', () => ({ validateAgentId: M.validateAgentId }));
vi.mock('@/lib/letta-blocks', () => ({ upsertAgentBlock: M.upsertAgentBlock }));
vi.mock('@/lib/symy-persona', () => ({ SYMY_PERSONA_BLOCK: 'PERSONA-CONTENT' }));
vi.mock('@/lib/letta-agent-tools', () => ({ SYMY_TOOL_RULES_BLOCK: 'TOOL-RULES-V4' }));
vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>();
  return { ...orig, readFileSync: () => '# ELEPHANT PROMPT' };
});

import { handleUpdateAgentPersona } from '../update_agent_persona';

function makeCtx() {
  return { client: { agents: { update: M.agentsUpdate } } } as never;
}

/**
 * update_agent_persona.ts (120行) — 存量 agent 人设迁移 (镜子→绿色小象 2026-09-05)。
 *
 * 锁定:
 * - prompt 缺失 → 500
 * - 单 agent 模式: 坏 agent_id → 400; 成功 → 三件套 (system+persona block+tool_rules block)
 * - update_system=false → 跳过 system 只刷双 block
 * - 全量模式: 遍历 profiles, 失败计数, 版本号锚
 */
describe('handleUpdateAgentPersona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: {} }); // 默认全量
    M.validateAgentId.mockReturnValue(true);
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            not: () =>
              Promise.resolve({
                data: [{ letta_agent_id: 'agent-1' }, { letta_agent_id: 'agent-2' }],
              }),
          }),
        }),
      },
    });
    M.agentsUpdate.mockResolvedValue({});
    M.upsertAgentBlock.mockResolvedValue(undefined);
  });

  it('prompt 缺失 → 500', async () => {
    const fs = await import('fs');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const r = (await handleUpdateAgentPersona(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('单 agent: 坏 id 格式 → 400', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'bad!!id' } });
    M.validateAgentId.mockReturnValueOnce(false);
    const r = (await handleUpdateAgentPersona(makeCtx())) as Response;
    expect(r.status).toBe(400);
  });

  it('单 agent: 三件套 upsert (system+persona+tool_rules)', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'agent-good' } });
    const r = (await handleUpdateAgentPersona(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.updated).toBe(1);
    expect(M.agentsUpdate).toHaveBeenCalledWith('agent-good', { system: '# ELEPHANT PROMPT' });
    expect(M.upsertAgentBlock).toHaveBeenCalledWith('agent-good', 'persona', 'PERSONA-CONTENT', 5000);
    expect(M.upsertAgentBlock).toHaveBeenCalledWith('agent-good', 'symy_tool_rules', 'TOOL-RULES-V4', 2000);
  });

  it('update_system=false → 跳过 system 只双 block', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'agent-good', update_system: false } });
    await handleUpdateAgentPersona(makeCtx());
    expect(M.agentsUpdate).not.toHaveBeenCalled();
    expect(M.upsertAgentBlock).toHaveBeenCalledTimes(2);
  });

  it('全量: 遍历+失败计数+版本号锚', async () => {
    M.upsertAgentBlock.mockRejectedValueOnce(new Error('block api down')); // agent-1 挂
    const r = (await handleUpdateAgentPersona(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.total).toBe(2);
    expect(body.personaVersion).toBe('green-elephant-2026-09-05');
    expect(body.toolRulesVersion).toBe('SYMY_TOOL_RULES_V4');
  });
});
