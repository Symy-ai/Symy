import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座 ———
const streamToAgentMock = vi.fn();
vi.mock('@/lib/letta', () => ({
  streamToAgent: (...a: unknown[]) => streamToAgentMock(...(a as [])),
}));
vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: vi.fn(() => Promise.resolve('agent-1')),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/sse', () => ({
  sendSSEData: vi.fn((_controller: { __events: unknown[] }, event: unknown) => {
    _controller.__events.push(event);
  }),
  closeSSE: vi.fn((_controller: unknown) => {}),
}));
const adminRpcMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => Promise.resolve({ supabase: { rpc: adminRpcMock } })),
}));
// engine 直通 (extractTextFromLettaSSELine 真 parse) — 但 buildButterflyAgentMessage 依赖 letta mock ok
vi.mock('@/features/butterfly/lib/engine', (importOriginal) => importOriginal());

import { streamAllStory, getPreloadedChapter3 } from '../stream-all-story';

// ——— 测试基建 ———
function sseLine(text: string) {
  return `data: ${JSON.stringify({ type: 'token', content: text })}\n\n`;
}

function makeStream(lines: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close(); },
  });
}

/** 把文本切成 token SSE 行数组 */
function makeTokenLines(text: string, size = 25): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    lines.push(sseLine(text.substring(i, i + size)));
  }
  return lines;
}

/** 模拟真实 LLM 增量流: 文本按 size 切块, 每块一个 token SSE 事件 (保留换行) */
function makeTokenStream(text: string, size = 25) {
  return makeStream(makeTokenLines(text, size));
}

function makeController() {
  return { __events: [] as unknown[] } as unknown as ReadableStreamDefaultController<Uint8Array>;
}

const FULL_STORY = [
  '[CH1]厨房里的机器',
  'The machine hummed in the kitchen. You pressed the button and waited.',
  '[CH2]第二天',
  'The coffee tasted different. Something had changed overnight in the pipes.',
  '[CHOICE]Which path do you take?',
  'A: The familiar path | Safety has its own cost.',
  'B: The uncharted path | The unknown holds treasure.',
  '[CH3A]回归',
  'You kept the machine. The bills piled up quietly like snow.',
  '[CH3B]放手',
  'You returned it. The kitchen felt larger, emptier, freer.',
  '[EFFECT]A single purchase echoed through two lifetimes.',
].join('\n');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1', user_id: 'u-1', status: 'active', currentChapter: 1,
    decisionType: 'bought', decisionDescription: 'coffee machine', amount: 159,
    platform: null, context: null,
    outline: { version: 1, chapters: [], endingHint: 'hope' },
    chapters: [], choices: [],
    ...overrides,
  } as never;
}

function makeEqChain() {
  const eq = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) }));
  return { eq };
}

const baseParams = {
  controller: makeController(),
  supabase: { from: vi.fn(() => ({ update: () => makeEqChain() })) } as never,
  user: { id: 'u-1' },
  session: makeSession(),
  signal: undefined,
  locale: 'zh',
};

const ev = (p: unknown) => ((p as { controller: { __events: unknown[] } }).controller.__events) as Array<{ type: string; data: Record<string, unknown> }>;
const types = (p: unknown) => ev(p).map(e => e.type);
const textOf = (p: unknown, ch: number) =>
  ev(p).filter(e => e.type === 'chapter_text' && (e.data as { chapterIndex: number }).chapterIndex === ch)
    .map(e => (e.data as { text: string }).text).join('');

describe('streamAllStory (679行 一键全故事 SSE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminRpcMock.mockResolvedValue({ data: { success: true }, error: null });
    streamToAgentMock.mockImplementation(() => Promise.resolve(makeTokenStream(FULL_STORY)));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('正常流: outline→CH1 实时流→CH2 实时流→choice_prompt, CH3A/B 不发给前端', async () => {
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    const seq = types(p);
    expect(seq[0]).toBe('outline_generated');
    expect(seq).toContain('chapter_start');
    expect(seq).toContain('chapter_end');
    expect(seq).toContain('choice_prompt');
    // CH3 分支内容绝不发给前端 (存 context 等选择)
    expect(textOf(p, 1)).not.toContain('回归');
    expect(textOf(p, 2)).not.toContain('放手');
    // CH1 文本实时流过
    expect(textOf(p, 1)).toContain('The machine hummed');
    expect(textOf(p, 2)).toContain('The coffee tasted different');
    // 不发 story_complete (等用户选 choice)
    expect(seq).not.toContain('story_complete');
  });

  it('i18n: zh 模式 CH1=那天傍晚 / CH2=第二天早上 (P1-2.1)', async () => {
    const p = { ...baseParams, controller: makeController(), locale: 'zh' };
    await streamAllStory(p as never);
    const starts = ev(p).filter(e => e.type === 'chapter_start');
    expect((starts[0].data as { timeSpan: string }).timeSpan).toBe('那天傍晚');
    expect((starts[1].data as { timeSpan: string }).timeSpan).toBe('第二天早上');
  });

  it('i18n: en 模式 timeSpan 英文', async () => {
    const p = { ...baseParams, controller: makeController(), locale: 'en' };
    await streamAllStory(p as never);
    const starts = ev(p).filter(e => e.type === 'chapter_start');
    expect((starts[0].data as { timeSpan: string }).timeSpan).toBe('that evening');
    expect((starts[1].data as { timeSpan: string }).timeSpan).toBe('the next morning');
  });

  it('choice_prompt: A/B 选项解析 (label|hint)', async () => {
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    const choice = ev(p).find(e => e.type === 'choice_prompt');
    const opts = (choice!.data as { options: Array<{ id: string; label: string; hint: string }> }).options;
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({ id: 'A', label: 'The familiar path', hint: 'Safety has its own cost.' });
    expect(opts[1]).toMatchObject({ id: 'B', label: 'The uncharted path', hint: 'The unknown holds treasure.' });
  });

  it('CH3A/B/effect 持久化到 session.context (branchData JSON)', async () => {
    const updateMock = vi.fn((_arg: Record<string, unknown>) => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) })) }));
    const from = vi.fn(() => ({ update: updateMock }));
    const p = { ...baseParams, controller: makeController(), supabase: { from } as never };
    await streamAllStory(p as never);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ context: expect.stringContaining('"ch3a"') }));
    const ctxArg = updateMock.mock.calls[0][0] as unknown as { context: string };
    const parsed = JSON.parse(ctxArg.context);
    expect(parsed.ch3a.title).toBe('回归');
    expect(parsed.ch3b.title).toBe('放手');
    expect(parsed.effect).toContain('two lifetimes');
  });

  it('RPC append_chapter ×2 (CH1 p_current_chapter=1 / CH2 带 p_choices)', async () => {
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    expect(adminRpcMock).toHaveBeenCalledTimes(2);
    const ch1Call = adminRpcMock.mock.calls[0];
    const ch2Call = adminRpcMock.mock.calls[1];
    expect(ch1Call[0]).toBe('append_chapter');
    expect(ch1Call[1].p_current_chapter).toBe(1);
    expect(ch1Call[1].p_choices).toBeNull();
    expect(ch2Call[1].p_current_chapter).toBe(2);
    expect(ch2Call[1].p_choices).toBeTruthy(); // choice 数组
  });

  it('RPC 失败不中断流: choice_prompt 仍发 (C2 决策)', async () => {
    adminRpcMock.mockResolvedValue({ data: null, error: { message: '42501' } });
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    expect(types(p)).toContain('choice_prompt');
    expect(types(p)).not.toContain('error');
  });

  it('LLM 无标记 fallback: 解析后补发 CH1/CH2 (P1-2 fallback)', async () => {
    // 用 === 格式 (extractByEquals fallback 解析器), 且不含 [CH1] 标记 → 流式阶段不发, 解析后补发
    const eqStory = FULL_STORY
      .replace('[CH1]厨房里的机器', '===CHAPTER 1: 厨房里的机器===')
      .replace('[CH2]第二天', '===CHAPTER 2: 第二天===')
      .replace('[CH3A]回归', '===CHAPTER 3A: 回归===')
      .replace('[CH3B]放手', '===CHAPTER 3B: 放手===');
    streamToAgentMock.mockImplementation(() => Promise.resolve(makeTokenStream(eqStory)));
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    // === 格式无 [CH1]/[CH2] 标记 → 流式阶段前 200 字符起全当 CH1 实时发 (含 CH2 文本)
    expect(textOf(p, 1)).toContain('The machine hummed');
    // === fallback 下章节边界可能错位 (extract/extractByEquals 混合语义) —
    // 锁关键不变量: CH1 文本实时发了 + choice_prompt 发了 + 两个 chapter_end 都在
    const ends = ev(p).filter(e => e.type === 'chapter_end');
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(types(p)).toContain('choice_prompt');
  });

  it('解析彻底失败: error 事件 (缺 CH3B)', async () => {
    const broken = FULL_STORY.replace('[CH3B]放手\nYou returned it. The kitchen felt larger, emptier, freer.\n', '');
    streamToAgentMock.mockImplementation(() => Promise.resolve(makeTokenStream(broken)));
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    const errEv = ev(p).find(e => e.type === 'error');
    expect((errEv!.data as { message: string }).message).toContain('could not parse');
  });

  it('跨 chunk 标记截断: [CH2] 拆两半仍正确分段 (10 字符保留窗)', async () => {
    // 把 [CH2] 标记拆到两个 SSE 事件里
    const idx = FULL_STORY.indexOf('[CH2]');
    const part1 = FULL_STORY.slice(0, idx + 2); // "...[C"
    const part2 = FULL_STORY.slice(idx + 2);    // "H2]第二天..."
    streamToAgentMock.mockImplementation(() => Promise.resolve(makeStream([...makeTokenLines(part1), ...makeTokenLines(part2)])));
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    expect(textOf(p, 1)).toContain('The machine hummed');
    expect(textOf(p, 2)).toContain('The coffee tasted different');
    // 标记本身不泄漏给前端
    expect(textOf(p, 1) + textOf(p, 2)).not.toContain('[CH2]');
  });

  it('无 agentId: error + close', async () => {
    const { getUserAgentId } = await import('@/lib/letta-agent-manager');
    vi.mocked(getUserAgentId).mockResolvedValueOnce(undefined as never);
    const p = { ...baseParams, controller: makeController() };
    await streamAllStory(p as never);
    const errEv = ev(p).find(e => e.type === 'error');
    expect((errEv!.data as { message: string }).message).toContain('No agent ID');
  });
});

describe('getPreloadedChapter3 (纯函数)', () => {
  it('选 A 返回 ch3a, 选 B 返回 ch3b, effect 附带', () => {
    const session = makeSession({
      context: JSON.stringify({
        ch3a: { title: '回归', content: 'kept it' },
        ch3b: { title: '放手', content: 'returned it' },
        effect: 'echo',
      }),
    });
    const a = getPreloadedChapter3(session, 'A');
    expect(a).toMatchObject({ title: '回归', content: 'kept it', effect: 'echo' });
    const b = getPreloadedChapter3(session, 'B');
    expect(b).toMatchObject({ title: '放手', content: 'returned it' });
  });

  it('坏 JSON / 无 context / 未知选项: null (静默降级)', () => {
    expect(getPreloadedChapter3(makeSession({ context: 'not-json' }), 'A')).toBeNull();
    expect(getPreloadedChapter3(makeSession({ context: null }), 'A')).toBeNull();
    expect(getPreloadedChapter3(makeSession({ context: JSON.stringify({ ch3a: { title: 'x', content: 'y' } }) }), 'C')).toBeNull();
  });
});
