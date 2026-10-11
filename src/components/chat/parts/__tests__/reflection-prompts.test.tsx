// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFLECTION_QUESTIONS_EN, REFLECTION_QUESTIONS_ZH } from '../reflection-questions';
import { ReflectionPrompts } from '../reflection-prompts';

const localeMock = vi.hoisted(() => ({ value: 'en' as 'en' | 'zh' }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: localeMock.value,
    // 🔧 R1049: t mock 实现三 key (双语) — 壳层硬编码改 t() 后断言走 i18n 路径
    t: (key: string) => {
      const en: Record<string, string> = {
        'chat.reflectionPrompts.title': 'Want to look at why?',
        'chat.reflectionPrompts.subtitle': '(optional — tap a question to reflect)',
        'chat.reflectionPrompts.skip': 'Skip',
      };
      const zh: Record<string, string> = {
        'chat.reflectionPrompts.title': '想看看为什么吗？',
        'chat.reflectionPrompts.subtitle': '（可选 — 点击一个问题开始反思）',
        'chat.reflectionPrompts.skip': '跳过',
      };
      const table = localeMock.value === 'zh' ? zh : en;
      return table[key] ?? key;
    },
  }),
}));

function buttons() {
  return screen.getAllByRole('button').slice(0, 3);
}

describe('ReflectionPrompts', () => {
  afterEach(cleanup);

  it('renders exactly three questions from the English pool', () => {
    render(<ReflectionPrompts onSelect={vi.fn()} />);
    expect(REFLECTION_QUESTIONS_EN).toEqual(expect.arrayContaining(buttons().map(({ textContent }) => textContent!)));
    expect(buttons()).toHaveLength(3);
  });

  it('uses the Chinese pool and shell copy for Chinese context locales', () => {
    localeMock.value = 'zh';
    render(<ReflectionPrompts onSelect={vi.fn()} />);
    expect(REFLECTION_QUESTIONS_ZH).toEqual(expect.arrayContaining(buttons().map(({ textContent }) => textContent!)));
    expect(screen.getByText('想看看为什么吗？')).toBeTruthy();
    expect(screen.getByText('（可选 — 点击一个问题开始反思）')).toBeTruthy();
  });

  it('falls back to the Chinese context locale when no prop is provided', () => {
    localeMock.value = 'zh';
    render(<ReflectionPrompts onSelect={vi.fn()} />);
    expect(screen.getByText('想看看为什么吗？')).toBeTruthy();
    expect(screen.getByText('跳过')).toBeTruthy();
  });

  it('uses the English copy for non-Chinese context locales', () => {
    localeMock.value = 'en';
    render(<ReflectionPrompts onSelect={vi.fn()} />);
    expect(screen.getByText('Want to look at why?')).toBeTruthy();
    expect(screen.getByText('(optional — tap a question to reflect)')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('selecting a prompt forwards it and dismisses the component', () => {
    const onSelect = vi.fn();
    render(<ReflectionPrompts onSelect={onSelect} />);
    const question = buttons()[0].textContent!;
    fireEvent.click(screen.getByText(question));
    expect(onSelect).toHaveBeenCalledWith(question);
    expect(screen.queryByText('Want to look at why?')).toBeNull();
  });

  it('skipping dismisses the prompts without selecting a question', () => {
    const onSelect = vi.fn();
    render(<ReflectionPrompts onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Skip'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('Want to look at why?')).toBeNull();
  });
});
