// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { generateGuardDiary } from '@/lib/guard-diary';
import {
  _resetGuardDiaryStoreForTest,
  isGuardDiaryFavorited,
  listGuardDiaryFavorites,
  toggleGuardDiaryFavorite,
} from '@/lib/guard-diary-store';

function diaryOn(date: string) {
  return generateGuardDiary(
    [{ createdAt: `${date}T12:00:00`, metadata: { amount: 50, category: 'clothing' } }],
    { locale: 'zh', date },
  );
}

describe('guard-diary-store', () => {
  afterEach(() => {
    _resetGuardDiaryStoreForTest();
  });

  it('初始为空; toggle 后收藏 (星标状态翻转)', () => {
    const d = diaryOn('2026-09-08');
    expect(listGuardDiaryFavorites()).toEqual([]);
    expect(toggleGuardDiaryFavorite(d)).toBe(true);
    expect(isGuardDiaryFavorited('2026-09-08')).toBe(true);
    expect(toggleGuardDiaryFavorite(d)).toBe(false);
    expect(isGuardDiaryFavorited('2026-09-08')).toBe(false);
  });

  it('收藏条目只含面子字段 — estSaved 永不落盘', () => {
    const d = diaryOn('2026-09-08');
    toggleGuardDiaryFavorite(d);
    const raw = window.localStorage.getItem('symy-guard-diary-favorites') || '';
    expect(raw).not.toContain('estSaved');
    expect(raw).not.toContain('50'); // estSaved=50 不出现 (hours=2 与 count=1 可出现)
    const favs = listGuardDiaryFavorites();
    expect(favs.length).toBe(1);
    expect(favs[0].text).toBe(d.text);
    expect(favs[0].guardCount).toBe(1);
    expect(favs[0].hoursReclaimed).toBe(2);
  });

  it('最近 30 条上限 — 超限淘汰最旧', () => {
    for (let i = 1; i <= 32; i += 1) {
      const date = i <= 31 ? `2026-08-${String(i).padStart(2, '0')}` : '2026-09-01';
      toggleGuardDiaryFavorite(diaryOn(date));
    }
    const favs = listGuardDiaryFavorites();
    expect(favs.length).toBe(30);
    // 最旧的 08-01/08-02 被淘汰, 新→旧排序
    expect(favs.some((f) => f.date === '2026-08-01')).toBe(false);
    expect(favs.some((f) => f.date === '2026-08-02')).toBe(false);
    expect(favs[0].date).toBe('2026-09-01');
    expect(favs[favs.length - 1].date).toBe('2026-08-03');
  });

  it('坏数据静默剔除', () => {
    window.localStorage.setItem('symy-guard-diary-favorites', '[{"date":"bad","text":1}]');
    expect(listGuardDiaryFavorites()).toEqual([]);
  });
});
