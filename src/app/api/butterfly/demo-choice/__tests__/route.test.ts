import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  getDemoSession: vi.fn(),
  updateDemoSession: vi.fn(),
  validateBody: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/demo-session-store', () => ({
  getDemoSession: M.getDemoSession,
  updateDemoSession: M.updateDemoSession,
}));
vi.mock('@/lib/api-validation', () => ({
  validateBody: M.validateBody,
  isValidationError: (r: unknown) => (r as { __isValidationError?: boolean })?.__isValidationError === true,
}));

import { POST } from '../route';

const okBody = { sessionId: 'demo-1', chapterIndex: 3, selectedOption: 'A' };

function makeReq() {
  return { json: () => Promise.resolve(okBody) } as never;
}

/**
 * butterfly/demo-choice route (63行) — 演示模式选择提交 (Round 6 AUDIT-3 P0 #1)。
 *
 * 锁定:
 * - 校验失败 → 400 直通
 * - 会话不存在 → 404
 * - 成功: choice 构造 (id=chapter-时间戳/selectedOption) + choices 追加 + currentChapter 更新
 * - update 失败 → 500
 */
describe('POST /api/butterfly/demo-choice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateBody.mockResolvedValue({ ...okBody });
  });

  it('校验失败 → 400 直通 (不碰 store)', async () => {
    M.validateBody.mockResolvedValueOnce({ __isValidationError: true, status: 400 });
    const r = (await POST(makeReq())) as Response;
    expect(r.status).toBe(400);
    expect(M.getDemoSession).not.toHaveBeenCalled();
  });

  it('会话不存在 → 404', async () => {
    M.getDemoSession.mockReturnValueOnce(null);
    const r = (await POST(makeReq())) as Response;
    expect(r.status).toBe(404);
  });

  it('成功 → choice 追加+currentChapter 更新+session 回传', async () => {
    M.getDemoSession.mockReturnValueOnce({ choices: [{ id: 'old' }] });
    M.updateDemoSession.mockReturnValueOnce({ choices: [{ id: 'old' }, {}], currentChapter: 3 });
    const r = (await POST(makeReq())) as Response;
    const body = await r.json();
    expect(body.session.currentChapter).toBe(3);
    const patch = M.updateDemoSession.mock.calls[0][1] as { choices: unknown[]; currentChapter: number };
    expect(patch.currentChapter).toBe(3);
    expect(patch.choices).toHaveLength(2); // 旧 choice + 新 choice
    const newChoice = patch.choices[1] as { id: string; selectedOption: string; chapterIndex: number };
    expect(newChoice.id).toContain('choice-3-'); // chapterIndex+时间戳
    expect(newChoice.selectedOption).toBe('A');
  });

  it('update 失败 → 500', async () => {
    M.getDemoSession.mockReturnValueOnce({ choices: [] });
    M.updateDemoSession.mockReturnValueOnce(null);
    const r = (await POST(makeReq())) as Response;
    expect(r.status).toBe(500);
  });
});
