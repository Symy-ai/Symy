// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils', () => ({
  formatPlatformName: vi.fn((p: string) => (p === 'taobao' ? '淘宝' : p)),
}));

import { useImpulseContext } from '../use-impulse-context';

type Ret = ReturnType<typeof useImpulseContext>;
const box: { current: Ret | null } = { current: null };
let savedMsgs: unknown[] = [];
let applied: unknown[] = [];
let idSeq = 0;

function Probe(props: Parameters<typeof useImpulseContext>[0]) {
  box.current = useImpulseContext(props);
  return null;
}

beforeEach(() => { savedMsgs = []; applied = []; idSeq = 0; });

const ctx = { platform: 'taobao', amount: 88.5, reasons: ['深夜浏览', '比价多次'], time: '2026-10-09T23:00:00Z' };
// 🔧 R1028: t mock 实现 next-intl 单括号插值 — 断言走 i18n 路径 (chat.impulseGreeting 家族)
const t = (key: string, values?: Record<string, string | number>) => {
  const dict: Record<string, string> = {
    'chat.impulseGreeting': '我注意到你刚刚在{platform}有一笔消费 — {amount}。{reasons}你现在感觉怎么样？',
    'chat.impulseGreetingReasons': '我注意到一些消费模式：{reasons}。',
  };
  let out = dict[key] ?? key;
  if (values) for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
};
const fns = {
  nextId: (p: string) => `${p}-${++idSeq}`,
  saveMessage: (m: unknown) => savedMsgs.push(m),
  setMessagesSync: (u: unknown) => applied.push(u),
  t,
};

/**
 * use-impulse-context.ts (66行) — 诱导上下文→系统开场消息 (Wave 1 搬运件)。
 *
 * 锁定 (Round 23 HIGH-2 内容比较修复锚 + BUG-181 nextId 锚):
 * - context 到达 → 一条 system 开场消息 (平台名映射+金额 2 位+前 2 模式)
 * - hasContext 门: 同 context 只发一次 (防刷屏)
 * - 新对象同内容 (引用变内容同) → 不重发 (HIGH-2 根因)
 * - 内容真变 → 重发
 */
describe('useImpulseContext 诱导开场', () => {
  it('context 到达 → 开场消息一条 (平台+金额+前 2 模式+nextId)', () => {
    render(<Probe impulseContext={ctx} {...fns} />);
    expect(savedMsgs).toHaveLength(1);
    const msg = savedMsgs[0] as { id: string; role: string; content: string };
    expect(msg.id).toBe('system-1'); // nextId 非 Date.now (BUG-181 锚)
    expect(msg.role).toBe('assistant');
    expect(msg.content).toContain('淘宝'); // formatPlatformName 映射
    expect(msg.content).toContain('$88.50'); // 2 位小数 (插值带货币符)
    expect(msg.content).toContain('深夜浏览, 比价多次'); // 前 2 模式
    expect(msg.content).toContain('你现在感觉怎么样'); // R1028: zh i18n 路径
    expect(applied).toHaveLength(1); // setMessagesSync 同步一次
  });

  it('hasContext 门: rerender 同 context 不重发', () => {
    const { rerender } = render(<Probe impulseContext={ctx} {...fns} />);
    rerender(<Probe impulseContext={ctx} {...fns} />);
    rerender(<Probe impulseContext={ctx} {...fns} />);
    expect(savedMsgs).toHaveLength(1); // 只发一次
    expect((box.current as Ret).hasContext).toBe(true);
  });

  it('HIGH-2: 新对象同内容 (引用变) → 不重发', () => {
    const { rerender } = render(<Probe impulseContext={ctx} {...fns} />);
    const fresh = { ...ctx }; // 新引用同内容
    rerender(<Probe impulseContext={fresh} {...fns} />);
    expect(savedMsgs).toHaveLength(1); // 内容比较命中, 无重复消息
  });

  it('内容真变 → 重置 hasContext 并重发', () => {
    const { rerender } = render(<Probe impulseContext={ctx} {...fns} />);
    const changed = { ...ctx, amount: 199.9 };
    rerender(<Probe impulseContext={changed} {...fns} />);
    expect(savedMsgs).toHaveLength(2);
    expect((savedMsgs[1] as { content: string }).content).toContain('$199.90');
  });

  it('无 context → 零消息', () => {
    render(<Probe impulseContext={undefined} {...fns} />);
    expect(savedMsgs).toHaveLength(0);
    expect((box.current as Ret).hasContext).toBe(false);
  });
});
