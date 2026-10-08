// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../chat-input';

vi.mock('../../smart-prompt-chips', () => ({
  SmartPromptChips: ({ hasSentMessage, onQuickReply }: { hasSentMessage: boolean; onQuickReply: (text: string) => void }) => (
    <button type="button" data-testid="smart-prompts" data-has-sent={String(hasSentMessage)} onClick={() => onQuickReply('smart reply')}>
      smart
    </button>
  ),
}));

vi.mock('../../topic-plaza/topic-plaza-empty', () => ({
  TopicPlazaEmpty: ({ onQuickReply }: { onQuickReply: (text: string) => void }) => (
    <button type="button" data-testid="topic-empty" onClick={() => onQuickReply('empty reply')}>empty</button>
  ),
}));

vi.mock('../../topic-plaza/topic-plaza-popover', () => ({
  TopicPlazaPopover: ({ onQuickReply }: { onQuickReply: (text: string) => void }) => (
    <button type="button" data-testid="topic-popover" onClick={() => onQuickReply('popover reply')}>popover</button>
  ),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => ({
      'chat.placeholder.active': '问问小象',
      'chat.placeholder.dormant': '小象在休息',
      'chat.placeholder.challenge': '挑战中',
      'chat.send': '发送',
    })[key] ?? opts?.defaultValue ?? key,
  }),
}));

function renderInput(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const inputRef = createRef<HTMLInputElement>();
  const isComposingRef = { current: false };
  const props = {
    input: '',
    inputRef,
    isComposingRef,
    isDemo: false,
    isLoading: false,
    isLoadingHistory: false,
    buddyState: null,
    gradientClass: 'from-emerald-500 to-cyan-500',
    messagesCount: 0,
    healthEvents: [],
    onInputChange: vi.fn(),
    onCompositionStart: vi.fn(),
    onCompositionEnd: vi.fn(),
    onKeyDown: vi.fn(),
    onSendClick: vi.fn(),
    onQuickReply: vi.fn(),
    ...overrides,
  };
  return { ...render(<ChatInput {...props} />), props };
}

describe('ChatInput', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('shows the full topic plaza and smart prompts in the empty state', () => {
    const { props } = renderInput();
    expect(screen.getByTestId('topic-empty')).toBeTruthy();
    expect(screen.getByTestId('smart-prompts').dataset.hasSent).toBe('false');
    expect(screen.queryByTestId('topic-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('topic-empty'));
    expect(props.onQuickReply).toHaveBeenCalledWith('empty reply');
  });

  it('folds topic plaza into the popover after history exists', () => {
    const { props } = renderInput({ messagesCount: 3, input: 'hello' });
    expect(screen.queryByTestId('topic-empty')).toBeNull();
    expect(screen.getByTestId('smart-prompts').dataset.hasSent).toBe('true');
    fireEvent.click(screen.getByTestId('topic-popover'));
    expect(props.onQuickReply).toHaveBeenCalledWith('popover reply');
  });

  it('suppresses topic surfaces and uses the challenge placeholder during a challenge', () => {
    renderInput({ activeChallenge: { itemName: '耳机', amount: 100 } });
    expect(screen.queryByTestId('topic-empty')).toBeNull();
    expect(screen.queryByTestId('topic-popover')).toBeNull();
    expect(screen.queryByTestId('smart-prompts')).toBeNull();
    expect(screen.getByPlaceholderText('挑战中')).toBeTruthy();
  });

  it('uses the dormant placeholder when buddy health is dormant', () => {
    renderInput({ buddyState: { health: 'dormant' } as never });
    expect(screen.getByPlaceholderText('小象在休息')).toBeTruthy();
  });

  it('forwards input changes and composition lifecycle', () => {
    const { props } = renderInput();
    // composed: true — real browser typing produces InputEvent with composed=true;
    // happy-dom's fireEvent.change defaults composed:false which the IME guard (P0 09-06) drops.
    fireEvent.change(screen.getByLabelText('问问小象'), { target: { value: '想买耳机' }, composed: true });
    fireEvent.compositionStart(screen.getByLabelText('问问小象'));
    fireEvent.compositionEnd(screen.getByLabelText('问问小象'), { target: { value: '想买耳机' } });
    expect(props.onInputChange).toHaveBeenCalledWith('想买耳机');
    expect(props.onCompositionStart).toHaveBeenCalledTimes(1);
    expect(props.onCompositionEnd).toHaveBeenCalledWith('想买耳机');
    expect(props.isComposingRef.current).toBe(false);
  });

  it('ignores non-composed change events (live IME turn) — P0 09-06 guard lock', () => {
    const { props } = renderInput();
    fireEvent.change(screen.getByLabelText('问问小象'), { target: { value: '拼音中' }, composed: false });
    expect(props.onInputChange).not.toHaveBeenCalled();
  });

  it('heals a stale composition guard and accepts typing', () => {
    const { props } = renderInput({ isComposingRef: { current: true } });
    fireEvent.change(screen.getByLabelText('问问小象'), { target: { value: 'resume' }, composed: true });
    expect(props.onInputChange).toHaveBeenCalledWith('resume');
    expect(props.isComposingRef.current).toBe(false);
  });

  it('enables send only with non-empty input and not while history loads', () => {
    renderInput();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    const filled = renderInput({ input: 'hello' });
    const send = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(filled.props.onSendClick).toHaveBeenCalledTimes(1);
    cleanup();

    renderInput({ input: 'hello', isLoadingHistory: true });
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps send clickable while AI response loading and limits input length', () => {
    renderInput({ input: 'hello', isLoading: true });
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('问问小象') as HTMLInputElement).maxLength).toBe(1000);
    expect(screen.queryByTestId('topic-empty')).toBeNull();
  });
});
