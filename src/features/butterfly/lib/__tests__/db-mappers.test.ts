import { describe, expect, it } from 'vitest';

import { dbToSession } from '../db-mappers';

const row = {
  id: 's1',
  user_id: 'u1',
  decision_type: 'buy',
  decision_description: '买咖啡机',
  amount: 129.995, // Bug 7: 三位小数入库
  platform: 'taobao',
  context: null,
  outline: { title: '第一章' },
  current_chapter: 3,
  chapters: [{ index: 1 }],
  choices: [{ id: 'c1' }],
  butterfly_effect: 'eff',
  final_tone: 'hopeful',
  status: 'in_progress',
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
} as unknown as Record<string, unknown>;

/**
 * db-mappers.ts (60行) — DB 行→前端类型 (Round 123 Json cast + Bug 7 + Round 78 红线)。
 *
 * 锁定:
 * - snake_case → camelCase 全字段映射
 * - Bug 7: amount 三位小数 → 2 位截断
 * - Round 78: chapters/choices 坏 JSONB → [] 兜底 (parseJsonArray)
 * - current_chapter null → 0; is_bookmarked 缺席 → false
 */
describe('dbToSession 行映射', () => {
  it('全字段映射 + amount 2 位截断 (Bug 7)', () => {
    const s = dbToSession(row as never);
    expect(s.id).toBe('s1');
    expect(s.userId).toBe('u1');
    expect(s.decisionType).toBe('buy');
    expect(s.decisionDescription).toBe('买咖啡机');
    expect(s.amount).toBe(130); // 129.995 → round(12999.5)/100 = 130
    expect(s.platform).toBe('taobao');
    expect(s.currentChapter).toBe(3);
    expect(s.chapters).toEqual([{ index: 1 }]);
    expect(s.choices).toEqual([{ id: 'c1' }]);
    expect(s.status).toBe('in_progress');
    expect(s.createdAt).toBe('2026-01-01');
  });

  it('Round 78 红线: chapters/choices 坏 JSONB → [] 不 crash', () => {
    const bad = { ...row, chapters: 'not-an-array', choices: { oops: true } } as unknown as Record<string, unknown>;
    const s = dbToSession(bad as never);
    expect(s.chapters).toEqual([]);
    expect(s.choices).toEqual([]);
  });

  it('null 兜底: amount/current_chapter/final_tone; 缺席字段 isBookmarked=false', () => {
    const nulls = { ...row, amount: null, current_chapter: null, final_tone: null, butterfly_effect: null, is_bookmarked: undefined } as unknown as Record<string, unknown>;
    const s = dbToSession(nulls as never);
    expect(s.amount).toBeNull();
    expect(s.currentChapter).toBe(0);
    expect(s.finalTone).toBeNull();
    expect(s.butterflyEffect).toBeNull();
    expect(s.isBookmarked).toBe(false);
  });

  it('is_example 透传 (migration 118)', () => {
    const ex = { ...row, is_example: true, is_bookmarked: true } as unknown as Record<string, unknown>;
    const s = dbToSession(ex as never);
    expect(s.isExample).toBe(true);
    expect(s.isBookmarked).toBe(true);
  });
});
