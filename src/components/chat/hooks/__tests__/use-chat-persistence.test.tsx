/**
 * useChatPersistence tests (batch75-b — testgap 盲区补测, v3 §五 / v8 #17)
 *
 * 覆盖 (断言与现状对齐):
 *  - saveMessage: 无 userId 不发请求; tempId 去重 (NEW-016/017); >100 条裁至最近 50;
 *    content>10000 / reasoning>50000 截断 (对齐后端 zod); role='action'→'user' (P1);
 *    mode 三级回退; 成功 id 重映射; 失败 warn + tempId 释放可重试 (NEW-016/017)
 *  - deleteMessage: 乐观过滤 + 无 userId 不发请求; URL 编码 (BUG-183)
 *  - loadMoreMessages: 四重 guard; mode 过滤翻页 (P0 Bug 2); 按 id 双重去重;
 *    firstItemIndex 前移 deduped 数量; hasMore 缺省 false; 空页关 hasMore;
 *    失败 warn + in-flight 标志复位
 */
// @vitest-environment happy-dom

import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useChatPersistence, type ChatPersistenceParams } from '../use-chat-persistence';
import { apiFetch, apiFetchVoid } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/components/chat-bubble';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'temp-1',
    role: 'user',
    content: 'hello',
    timestamp: new Date('2026-09-15T10:00:00Z'),
    ...overrides,
  };
}

type SetSync = ChatPersistenceParams['setMessagesSync'];

function setup(overrides: Partial<ChatPersistenceParams> = {}) {
  let state: ChatMessage[] = [msg({ id: 'm1' }), msg({ id: 'm2', role: 'assistant', content: 'hi' })];
  const setMessagesSync = vi.fn(((action: Parameters<SetSync>[0]) => {
    state = typeof action === 'function' ? action(state) : action;
    return state;
  }) as SetSync);
  const setHasMore = vi.fn();
  const setFirstItemIndex = vi.fn(((action: Parameters<ChatPersistenceParams['setFirstItemIndex']>[0]) =>
    typeof action === 'function' ? action(10) : action) as ChatPersistenceParams['setFirstItemIndex']);
  const setIsLoadingMore = vi.fn();
  const isLoadingMoreRef = { current: false };
  const messagesRef = { current: state };

  const params: ChatPersistenceParams = {
    userId: 'user-1',
    activeChallenge: undefined,
    messagesRef,
    setMessagesSync,
    hasMore: true,
    setHasMore,
    setFirstItemIndex,
    isLoadingMoreRef,
    setIsLoadingMore,
    pageSize: 20,
    ...overrides,
  };

  const { result, unmount } = renderHook(() => useChatPersistence(params));
  return {
    result,
    unmount,
    params,
    messagesRef,
    getState: () => state,
    setMessagesSync,
    setHasMore,
    setFirstItemIndex,
    setIsLoadingMore,
    isLoadingMoreRef,
  };
}

function postCalls() {
  return vi.mocked(apiFetch).mock.calls.filter(([url]) => url === '/api/chat/history');
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetchVoid).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({});
  vi.mocked(apiFetchVoid).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useChatPersistence — saveMessage', () => {
  it('无 userId → 不发请求', () => {
    const { result } = setup({ userId: undefined });
    act(() => result.current.saveMessage(msg()));
    expect(postCalls()).toHaveLength(0);
  });

  it('同一 tempId 只保存一次 (NEW-016/017): 内容变化也不重发', () => {
    const { result } = setup();
    act(() => result.current.saveMessage(msg({ content: 'v1' })));
    act(() => result.current.saveMessage(msg({ content: 'v2' })));
    expect(postCalls()).toHaveLength(1);
    expect(postCalls()[0]![1]!.body).toMatchObject({ content: 'v1' });
  });

  it('失败 → logger.warn + tempId 释放, 同 id 可重试', async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'db-1' });
    const { result } = setup();

    await act(async () => {
      result.current.saveMessage(msg());
      await new Promise((r) => setTimeout(r, 0)); // flush promise 链 (.then/.catch)
    });
    expect(postCalls()).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalled();

    await act(async () => {
      result.current.saveMessage(msg()); // 重试同 id
      await new Promise((r) => setTimeout(r, 0)); // flush promise 链 (.then/.catch)
    });
    expect(postCalls()).toHaveLength(2);
  });

  it('去重记录超 100 条 → 裁至最近 50: 被裁掉的 id 可重发, 保留的不重发', () => {
    const { result } = setup();
    act(() => {
      for (let i = 1; i <= 101; i++) result.current.saveMessage(msg({ id: `t${i}` }));
    });
    expect(postCalls()).toHaveLength(101);

    act(() => result.current.saveMessage(msg({ id: 't1' }))); // 已被裁掉 (1 ≤ 51) → 重发
    expect(postCalls()).toHaveLength(102);

    act(() => result.current.saveMessage(msg({ id: 't60' }))); // 仍在最近 50 (52..101) → 拦截
    expect(postCalls()).toHaveLength(102);
  });

  it('截断对齐后端 zod: content>10000 → 10000, reasoning>50000 → 50000, 无 reasoning → null', () => {
    const { result } = setup();
    act(() =>
      result.current.saveMessage(
        msg({ content: 'x'.repeat(10001), reasoning: 'r'.repeat(50001) }),
      ),
    );
    const body = postCalls()[0]![1]!.body as Record<string, unknown>;
    expect(body.content).toHaveLength(10000);
    expect(body.reasoning).toHaveLength(50000);

    act(() => result.current.saveMessage(msg({ id: 'temp-2', reasoning: undefined })));
    expect((postCalls()[1]![1]!.body as Record<string, unknown>).reasoning).toBeNull();
  });

  it("role='action' → 持久化为 'user' (P1); user/assistant 原样透传", () => {
    const { result } = setup();
    act(() => result.current.saveMessage(msg({ role: 'action' })));
    expect((postCalls()[0]![1]!.body as Record<string, unknown>).role).toBe('user');

    act(() => result.current.saveMessage(msg({ id: 'temp-2', role: 'assistant' })));
    expect((postCalls()[1]![1]!.body as Record<string, unknown>).role).toBe('assistant');
  });

  it("mode 三级回退: msg.mode > activeChallenge→'challenge' > 'normal'", () => {
    const { result } = setup({ activeChallenge: { itemName: 'Coffee', amount: 5, challengeId: 'c1' } });
    act(() => result.current.saveMessage(msg({ mode: 'challenge' })));
    expect((postCalls()[0]![1]!.body as Record<string, unknown>).mode).toBe('challenge');

    act(() => result.current.saveMessage(msg({ id: 't2' }))); // 无 mode → activeChallenge 兜底
    expect((postCalls()[1]![1]!.body as Record<string, unknown>).mode).toBe('challenge');

    const { result: bare } = setup();
    act(() => bare.current.saveMessage(msg()));
    expect((postCalls()[2]![1]!.body as Record<string, unknown>).mode).toBe('normal');
  });

  it('成功返回新 id → tempId 消息被重映射为服务端 id', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: 'db-9' });
    const { result, getState, setMessagesSync } = setup();
    // temp 消息先已在列表中 (chat-tab 流程: 先乐观上屏, 再持久化换 id)
    act(() => setMessagesSync([msg(), msg({ id: 'm2', role: 'assistant', content: 'hi' })]));
    await act(async () => {
      result.current.saveMessage(msg());
      await new Promise((r) => setTimeout(r, 0)); // flush promise 链 (.then/.catch)
    });
    expect(getState().find((m) => m.id === 'db-9')).toBeTruthy();
    expect(getState().find((m) => m.id === 'temp-1')).toBeUndefined();
  });
});

describe('useChatPersistence — deleteMessage', () => {
  it('乐观过滤 + DELETE 请求; msgId 特殊字符经 URL 编码 (BUG-183)', async () => {
    const { result, getState } = setup();
    act(() => result.current.deleteMessage('m1'));
    expect(getState().map((m) => m.id)).toEqual(['m2']);

    await waitFor(() => expect(apiFetchVoid).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiFetchVoid).mock.calls[0]![0]).toBe('/api/chat/history?id=m1');
    expect(vi.mocked(apiFetchVoid).mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });

    act(() => result.current.deleteMessage('a b&c=d'));
    await waitFor(() => expect(vi.mocked(apiFetchVoid).mock.calls[1]![0]).toBe('/api/chat/history?id=a%20b%26c%3Dd'));
  });

  it('无 userId → 仍从列表移除, 但不发 DELETE', () => {
    const { result, getState } = setup({ userId: undefined });
    act(() => result.current.deleteMessage('m1'));
    expect(getState().map((m) => m.id)).toEqual(['m2']);
    expect(apiFetchVoid).not.toHaveBeenCalled();
  });
});

describe('useChatPersistence — loadMoreMessages', () => {
  it('guard: 无 userId / hasMore=false / 列表空 / 已在加载 → 均不发请求', async () => {
    const a = setup({ userId: undefined });
    await act(async () => { await a.result.current.loadMoreMessages(); });
    const b = setup({ hasMore: false });
    await act(async () => { await b.result.current.loadMoreMessages(); });
    const c = setup();
    c.messagesRef.current = [];
    await act(async () => { await c.result.current.loadMoreMessages(); });
    const d = setup();
    d.isLoadingMoreRef.current = true;
    await act(async () => { await d.result.current.loadMoreMessages(); });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('最旧消息无 timestamp → 不发请求', async () => {
    const { result, messagesRef } = setup();
    messagesRef.current = [msg({ id: 'm0', timestamp: undefined as unknown as Date })];
    await act(async () => { await result.current.loadMoreMessages(); });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('正常翻页: 按 id 去重后前置插入, firstItemIndex 前移 deduped 数量 (非原始数量), hasMore 透传', async () => {
    const older = [
      msg({ id: 'm2', content: 'dup-of-existing' }), // 与现有重复 → 应被滤掉
      msg({ id: 'm0a', content: 'older-a' }),
      msg({ id: 'm0b', content: 'older-b' }),
    ];
    vi.mocked(apiFetch).mockResolvedValue({ messages: older, hasMore: true });
    const { result, setHasMore, setFirstItemIndex, isLoadingMoreRef, setIsLoadingMore } = setup();

    await act(async () => { await result.current.loadMoreMessages(); });

    expect(vi.mocked(apiFetch).mock.calls[0]![0]).toBe(
      `/api/chat/history?limit=20&before=${encodeURIComponent('2026-09-15T10:00:00.000Z')}&mode=normal`,
    );
    expect(setHasMore).toHaveBeenCalledWith(true);
    expect(setFirstItemIndex).toHaveBeenCalledTimes(1);
    expect((setFirstItemIndex.mock.calls[0]![0] as (prev: number) => number)(10)).toBe(12); // prev + deduped.length
    expect(isLoadingMoreRef.current).toBe(false);
    expect(setIsLoadingMore).toHaveBeenNthCalledWith(1, true);
    expect(setIsLoadingMore).toHaveBeenNthCalledWith(2, false);
  });

  it("activeChallenge → 翻页按 mode=challenge 过滤 (P0 Bug 2), 载入消息带 challenge mode", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      messages: [{ id: 'm0a', role: 'user', content: 'old', created_at: '2026-09-14T10:00:00Z' }],
      hasMore: false,
    });
    const { result, setMessagesSync } = setup({
      activeChallenge: { itemName: 'Coffee', amount: 5, challengeId: 'c1' },
    });

    await act(async () => { await result.current.loadMoreMessages(); });

    expect(vi.mocked(apiFetch).mock.calls[0]![0]).toContain('&mode=challenge');
    const updater = setMessagesSync.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    // 从真实 state 起应用 updater, 校验映射字段
    const prev = [{ id: 'm1', role: 'user' as const, content: 'x', timestamp: new Date() }];
    const applied = updater(prev);
    expect(applied[0]).toMatchObject({
      id: 'm0a',
      role: 'user',
      content: 'old',
      timestamp: new Date('2026-09-14T10:00:00Z'),
      mode: 'challenge',
    });
  });

  it('二次去重竞态 (现状固化): prev 已含同 id → 不重复插入, 但 firstItemIndex 仍按第一层数量前移 (与"实际新增数量"注释不符)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ messages: [msg({ id: 'm9' })], hasMore: true });
    const { result, setFirstItemIndex, setMessagesSync } = setup();
    // prev 已含 m9, messagesRef.current 仍为旧数组 (不含) → 仅第二层拦截
    act(() => setMessagesSync([msg({ id: 'm1' }), msg({ id: 'm9' })]));
    setFirstItemIndex.mockClear();
    setMessagesSync.mockClear();

    await act(async () => { await result.current.loadMoreMessages(); });

    const updater = setMessagesSync.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const input = [msg({ id: 'm1' }), msg({ id: 'm9' })];
    expect(updater(input)).toBe(input); // 二次检查生效: 返回原数组引用, 不重复插入
    expect(setFirstItemIndex).toHaveBeenCalledTimes(1);
    expect((setFirstItemIndex.mock.calls[0]![0] as (prev: number) => number)(10)).toBe(11); // 现状: 仍 +deduped.length=1, index 漂移
  });

  it('API 返回空数组 → setHasMore(false), 不动列表', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: true });
    const { result, setHasMore, setMessagesSync } = setup();
    await act(async () => { await result.current.loadMoreMessages(); });
    expect(setHasMore).toHaveBeenCalledWith(false);
    expect(setMessagesSync).not.toHaveBeenCalled();
  });

  it('响应缺 hasMore 字段 → 默认 false (关掉加载更多按钮)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ messages: [msg({ id: 'm0a' })] });
    const { result, setHasMore } = setup();
    await act(async () => { await result.current.loadMoreMessages(); });
    expect(setHasMore).toHaveBeenCalledWith(false);
  });

  it('失败 → logger.warn, finally 复位 in-flight 标志', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    const { result, setIsLoadingMore, isLoadingMoreRef } = setup();
    await act(async () => { await result.current.loadMoreMessages(); });
    expect(logger.warn).toHaveBeenCalled();
    expect(isLoadingMoreRef.current).toBe(false);
    expect(setIsLoadingMore).toHaveBeenNthCalledWith(2, false);
  });
});

describe('useChatPersistence — round-trip 与降级 (batch79-b)', () => {
  it('round-trip: 保存 POST body 与重挂载后读回的消息逐字段一致 (temp id → 服务端 id 闭环)', async () => {
    const created = '2026-09-16T08:30:00.000Z';

    // 第一实例: 保存 (apiFetch POST 成功返回服务端 id)
    vi.mocked(apiFetch).mockResolvedValueOnce({ id: 'db-rt' });
    const first = setup();
    // chat-tab 流程: 先乐观上屏, 再持久化换 id
    act(() => first.setMessagesSync([msg({ id: 'temp-rt', content: 'round trip', reasoning: 'think' })]));
    await act(async () => {
      first.result.current.saveMessage(
        msg({ id: 'temp-rt', role: 'user', content: 'round trip', reasoning: 'think' }),
      );
      await new Promise((r) => setTimeout(r, 0)); // flush promise 链 (.then/.catch)
    });
    // temp id 已被重映射为服务端 id — 保存侧闭环
    expect(first.getState().find((m) => m.id === 'db-rt')).toBeTruthy();

    const postBody = postCalls()[0]![1]!.body as Record<string, unknown>;
    expect(postBody).toMatchObject({ role: 'user', content: 'round trip', reasoning: 'think', mode: 'normal' });

    // 第二实例 (模拟刷新后): 服务端按保存时的形态返回 → 读回逐字段一致
    vi.mocked(apiFetch).mockResolvedValueOnce({
      messages: [
        {
          id: 'db-rt',
          role: postBody.role,
          content: postBody.content,
          reasoning: postBody.reasoning,
          created_at: created,
        },
      ],
      hasMore: false,
    });
    const second = setup();
    await act(async () => { await second.result.current.loadMoreMessages(); });

    expect(second.getState().filter((m) => m.id === 'db-rt')).toHaveLength(1);
    expect(second.getState().find((m) => m.id === 'db-rt')).toMatchObject({
      id: 'db-rt',
      role: 'user',
      content: 'round trip',
      reasoning: 'think',
      mode: 'normal',
      timestamp: new Date(created),
    });
  });

  it('坏 JSON (SyntaxError) → 保存/删除/翻页均不抛, 降级 warn; tempId 释放可重试', async () => {
    // apiFetch 对无效 JSON 响应抛 SyntaxError — hook 三入口都必须吞掉
    vi.mocked(apiFetch).mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    vi.mocked(apiFetchVoid).mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));
    const { result, isLoadingMoreRef, getState } = setup();

    expect(() => result.current.saveMessage(msg())).not.toThrow();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(logger.warn).toHaveBeenCalledWith('[ChatTab] saveMessage failed:', expect.any(String));

    act(() => result.current.deleteMessage('m1'));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getState().map((m) => m.id)).toEqual(['m2']); // 乐观删除不受影响
    expect(logger.warn).toHaveBeenCalledWith('[ChatTab] deleteMessage failed:', expect.any(String));

    await act(async () => { await expect(result.current.loadMoreMessages()).resolves.toBeUndefined(); });
    expect(isLoadingMoreRef.current).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('[ChatTab] loadMoreMessages failed:', expect.anything());

    // tempId 已释放 → 恢复后同 id 重试重发
    vi.mocked(apiFetch).mockResolvedValue({ id: 'db-2' });
    await act(async () => {
      result.current.saveMessage(msg());
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(postCalls()).toHaveLength(2);
  });

  it('卸载清理无泄漏: 未决 POST 不炸; 去重集随实例销毁 — 重挂载同 tempId 可重存', async () => {
    let resolveLate: (value: { id: string }) => void = () => {};
    vi.mocked(apiFetch).mockImplementationOnce(
      () => new Promise<{ id: string }>((res) => { resolveLate = res; }),
    );

    const first = setup();
    act(() => first.result.current.saveMessage(msg({ id: 'persist-me' })));
    expect(postCalls()).toHaveLength(1);
    first.unmount();

    // 卸载后未决 promise 才 resolve — 不得抛未处理异常
    expect(() => resolveLate({ id: 'late-id' })).not.toThrow();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    // 新实例 (重挂载) 同 tempId 再次保存 → 无跨实例去重泄漏
    const second = setup();
    act(() => second.result.current.saveMessage(msg({ id: 'persist-me' })));
    expect(postCalls()).toHaveLength(2);
  });
});
