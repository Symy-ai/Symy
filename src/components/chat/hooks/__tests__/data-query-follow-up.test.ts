/**
 * data-query-follow-up 测试 (batch59-c)
 *
 * 最近一条数据问答卡元数据提取 (内存级会话态 → 请求体 dataQueryContext):
 * 从后往前取最近一条; 无数据问答卡 → null (服务端回落普通检测链)。
 */

import { describe, expect, it } from 'vitest';
import { lastDataQueryMeta } from '../data-query-follow-up';
import type { ChatMessage } from '@/components/chat-bubble';

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'x',
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    ...partial,
  } as ChatMessage;
}

describe('lastDataQueryMeta', () => {
  it('取最近一条数据问答卡 (多条取末尾)', () => {
    const messages = [
      msg({ savingsQueryCard: { window: 'thisMonth', status: 'ok' } as ChatMessage['savingsQueryCard'] }),
      msg({ categoryQueryCard: { window: 'thisWeek', category: 'food', status: 'ok' } as ChatMessage['categoryQueryCard'] }),
    ];
    expect(lastDataQueryMeta(messages)).toEqual({ kind: 'category', window: 'thisWeek', category: 'food' });
  });

  it('savings 卡只带窗口; impulse 卡带时段', () => {
    expect(lastDataQueryMeta([msg({ savingsQueryCard: { window: 'lastWeek', status: 'ok' } as ChatMessage['savingsQueryCard'] })]))
      .toEqual({ kind: 'savings', window: 'lastWeek' });
    expect(lastDataQueryMeta([msg({ impulseTimeCard: { window: 'thisMonth', impulseWindow: 'lateNight', status: 'ok' } as ChatMessage['impulseTimeCard'] })]))
      .toEqual({ kind: 'impulse', window: 'thisMonth', impulseWindow: 'lateNight' });
  });

  it('无数据问答卡 → null; 空列表 → null', () => {
    expect(lastDataQueryMeta([msg({}), msg({ greenAlt: { id: 'g', why: 'w', options: [] } as never })])).toBeNull();
    expect(lastDataQueryMeta([])).toBeNull();
  });

  it('跳过普通消息取最近一条', () => {
    const messages = [
      msg({ impulseTimeCard: { window: 'thisWeek', impulseWindow: 'evening', status: 'ok' } as ChatMessage['impulseTimeCard'] }),
      msg({}),
      msg({}),
    ];
    expect(lastDataQueryMeta(messages)).toEqual({ kind: 'impulse', window: 'thisWeek', impulseWindow: 'evening' });
  });
});
