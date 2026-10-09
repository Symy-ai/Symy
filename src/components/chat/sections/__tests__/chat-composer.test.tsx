// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedHandlers: Record<string, unknown> = {};
type AnyFn = (...a: unknown[]) => void;
const h = (name: string): AnyFn => capturedHandlers[name] as AnyFn;
vi.mock('../../parts/chat-input', () => ({
  ChatInput: vi.fn((props: Record<string, unknown>) => {
    capturedHandlers = {
      onCompositionStart: props.onCompositionStart as (this: void) => void,
      onCompositionEnd: props.onCompositionEnd as (v: unknown) => void,
      onKeyDown: props.onKeyDown as (e: unknown) => void,
      onSendClick: props.onSendClick as () => void,
      onQuickReply: props.onQuickReply as (r: unknown) => void,
      onInputChange: props.onInputChange as (v: unknown) => void,
    };
    // 只挑非函数 props 做编排断言
    const passthrough: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) if (typeof v !== 'function') passthrough[k] = v;
    return <div data-testid="input-mock" data-props={JSON.stringify(passthrough)} />;
  }),
}));

import { ChatComposer } from '../chat-composer';

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    key: 'Enter',
    shiftKey: false,
    preventDefault: vi.fn(),
    nativeEvent: { isComposing: false },
    currentTarget: { value: '默认值' },
    ...overrides,
  };
}

function renderComposer(overrides: Record<string, unknown> = {}) {
  const inputRef = { current: { value: '' } as HTMLInputElement | null };
  const props = {
    input: '',
    inputRef,
    isComposingRef: { current: false },
    isDemo: false,
    isLoading: false,
    isLoadingHistory: false,
    gradientClass: 'g-1',
    messagesCount: 3,
    setInput: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
  const r = render(<ChatComposer {...props} />);
  return { ...props, ...r };
}

/**
 * chat-composer.tsx (82行) — File Split Wave 1 搬运件 + NEW-AAA stale closure 防御。
 *
 * 锁定:
 * - props 编排透传 ChatInput
 * - composition 双回调 → isComposingRef + setInput
 * - Enter 发送链: 同步清 DOM + setInput('') + onSend(currentTarget.value)
 * - shift+Enter / isComposing → 不发送
 * - onSendClick: inputRef.value 优先
 * - onQuickReply → onSend 直通
 */
describe('ChatComposer 编排+防御', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('props 编排透传', () => {
    const p = renderComposer({ isDemo: true, gradientClass: 'grad-x', messagesCount: 7 });
    const passed = JSON.parse(p.getByTestId('input-mock').getAttribute('data-props') || '{}');
    expect(passed.isDemo).toBe(true);
    expect(passed.gradientClass).toBe('grad-x');
    expect(passed.messagesCount).toBe(7);
  });

  it('composition: start 置 ref / end 复位+setInput', () => {
    const p = renderComposer();
    h('onCompositionStart')();
    expect(p.isComposingRef.current).toBe(true);
    h('onCompositionEnd')('合成结果' as never);
    expect(p.isComposingRef.current).toBe(false);
    expect(p.setInput).toHaveBeenCalledWith('合成结果');
  });

  it('Enter 发送链: preventDefault+同步清 DOM+setInput(\"\")+onSend', () => {
    const p = renderComposer();
    const ev = makeEvent({ currentTarget: { value: '买键盘' } });
    h('onKeyDown')(ev as never);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect((ev.currentTarget as { value: string }).value).toBe(''); // 同步清 DOM (NEW-AAA)
    expect(p.setInput).toHaveBeenCalledWith('');
    expect(p.onSend).toHaveBeenCalledWith('买键盘');
  });

  it('shift+Enter / isComposing / 空白 → 不发送', () => {
    const p = renderComposer();
    const shift = makeEvent({ shiftKey: true, currentTarget: { value: 'x' } });
    h('onKeyDown')(shift as never);
    const composing = makeEvent({ nativeEvent: { isComposing: true }, currentTarget: { value: 'x' } });
    h('onKeyDown')(composing as never);
    const blank = makeEvent({ currentTarget: { value: '   ' } });
    h('onKeyDown')(blank as never);
    expect(p.onSend).not.toHaveBeenCalled();
  });

  it('onSendClick: inputRef.value 优先 + 同步清', () => {
    const p = renderComposer({ input: 'stale-state' });
    p.inputRef.current = { value: 'fresh-dom' } as HTMLInputElement;
    h('onSendClick')();
    expect(p.onSend).toHaveBeenCalledWith('fresh-dom'); // NEW-AAA: DOM 优先于 state
    expect((p.inputRef.current as { value: string }).value).toBe('');
    expect(p.setInput).toHaveBeenCalledWith('');
  });

  it('onQuickReply → onSend 直通', () => {
    const p = renderComposer();
    h('onQuickReply')('快速回复' as never);
    expect(p.onSend).toHaveBeenCalledWith('快速回复');
  });
});
