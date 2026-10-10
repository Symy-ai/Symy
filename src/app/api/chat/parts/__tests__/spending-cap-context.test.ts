import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSpendingCapContext } from '../spending-cap-context';

function chain(data: unknown) {
  return {
    select: () => chain(data),
    eq: (_col: string, _val: string) => chain(data),
    gte: () => chain(data),
    lte: () => chain(data),
    maybeSingle: () => ({ data }),
  };
}


describe('loadSpendingCapContext', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  });

  afterAll(() => vi.useRealTimers());

  it('injects warning context and marks exceeded cap', async () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const periodStart = '2026-09-01T00:00:00Z';
    const rows = { from: (table: string) => chain(table === 'shopping_facts'
      ? { value: JSON.stringify({ capCents: 50000, periodStart, warningPct: 80 }) }
      : table === 'health_events'
        ? [{ metadata: { savedAmount: 300 }, created_at: now.toISOString() }, { metadata: { savedAmount: 220 }, created_at: now.toISOString() }]
        : []) };
    const context = await loadSpendingCapContext('u', rows as never);
    expect(context).toMatchObject({ exceeded: true });
    expect(context.line).toContain('symy_spending_cap_context');
  });

  it('is silent when cap is disabled', async () => {
    const rows = { from: () => chain({ value: null }) };
    expect(await loadSpendingCapContext('u', rows as never)).toEqual({ exceeded: false });
  });

  it('warning 态 (ok 与 exceeded 之间): line 带 warn 文案, exceeded=false', async () => {
    const now = new Date('2026-09-15T12:00:00Z');
    // cap 50000 分=500; 守护 300 → 60% < 80% warningPct → ok? 须超 warning 才 line
    // 300+220=520 分=5.2 > 500 → exceeded; 用 260+250=510? 不——精确卡 warning: 420 分 (84%)
    const rows = { from: (table: string) => chain(table === 'shopping_facts'
      ? { value: JSON.stringify({ capCents: 50000, periodStart: '2026-09-01T00:00:00Z', warningPct: 80 }) }
      : table === 'health_events'
        ? [{ metadata: { savedAmount: 300 }, created_at: now.toISOString() }, { metadata: { savedAmount: 120 }, created_at: now.toISOString() }]
        : []) };
    const context = await loadSpendingCapContext('u', rows as never);
    expect(context.exceeded).toBe(false);
    expect(context.line).toContain('84% used');       // 420/500 = 84%
    expect(context.line).toContain('warn before new purchase decisions');
  });

  it('store 抛异常 → catch 兜底 {exceeded:false} (chat 永不因 cap 上下文阻塞)', async () => {
    const exploding = {
      from: () => {
        throw new Error('db down');
      },
    };
    expect(await loadSpendingCapContext('u', exploding as never)).toEqual({ exceeded: false });
  });

  it('email_receipts refunded 行并入 events (守护+退款双源)', async () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const rows = { from: (table: string) => chain(table === 'shopping_facts'
      ? { value: JSON.stringify({ capCents: 50000, periodStart: '2026-09-01T00:00:00Z', warningPct: 50 }) }
      : table === 'health_events'
        ? [{ metadata: { savedAmount: 200 }, created_at: now.toISOString() }]
        : table === 'email_receipts'
          ? [{ amount: 300, received_at: now.toISOString() }]
          : []) };
    const context = await loadSpendingCapContext('u', rows as never);
    // 200+300=500 分 = 100% cap → exceeded
    expect(context.exceeded).toBe(true);
    expect(context.line).toContain('100% used');
  });
});
