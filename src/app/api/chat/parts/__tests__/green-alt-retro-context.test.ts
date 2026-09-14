/**
 * green-alt-retro-context 测试 — 证据行 / 偏好 gap-fill 合并 / 加载降级 (batch68-a)
 *
 * 覆盖: 复盘证据行 (英文定性, 零金额零碳, 收关键词); mergeGreenAltRetroPreference
 * gap-fill 语义 (显式拒绝偏好优先, already_have/rent_borrow 才产冷却, 且合并结果
 * 喂 suggestAlternativeWithPreference 后同域推荐体现 reuse-first — 验收 #2);
 * loadGreenAltRetroContext stub store 契约 + 失败静默降级; 自由文本回答的
 * 结构化证据 (证据行 + 收束指令, 不再追问, 零金额)。
 */

import { describe, expect, it } from 'vitest';
import { emptyGreenAltPreferenceState, resolveGreenAltPreference, type GreenAltRejectionEventInput } from '@/lib/green-alt-preference';
import { suggestAlternativeWithPreference } from '@/lib/green-alt-preference-rank';
import { buildGreenAltRetroEventPayload } from '@/lib/green-alt-retro';
import {
  buildGreenAltRetroAnswerPrompt,
  buildGreenAltRetroEvidenceLine,
  loadGreenAltRetroContext,
  mergeGreenAltRetroPreference,
  type GreenAltRetroStore,
} from '../green-alt-retro-context';

const NOW = new Date('2026-09-09T12:00:00Z');

function rejectionEvent(entryId: string, reason: 'already_have' | 'wrong_channel', atMs = NOW.getTime()): GreenAltRejectionEventInput {
  return {
    triggerId: `green-alt-rejection:${entryId}:${reason}:2026-09-09`,
    metadata: { source: 'green_alt_rejection', entryId, category: 'food', reason },
    createdAt: new Date(atMs).toISOString(),
  };
}

describe('buildGreenAltRetroEvidenceLine — 定性证据行', () => {
  it('英文单行, 带词条显示名与原因标签 + freeform 定性词', () => {
    const line = buildGreenAltRetroEvidenceLine(
      [
        { entryId: 'milk_tea', category: 'food', reason: 'already_have', atMs: NOW.getTime() - 86400000 },
        { entryId: 'milk_tea', category: 'food', reason: 'freeform', note: '家里有', keywords: ['家里有'], atMs: NOW.getTime() - 86400000 },
      ],
      'zh',
      NOW,
    )!;
    expect(line).toContain('symy_green_alt_retro:');
    expect(line).toContain('奶茶');
    expect(line).toContain('already had one at hand');
    expect(line).toContain('家里有');
  });

  it('零金额零碳数值', () => {
    const line = buildGreenAltRetroEvidenceLine(
      [{ entryId: 'milk_tea', category: 'food', reason: 'rent_borrow', atMs: NOW.getTime() }],
      'en',
      NOW,
    )!;
    // 只断言真实数值形态 (禁令句里的 "carbon numbers" 字样是护栏本身, 不算数值)
    expect(line).not.toMatch(/\$\s?\d|\d+\s*元|\d+(?:\.\d+)?\s*(?:kg|t)\s*co2?/i);
  });

  it('空事件 → undefined', () => {
    expect(buildGreenAltRetroEvidenceLine([], 'zh', NOW)).toBeUndefined();
  });
});

describe('mergeGreenAltRetroPreference — gap-fill 合并 (验收 #2)', () => {
  it('already_have 复盘 → 词条+品类冷却, 且同域推荐 reuse-first 表达', () => {
    const merged = mergeGreenAltRetroPreference(emptyGreenAltPreferenceState(), [
      { entryId: 'milk_tea', category: 'food', reason: 'already_have', atMs: NOW.getTime() },
    ], NOW);
    expect(merged.byEntry.get('milk_tea')?.reason).toBe('already_have');
    expect(merged.byCategory.get('food')?.reason).toBe('already_have');

    const suggestion = suggestAlternativeWithPreference('想喝奶茶', 'zh', merged);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.message).toMatch(/手头|已有|保温杯|复用/);
  });

  it('rent_borrow → wrong_channel 渠道表达 (租借先行), 无品类降频', () => {
    const merged = mergeGreenAltRetroPreference(emptyGreenAltPreferenceState(), [
      { entryId: 'milk_tea', category: 'food', reason: 'rent_borrow', atMs: NOW.getTime() },
    ], NOW);
    expect(merged.byEntry.get('milk_tea')?.reason).toBe('wrong_channel');
    expect(merged.byCategory.has('food')).toBe(false);
  });

  it('try_once / reduce_idle 不产冷却 (只进定性行)', () => {
    const merged = mergeGreenAltRetroPreference(emptyGreenAltPreferenceState(), [
      { entryId: 'milk_tea', category: 'food', reason: 'try_once', atMs: NOW.getTime() },
      { entryId: 'milk_tea', category: 'food', reason: 'reduce_idle', atMs: NOW.getTime() },
    ], NOW);
    expect(merged.byEntry.size).toBe(0);
    expect(merged.byCategory.size).toBe(0);
  });

  it('显式拒绝偏好优先, 复盘只补空位', () => {
    const base = resolveGreenAltPreference([rejectionEvent('milk_tea', 'already_have')], NOW);
    const merged = mergeGreenAltRetroPreference(base, [
      { entryId: 'milk_tea', category: 'food', reason: 'rent_borrow', atMs: NOW.getTime() },
      { entryId: 'takeaway_cup', category: 'food', reason: 'already_have', atMs: NOW.getTime() },
    ], NOW);
    // base 词条级偏好不被覆盖
    expect(merged.byEntry.get('milk_tea')).toEqual(base.byEntry.get('milk_tea'));
    // 空位被补上
    expect(merged.byEntry.get('takeaway_cup')?.reason).toBe('already_have');
  });

  it('过期复盘事件不产冷却', () => {
    const merged = mergeGreenAltRetroPreference(emptyGreenAltPreferenceState(), [
      { entryId: 'milk_tea', category: 'food', reason: 'already_have', atMs: NOW.getTime() - 30 * 86400000 },
    ], NOW);
    expect(merged.byEntry.size).toBe(0);
  });
});

// ============================================================
// loadGreenAltRetroContext — stub store 契约 + 降级
// ============================================================

function stubStore(rows: Array<{ trigger_id: string; metadata: Record<string, unknown>; created_at: string }>): GreenAltRetroStore {
  const chain = {
    select: () => chain,
    eq: () => chain,
    like: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (onFulfilled: (res: { data: unknown }) => unknown) => Promise.resolve({ data: rows }).then(onFulfilled),
  };
  return { from: () => chain as never };
}

describe('loadGreenAltRetroContext', () => {
  it('读取 → 解析 → 证据行 (best-effort)', async () => {
    const payload = buildGreenAltRetroEventPayload({ entryId: 'milk_tea', reason: 'already_have', now: NOW })!;
    const result = await loadGreenAltRetroContext({
      userId: 'u1',
      store: stubStore([{ trigger_id: payload.triggerId, metadata: payload.metadata as Record<string, unknown>, created_at: NOW.toISOString() }]),
      locale: 'zh',
      now: NOW,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ entryId: 'milk_tea', reason: 'already_have' });
    expect(result.line).toContain('奶茶');
  });

  it('无 userId / 无 store → 静默降级 (空事件, line undefined)', async () => {
    expect(await loadGreenAltRetroContext({ userId: undefined, store: stubStore([]), locale: 'zh' })).toEqual({ events: [], line: undefined });
    expect(await loadGreenAltRetroContext({ userId: 'u1', store: null, locale: 'zh' })).toEqual({ events: [], line: undefined });
  });

  it('查询失败 → 静默降级, 绝不阻塞聊天', async () => {
    const failing = {
      from: () => {
        throw new Error('boom');
      },
    } as unknown as GreenAltRetroStore;
    expect(await loadGreenAltRetroContext({ userId: 'u1', store: failing, locale: 'zh' })).toEqual({ events: [], line: undefined });
  });
});

describe('buildGreenAltRetroAnswerPrompt — 自由文本回答的结构化证据', () => {
  it('证据行带原话摘录与定性词; 指令行要求收束且不再追问', () => {
    const { evidenceLine, promptLine } = buildGreenAltRetroAnswerPrompt({
      entryId: 'milk_tea',
      note: '家里有保温杯, 省事',
      locale: 'zh',
    });
    expect(evidenceLine).toContain('奶茶');
    expect(evidenceLine).toContain('家里有保温杯');
    expect(promptLine).toMatch(/do NOT re-ask/i);
    expect(promptLine).not.toMatch(/\$\s?\d|\d+\s*元/);
  });
});
