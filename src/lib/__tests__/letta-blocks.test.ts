/**
 * letta-blocks 共享层测试 — Lane A (09-29)
 *
 * 覆盖: listAgentBlocks 成功 / !ok throw (含 status) /
 *       upsertAgentBlock PATCH 分支 (同名 label + value 变更 → PATCH {value}, 零创建) /
 *       幂等 (value 相同 → 仅 list 一次, 零 PATCH 零 POST) /
 *       创建分支 (list 无同名 → POST /blocks {label,value,limit} → 取 id → PATCH attach) /
 *       错误路径 (POST !ok / attach !ok / 返回体缺 id → throw 含上下文)。
 *
 * mock 面: letta-mcp-manager (lettaAPI REST 封装) 全替 —
 * 响应形状 { ok, status, json } as unknown as Response, 与 letta-facts-sync.test.ts 同构。
 * letta-blocks 自查 res.ok 后手动 throw, 故无需 mock LettaAPIError。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/letta-mcp-manager', () => ({
  lettaAPI: vi.fn(),
}));

import { lettaAPI } from '@/lib/letta-mcp-manager';
import { listAgentBlocks, upsertAgentBlock } from '../letta-blocks';

const AGENT_ID = 'agent-1';
const LABEL = 'shopping_facts';
const LIST_PATH = `/agents/${AGENT_ID}/core-memory/blocks`;

/** 构造 ok Response (共享层只读 ok/status/json 三个字段) */
function ok(json: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(json) } as unknown as Response;
}

/** 构造 !ok Response (throw 信息含 status, 必须带真实 status) */
function bad(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listAgentBlocks', () => {
  it('成功 → 原样返回 blocks 数组, GET list 端点', async () => {
    const blocks = [
      { id: 'b-1', label: 'persona', value: '契约小象', limit: 2000 },
      { id: 'b-2', label: LABEL, value: 'size: EU 42', limit: 500 },
    ];
    vi.mocked(lettaAPI).mockResolvedValue(ok(blocks));
    await expect(listAgentBlocks(AGENT_ID)).resolves.toEqual(blocks);
    expect(vi.mocked(lettaAPI).mock.calls[0][0]).toBe(LIST_PATH);
  });

  it('!ok → throw 含 HTTP status', async () => {
    vi.mocked(lettaAPI).mockResolvedValue(bad(503));
    await expect(listAgentBlocks(AGENT_ID)).rejects.toThrow('list blocks HTTP 503');
  });
});

describe('upsertAgentBlock — PATCH 分支 (同名 label 已存在)', () => {
  it('value 不同 → PATCH {value}, 零 POST 零 attach', async () => {
    vi.mocked(lettaAPI).mockResolvedValue(
      ok([{ id: 'b-2', label: LABEL, value: 'old value', limit: 500 }]),
    );

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'new value', 500)).resolves.toEqual({
      created: false,
    });

    // 恰好两跳: list + PATCH; 不走 /blocks 创建, 也不 attach
    expect(lettaAPI).toHaveBeenCalledTimes(2);
    const [patchPath, patchOptions] = vi.mocked(lettaAPI).mock.calls[1];
    expect(patchPath).toBe(`${LIST_PATH}/${LABEL}`);
    expect(patchOptions?.method).toBe('PATCH');
    expect(JSON.parse(String(patchOptions?.body))).toEqual({ value: 'new value' });
    const touched = vi.mocked(lettaAPI).mock.calls.map(([p]) => p);
    expect(touched.some((p) => p === '/blocks')).toBe(false);
    expect(touched.some((p) => p.includes('/attach/'))).toBe(false);
  });

  it('幂等: value 相同 → 只 list 一次, 零 PATCH 零 POST', async () => {
    vi.mocked(lettaAPI).mockResolvedValue(
      ok([{ id: 'b-2', label: LABEL, value: 'same value', limit: 500 }]),
    );

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'same value', 500)).resolves.toEqual({
      created: false,
    });

    expect(lettaAPI).toHaveBeenCalledTimes(1);
    expect(vi.mocked(lettaAPI).mock.calls[0][0]).toBe(LIST_PATH);
    expect(vi.mocked(lettaAPI).mock.calls[0][1]).toBeUndefined(); // 纯 GET, 无 init
  });
});

describe('upsertAgentBlock — 创建分支 (list 无同名)', () => {
  it('全链: POST /blocks {label,value,limit} → 取 id → PATCH attach/{blockId}', async () => {
    vi.mocked(lettaAPI).mockImplementation((path: string) => {
      if (path === '/blocks') {
        return Promise.resolve(ok({ id: 'block-xyz', label: LABEL }));
      }
      return Promise.resolve(ok([])); // list 与 attach 均走此兜底
    });

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'fresh value', 500)).resolves.toEqual({
      created: true,
    });

    expect(lettaAPI).toHaveBeenCalledTimes(3);
    expect(vi.mocked(lettaAPI).mock.calls[0][0]).toBe(LIST_PATH);

    const [createPath, createOptions] = vi.mocked(lettaAPI).mock.calls[1];
    expect(createPath).toBe('/blocks');
    expect(createOptions?.method).toBe('POST');
    expect(JSON.parse(String(createOptions?.body))).toEqual({
      label: LABEL,
      value: 'fresh value',
      limit: 500,
    });

    const [attachPath, attachOptions] = vi.mocked(lettaAPI).mock.calls[2];
    expect(attachPath).toBe(`${LIST_PATH}/attach/block-xyz`);
    expect(attachOptions?.method).toBe('PATCH');
  });

  it('POST /blocks !ok → throw 含 label 与 status, 失败即止不 attach', async () => {
    vi.mocked(lettaAPI).mockImplementation((path: string) => {
      if (path === '/blocks') return Promise.resolve(bad(400));
      return Promise.resolve(ok([]));
    });

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'v', 500)).rejects.toThrow(
      `create block ${LABEL} HTTP 400`,
    );
    expect(lettaAPI).toHaveBeenCalledTimes(2); // list + 失败的 POST, 无第三跳
  });

  it('attach !ok → throw 含 label 与 status', async () => {
    vi.mocked(lettaAPI).mockImplementation((path: string) => {
      if (path === '/blocks') return Promise.resolve(ok({ id: 'block-xyz' }));
      if (path.includes('/attach/')) return Promise.resolve(bad(500));
      return Promise.resolve(ok([]));
    });

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'v', 500)).rejects.toThrow(
      `attach ${LABEL} HTTP 500`,
    );
  });

  it('POST /blocks 返回体缺 id → throw, 不触 attach', async () => {
    vi.mocked(lettaAPI).mockImplementation((path: string) => {
      if (path === '/blocks') return Promise.resolve(ok({ label: LABEL })); // 无 id 字段
      return Promise.resolve(ok([]));
    });

    await expect(upsertAgentBlock(AGENT_ID, LABEL, 'v', 500)).rejects.toThrow(
      `create block ${LABEL}: no id in response`,
    );
    const touched = vi.mocked(lettaAPI).mock.calls.map(([p]) => p);
    expect(touched.some((p) => p.includes('/attach/'))).toBe(false);
  });
});
