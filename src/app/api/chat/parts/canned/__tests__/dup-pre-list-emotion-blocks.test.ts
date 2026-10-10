import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildDuplicate: vi.fn((..._a: unknown[]): { reply: string; duplicatePrecheckCard: unknown } | null => null),
  duplicateSse: vi.fn(() => 'sse-dup'),
  buildPrepurchase: vi.fn((..._a: unknown[]): { reply: string; prepurchaseCard: unknown } | null => null),
  prepurchaseSse: vi.fn(() => 'sse-pre'),
  buildListTriage: vi.fn((..._a: unknown[]): { reply: string; listTriageCard: unknown } | null => null),
  listTriageSse: vi.fn(() => 'sse-list'),
  buildEmotion: vi.fn((..._a: unknown[]): { reply: string; emotionGuardCard: unknown } | null => null),
  emotionSse: vi.fn(() => 'sse-emo'),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../duplicate-purchase-turn', () => ({
  buildDuplicatePurchaseTurn: M.buildDuplicate,
  buildDuplicatePurchaseSseStream: M.duplicateSse,
}));
vi.mock('../../prepurchase-turn', () => ({
  buildPrepurchaseTurn: M.buildPrepurchase,
  buildPrepurchaseSseStream: M.prepurchaseSse,
}));
vi.mock('../../list-triage-turn', () => ({
  buildListTriageTurn: M.buildListTriage,
  buildListTriageSseStream: M.listTriageSse,
}));
vi.mock('@/lib/guard-scope', () => ({
  defaultGuardScope: vi.fn(() => ({ mode: 'standard' })),
}));
vi.mock('../../emotion-guard-turn', () => ({
  buildEmotionGuardTurn: M.buildEmotion,
  buildEmotionGuardSseStream: M.emotionSse,
}));

import { tryDuplicatePurchaseBlock } from '../duplicate-purchase-block';
import { tryPrepurchaseBlock } from '../prepurchase-block';
import { tryListTriageBlock } from '../list-triage-block';
import { tryEmotionGuardBlock } from '../emotion-guard-block';

const baseInput = {
  userContent: '家里还有没有耳机',
  locale: 'zh' as const,
  stream: false,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * b137 拆解第七/八/十一/六刀打包 (40+43+46+49=178行)。
 *
 * 锁定 (四块同构三态):
 * - duplicate: null/JSON(duplicatePrecheckCard)/SSE
 * - prepurchase: null/JSON(prepurchaseCard)/SSE
 * - list-triage: null/JSON(listTriageCard)+guardScope 缺省兜底/SSE
 * - emotion-guard: suppressGuardCards 首位挡 → null; null/JSON(emotionGuardCard)/SSE
 */
describe('tryDuplicatePurchaseBlock (重复购买预检)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildDuplicate.mockReturnValue(null);
  });

  it('未命中 → null', async () => {
    expect(await tryDuplicatePurchaseBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON+duplicatePrecheckCard', async () => {
    M.buildDuplicate.mockReturnValueOnce({ reply: '先查家底', duplicatePrecheckCard: { kind: 'duplicate' } });
    const r = await tryDuplicatePurchaseBlock(baseInput as never);
    const body = await (r as Response).json();
    expect(body.duplicatePrecheckCard.kind).toBe('duplicate');
  });

  it('命中 → SSE', async () => {
    M.buildDuplicate.mockReturnValueOnce({ reply: 'r', duplicatePrecheckCard: {} });
    expect(await (await tryDuplicatePurchaseBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-dup');
  });
});

describe('tryPrepurchaseBlock (买前三问)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildPrepurchase.mockReturnValue(null);
  });

  it('未命中 → null', async () => {
    expect(await tryPrepurchaseBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON+prepurchaseCard', async () => {
    M.buildPrepurchase.mockReturnValueOnce({ reply: '三问', prepurchaseCard: { kind: 'prepurchase' } });
    const r = await tryPrepurchaseBlock(baseInput as never);
    expect((await (r as Response).json()).prepurchaseCard.kind).toBe('prepurchase');
  });

  it('命中 → SSE', async () => {
    M.buildPrepurchase.mockReturnValueOnce({ reply: 'r', prepurchaseCard: {} });
    expect(await (await tryPrepurchaseBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-pre');
  });
});

describe('tryListTriageBlock (清单分诊)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildListTriage.mockReturnValue(null);
  });

  it('未命中 → null', async () => {
    expect(await tryListTriageBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON+listTriageCard+guardScope 缺省兜底', async () => {
    M.buildListTriage.mockReturnValueOnce({ reply: '逐条分诊', listTriageCard: { kind: 'list-triage' } });
    const r = await tryListTriageBlock({ ...baseInput, guardScope: null } as never);
    const body = await (r as Response).json();
    expect(body.listTriageCard.kind).toBe('list-triage');
    expect(M.buildListTriage).toHaveBeenCalledWith(expect.objectContaining({ guardScope: { mode: 'standard' } })); // 缺省兜底锚
  });

  it('命中 → SSE', async () => {
    M.buildListTriage.mockReturnValueOnce({ reply: 'r', listTriageCard: {} });
    expect(await (await tryListTriageBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-list');
  });
});

describe('tryEmotionGuardBlock (情绪守护)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildEmotion.mockReturnValue(null);
  });

  it('suppressGuardCards=true → null (首位挡, 不进 detector)', async () => {
    expect(await tryEmotionGuardBlock({ ...baseInput, suppressGuardCards: true } as never)).toBeNull();
    expect(M.buildEmotion).not.toHaveBeenCalled();
  });

  it('未命中 → null', async () => {
    expect(await tryEmotionGuardBlock({ ...baseInput, suppressGuardCards: false } as never)).toBeNull();
  });

  it('命中 → JSON+emotionGuardCard+intensity/greenPref 透传', async () => {
    M.buildEmotion.mockReturnValueOnce({ reply: '先抱抱', emotionGuardCard: { kind: 'emotion' } });
    const r = await tryEmotionGuardBlock({ ...baseInput, suppressGuardCards: false, guardIntensity: 'gentle', greenPref: 'on' } as never);
    const body = await (r as Response).json();
    expect(body.emotionGuardCard.kind).toBe('emotion');
    expect(M.buildEmotion).toHaveBeenCalledWith(expect.objectContaining({ guardIntensity: 'gentle', greenPref: 'on' }));
  });

  it('命中 → SSE', async () => {
    M.buildEmotion.mockReturnValueOnce({ reply: 'r', emotionGuardCard: {} });
    expect(
      await (await tryEmotionGuardBlock({ ...baseInput, suppressGuardCards: false, stream: true } as never))?.text(),
    ).toBe('sse-emo');
  });
});
