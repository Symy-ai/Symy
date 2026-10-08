// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const messages: string[] = [];
const t = (key: string, opts?: { defaultValue?: string; n?: number }) => {
  const map: Record<string, string> = {
    'common.justNow': '刚刚',
    'common.minutesAgo': `${opts?.n ?? 0} 分钟前`,
    'common.hoursAgo': `${opts?.n ?? 0} 小时前`,
    'common.daysAgo': `${opts?.n ?? 0} 天前`,
    'chat.avatarUser': 'U',
    'chat.deleteMessage': '删除',
    'chat.deleteConfirm': '确认删除？',
    'common.cancel': '取消',
    'chat.symyTyping': 'Symy 正在输入...',
    'chat.aiFallback.retry': '重试',
  };
  messages.push(key);
  return map[key] ?? opts?.defaultValue ?? key;
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t }),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="next-image" src={src} alt={alt} />
  ),
}));

vi.mock('@/components/chat/parts/structured-cards', () => ({
  StructuredProductCards: ({ cards, query }: { cards: unknown[]; query?: string }) => (
    <div data-testid="product-cards">
      {cards.length}-{query ?? ''}
    </div>
  ),
}));

vi.mock('@/components/chat/parts/green-alt-card', () => ({
  GreenAltCard: ({ onSendMessage }: { onSendMessage?: (content: string) => void }) => (
    <button data-testid="green-alt" onClick={() => onSendMessage?.('绿色替代点击')}>
      green-alt
    </button>
  ),
}));

vi.mock('@/components/chat/parts/reuse-hint-card', () => ({
  ReuseHintCard: ({ hint }: { hint: string }) => <div data-testid="reuse-hint">{hint}</div>,
}));

vi.mock('@/components/chat/parts/cooldown-card', () => ({
  CooldownCard: ({ data }: { data: string }) => <div data-testid="cooldown-card">{data}</div>,
}));

import { ChatBubble } from '../chat-bubble';
import type { ChatMessage } from '@/types/chat-message';

function renderBubble(overrides: Partial<ChatMessage> = {}, props = {}) {
  const message: ChatMessage = {
    id: 'msg-1',
    role: 'assistant',
    content: 'hello',
    timestamp: new Date(),
    ...overrides,
  } as ChatMessage;
  return render(<ChatBubble message={message} {...props} />);
}

async function longPress(target: Element) {
  fireEvent.touchStart(target);
  await act(() => {
    vi.advanceTimersByTime(501);
  });
}

describe('ChatBubble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    messages.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assistant 消息使用左向布局、小象头像并渲染 markdown', () => {
    renderBubble({ content: '**answer**' });
    const bubble = screen.getByTestId('markdown').closest('div.max-w-\\[75\\%\\]');
    expect(bubble?.className).toContain('rounded-bl-md');
    expect(screen.getByText('🐘')).toBeTruthy();
    expect(screen.getByTestId('markdown').textContent).toBe('**answer**');
  });

  it('user 消息使用右向布局与渐变气泡', () => {
    renderBubble({ role: 'user', content: 'question' });
    const row = screen.getByTestId('markdown').closest('div.flex');
    const bubble = screen.getByTestId('markdown').closest('div.max-w-\\[75\\%\\]');
    expect(row?.className).toContain('flex-row-reverse');
    expect(bubble?.className).toContain('from-cyan-500');
  });

  it('system 消息按非用户轨道渲染小象头像', () => {
    renderBubble({ role: 'system' as never });
    expect(screen.getByText('🐘')).toBeTruthy();
    expect(screen.queryByText('U')).toBeNull();
  });

  it('action saw_it 渲染居中绿色徽章', () => {
    renderBubble({ role: 'action', actionType: 'saw_it', content: '已看见' });
    const badge = screen.getByText('已看见');
    expect(badge.closest('div')?.className).toContain('bg-green-500/10');
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('action chose_to_buy 渲染橙色徽章，未知类型回落 saw_it', () => {
    renderBubble({ role: 'action', actionType: 'chose_to_buy', content: '已购买' });
    expect(screen.getByText('已购买').closest('div')?.className).toContain('bg-orange-500/10');
    renderBubble({ role: 'action', actionType: 'unknown' as never, content: '默认' });
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('assistant 空内容渲染 typing 状态', () => {
    renderBubble({ content: '' });
    expect(screen.getByText('Symy 正在输入...')).toBeTruthy();
    expect(screen.queryByTestId('markdown')).toBeNull();
  });

  it('isError 渲染红色错误气泡；无 onRetry 不显示重试按钮', () => {
    renderBubble({ isError: true });
    const bubble = screen.getByTestId('markdown').closest('div.max-w-\\[75\\%\\]');
    expect(bubble?.className).toContain('bg-red-500/10');
    expect(screen.queryByText('重试')).toBeNull();
  });

  it('isError 且有 onRetry 时点击按钮触发回调', () => {
    const onRetry = vi.fn();
    renderBubble({ isError: true, onRetry });
    fireEvent.click(screen.getByText('重试'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('产品卡仅在有数据时渲染并透传 query', () => {
    renderBubble({ productCards: [{ title: 'A' }, { title: 'B' }] as never, productCardsQuery: '杯子' });
    expect(screen.getByTestId('product-cards').textContent).toBe('2-杯子');
  });

  it('绿色替代卡与复用提示卡可同时附带', () => {
    const onSendMessage = vi.fn();
    renderBubble({ greenAlt: { title: 'green' } as never, reuseHint: 'reuse' as never }, { onSendMessage });
    fireEvent.click(screen.getByTestId('green-alt'));
    expect(onSendMessage).toHaveBeenCalledWith('绿色替代点击');
    expect(screen.getByTestId('reuse-hint').textContent).toBe('reuse');
  });

  it('冷静卡按条件附带渲染', () => {
    renderBubble({ cooldownCard: 'cooldown-data' as never });
    expect(screen.getByTestId('cooldown-card').textContent).toBe('cooldown-data');
  });

  it('有头像 URL 的用户渲染真实头像，无 URL 渲染首字母头像', () => {
    const { rerender } = renderBubble({ role: 'user' }, { userAvatarUrl: 'https://example.com/a.png' });
    expect(screen.getByTestId('next-image')).toHaveProperty('src', 'https://example.com/a.png');
    rerender(<ChatBubble message={{ id: 'm', role: 'user', content: 'x', timestamp: new Date() } as ChatMessage} />);
    expect(screen.getByText('U')).toBeTruthy();
    expect(screen.queryByTestId('next-image')).toBeNull();
  });

  it('长按显示删除按钮，确认后以消息 id 调用 onDelete', async () => {
    const onDelete = vi.fn();
    renderBubble({ role: 'user' }, { onDelete });
    const row = screen.getByText('hello').closest('div.group') as HTMLDivElement;
    await longPress(row);
    fireEvent.click(screen.getByLabelText('删除'));
    expect(screen.getByText('确认删除？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith('msg-1');
    expect(screen.queryByText('确认删除？')).toBeNull();
  });

  it('确认删除可取消且不触发 onDelete；无 onDelete 时长按不出现按钮', async () => {
    renderBubble({ role: 'assistant' });
    const row = screen.getByText('hello').closest('div.group') as HTMLDivElement;
    await longPress(row);
    expect(screen.queryByLabelText('删除')).toBeNull();

    const onDelete = vi.fn();
    renderBubble({ role: 'assistant', content: 'second' }, { onDelete });
    await longPress(screen.getByText('second').closest('div.group') as HTMLDivElement);
    fireEvent.click(screen.getByLabelText('删除'));
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('确认删除？')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('时间戳覆盖 1 分钟、1 小时、1 天与跨 7 天格式', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const times = [
      [new Date(now.getTime() - 60_000), '1 分钟前'],
      [new Date(now.getTime() - 3_600_000), '1 小时前'],
      [new Date(now.getTime() - 86_400_000), '1 天前'],
      [new Date('2026-09-30T12:00:00Z'), 'Sep 30, 12:00 PM'],
    ] as const;
    for (const [timestamp, expected] of times) {
      const { unmount } = renderBubble({ timestamp });
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
    }
    expect(messages).toEqual(
      expect.arrayContaining(['common.minutesAgo', 'common.hoursAgo', 'common.daysAgo']),
    );
  });
});
