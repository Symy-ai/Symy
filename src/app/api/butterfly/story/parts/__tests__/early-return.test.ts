import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  complete: vi.fn(() => Promise.resolve({ storyCompleteData: { summary: '全程总结', sessionId: 's1' } })),
}));

vi.mock('../complete-story', () => ({
  completeStorySession: M.complete,
}));

import { handleStoryCompleteEarlyReturn } from '../early-return';
import type { ButterflySession } from '@/features/butterfly/types';

function makeSession(chapters: { tone?: string }[] = []): ButterflySession {
  return {
    outline: { chapters },
    choices: ['left', 'right'],
  } as unknown as ButterflySession;
}

const params = {
  supabase: {} as never,
  user: { id: 'u1' },
  sessionRowUpdatedAt: '2026-10-10T00:00:00Z',
};

/**
 * early-return.ts (69行) — 全章节讲完早返回 (Round 79 拆分)。
 *
 * 锁定:
 * - completeStorySession 全参透传 (finalTone 取末章 tone)
 * - 末章无 tone → 'twist' 兜底
 * - SSE 响应体含 story_complete 事件 (真流解析)
 */
describe('handleStoryCompleteEarlyReturn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.complete.mockReturnValue(Promise.resolve({ storyCompleteData: { summary: '全程总结', sessionId: 's1' } }));
  });

  it('全参透传+finalTone=末章 tone', async () => {
    const session = makeSession([{ tone: 'bittersweet' }, { tone: 'hopeful' }]);
    const { response } = await handleStoryCompleteEarlyReturn({ ...params, session });
    expect(M.complete).toHaveBeenCalledWith(expect.objectContaining({
      user: { id: 'u1' },
      session,
      sessionRowUpdatedAt: '2026-10-10T00:00:00Z',
      finalTone: 'hopeful', // 末章
      sessionForSummary: session,
      choicesForAgentClear: ['left', 'right'],
    }));
    expect(response.headers.get('content-type')).toContain('text/event-stream');
  });

  it('末章无 tone → twist 兜底', async () => {
    const session = makeSession([{ tone: 'dark' }, {}]);
    await handleStoryCompleteEarlyReturn({ ...params, session });
    expect(M.complete).toHaveBeenCalledWith(expect.objectContaining({ finalTone: 'twist' }));
  });

  it('零章 → twist 兜底 (不炸)', async () => {
    const session = makeSession([]);
    await handleStoryCompleteEarlyReturn({ ...params, session });
    expect(M.complete).toHaveBeenCalledWith(expect.objectContaining({ finalTone: 'twist' }));
  });

  it('SSE 体含 story_complete 事件 (真流读取)', async () => {
    const session = makeSession([{ tone: 'warm' }]);
    const { response } = await handleStoryCompleteEarlyReturn({ ...params, session });
    const text = await response.text();
    expect(text).toContain('story_complete');
    expect(text).toContain('全程总结'); // storyCompleteData 序列化进流
  });
});
