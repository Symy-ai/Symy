import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildCooldown: vi.fn((..._a: unknown[]): { reply: string; cooldownCard: unknown } | null => null),
  cooldownSse: vi.fn(() => 'sse-cooldown'),
  defer: vi.fn(() => false),
  buildAsk: vi.fn((..._a: unknown[]): { reply: string; greenAltRetro: unknown } | null => null),
  askSse: vi.fn(() => 'sse-ask'),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../cooldown-turn', () => ({
  buildCooldownTurn: M.buildCooldown,
  buildCooldownSseStream: M.cooldownSse,
}));
vi.mock('../../green-alt-retro-gate', () => ({
  shouldDeferGreenAltRetro: M.defer,
}));
vi.mock('../../green-alt-retro-turn', () => ({
  buildGreenAltRetroAskTurn: M.buildAsk,
  buildGreenAltRetroAskSseStream: M.askSse,
}));

import { tryCooldownBlock } from '../cooldown-block';
import { tryGreenAltRetroAskBlock } from '../green-alt-retro-ask-block';

const baseInput = {
  userContent: '我为什么不能买',
  locale: 'zh' as const,
  stream: false,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * cooldown-block (46行) + green-alt-retro-ask-block (47行) — b137 拆解第十三/十五刀。
 *
 * 锁定:
 * - cooldown: greenPref off → null (双道开关); afterGuardCard 布尔窄化传递; 三态
 * - retro-ask: 无 pending/off → null; defer (新购买等强意图) → null 顺延; 三态
 */
describe('tryCooldownBlock (反驳降温)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildCooldown.mockReturnValue(null);
  });

  it('greenPref off → null (不 import cooldown-turn 也不命中)', async () => {
    expect(await tryCooldownBlock({ ...baseInput, greenPref: 'off' } as never)).toBeNull();
  });

  it('命中 → JSON 短路+cooldownCard', async () => {
    M.buildCooldown.mockReturnValueOnce({ reply: '先深呼吸', cooldownCard: { kind: 'cooldown' } });
    const r = await tryCooldownBlock({ ...baseInput, afterGuardCard: true } as never);
    const body = await (r as Response).json();
    expect(body.cooldownCard.kind).toBe('cooldown');
    expect(M.buildCooldown).toHaveBeenCalledWith({ userContent: '我为什么不能买', locale: 'zh', afterGuardCard: true }); // 布尔窄化锚
  });

  it('命中 → SSE 形态', async () => {
    M.buildCooldown.mockReturnValueOnce({ reply: 'r', cooldownCard: {} });
    const r = await tryCooldownBlock({ ...baseInput, stream: true } as never);
    expect(await r?.text()).toBe('sse-cooldown');
  });
});

describe('tryGreenAltRetroAskBlock (复盘追问)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildAsk.mockReturnValue(null);
    M.defer.mockReturnValue(false);
  });

  it('无 pending → null', async () => {
    expect(await tryGreenAltRetroAskBlock({ ...baseInput, greenAltRetroPending: null } as never)).toBeNull();
  });

  it('greenPref off → null', async () => {
    expect(
      await tryGreenAltRetroAskBlock({ ...baseInput, greenAltRetroPending: { entryId: 'e1' }, greenPref: 'off' } as never),
    ).toBeNull();
  });

  it('强意图 defer (新购买等) → null 顺延', async () => {
    M.defer.mockReturnValueOnce(true);
    expect(
      await tryGreenAltRetroAskBlock({ ...baseInput, greenAltRetroPending: { entryId: 'e1' } } as never),
    ).toBeNull();
  });

  it('命中 → JSON 短路+entryId 透传', async () => {
    M.buildAsk.mockReturnValueOnce({ reply: '这周感觉如何', greenAltRetro: { kind: 'retro-ask' } });
    const r = await tryGreenAltRetroAskBlock({ ...baseInput, greenAltRetroPending: { entryId: 'e1' } } as never);
    const body = await (r as Response).json();
    expect(body.greenAltRetro.kind).toBe('retro-ask');
    expect(M.buildAsk).toHaveBeenCalledWith({ entryId: 'e1', locale: 'zh' });
  });

  it('命中 → SSE 形态', async () => {
    M.buildAsk.mockReturnValueOnce({ reply: 'r', greenAltRetro: {} });
    const r = await tryGreenAltRetroAskBlock({ ...baseInput, greenAltRetroPending: { entryId: 'e1' }, stream: true } as never);
    expect(await r?.text()).toBe('sse-ask');
  });
});
