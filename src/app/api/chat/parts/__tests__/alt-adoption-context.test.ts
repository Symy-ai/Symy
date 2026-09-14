import { describe, it, expect } from 'vitest';
import {
  buildAltAdoptionLine,
  buildAltFootprintCard,
  loadAltAdoptionContext,
  altFootprintSseEvent,
  type AltAdoptionStore,
} from '../alt-adoption-context';
import { aggregateAltAdoptionProfile, ALT_ADOPTION_TRIGGER_PREFIX } from '@/lib/alt-adoption-profile';

const NOW = new Date(2026, 8, 8, 12, 0, 0);

function row(entryId: string, day: number, estSaved = 0) {
  return {
    trigger_id: `${ALT_ADOPTION_TRIGGER_PREFIX}${entryId}:2026-09-${String(day).padStart(2, '0')}`,
    metadata: { kind: 'green_alt_adoption', entryId, estSaved },
    created_at: new Date(2026, 8, day, 9, 0, 0).toISOString(),
  };
}

function stubStore(rows: unknown[], shouldThrow = false): AltAdoptionStore {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            like: () => ({
              order: () => ({
                limit: () => ({
                  then: (onFulfilled: (r: { data: unknown }) => unknown, onRejected: (e: unknown) => unknown) =>
                    shouldThrow ? onRejected(new Error('db down')) : onFulfilled({ data: rows }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as AltAdoptionStore;
}

describe('buildAltAdoptionLine', () => {
  it('画像 → 单行摘要: 计数 + 词条名 + 非 shame 使用指令', () => {
    const profile = aggregateAltAdoptionProfile([
      { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill' }, createdAt: new Date(2026, 8, 7) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill' }, createdAt: new Date(2026, 8, 6) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur' }, createdAt: new Date(2026, 8, 5) },
    ], NOW);
    const line = buildAltAdoptionLine(profile, 'zh')!;
    expect(line).toContain('symy_alt_profile:');
    expect(line).toContain('3 green-alternative adoptions total');
    expect(line).toContain('替换装 x2');
    expect(line).toContain('never shame');
  });

  it('insufficient → undefined (字段省略)', () => {
    expect(buildAltAdoptionLine(aggregateAltAdoptionProfile([], NOW), 'zh')).toBeUndefined();
  });

  it('金额红线: 注入行无金额 (estSaved 只进卡内 private)', () => {
    const profile = aggregateAltAdoptionProfile([
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 1299.5 }, createdAt: new Date(2026, 8, 7) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 1299.5 }, createdAt: new Date(2026, 8, 6) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill' }, createdAt: new Date(2026, 8, 5) },
    ], NOW);
    const line = buildAltAdoptionLine(profile, 'zh')!;
    expect(line).not.toContain('1299.5');
    expect(line).not.toMatch(/\$\d/);
  });
});

describe('buildAltFootprintCard', () => {
  it('public/private 分离: public 只有计数与替代名', () => {
    const profile = aggregateAltAdoptionProfile([
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 300 }, createdAt: new Date(2026, 8, 7) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur', estSaved: 300 }, createdAt: new Date(2026, 8, 6) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill' }, createdAt: new Date(2026, 8, 5) },
    ], NOW);
    const card = buildAltFootprintCard(profile, 600, 'en')!;
    expect(card.public.totalAdoptions).toBe(3);
    expect(card.public.topEntries[0]).toEqual({ label: 'fur coat', count: 2 });
    expect(card.private.savedEstimate).toBe(600);
    expect(JSON.stringify(card.public)).not.toMatch(/saved|amount|estimate/i);
  });

  it('SSE 事件字节形状', () => {
    const profile = aggregateAltAdoptionProfile([
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur' }, createdAt: new Date(2026, 8, 7) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'fur' }, createdAt: new Date(2026, 8, 6) },
      { metadata: { kind: 'green_alt_adoption', entryId: 'beauty_refill' }, createdAt: new Date(2026, 8, 5) },
    ], NOW);
    const card = buildAltFootprintCard(profile, 0, 'zh')!;
    const bytes = altFootprintSseEvent(card);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('data: ')).toBe(true);
    expect(text).toContain('"type":"alt_footprint"');
  });
});

describe('loadAltAdoptionContext', () => {
  it('无 userId / 无 store → 降级 (line undefined, card null)', async () => {
    const r1 = await loadAltAdoptionContext({ userId: undefined, store: stubStore([]), userContent: '我的替代足迹', locale: 'zh', now: NOW });
    const r2 = await loadAltAdoptionContext({ userId: 'u1', store: null, userContent: '我的替代足迹', locale: 'zh', now: NOW });
    expect(r1.line).toBeUndefined();
    expect(r1.card).toBeNull();
    expect(r2.line).toBeUndefined();
  });

  it('查询失败 → 静默降级, 不抛错', async () => {
    const r = await loadAltAdoptionContext({ userId: 'u1', store: stubStore([], true), userContent: '我的替代足迹', locale: 'zh', now: NOW });
    expect(r.line).toBeUndefined();
    expect(r.card).toBeNull();
  });

  it('有数据 → symy_alt_profile 行出现在载荷; 召回意图命中 → 足迹卡', async () => {
    const rows = [row('fur', 7), row('fur', 6), row('beauty_refill', 5, 120)];
    const r = await loadAltAdoptionContext({ userId: 'u1', store: stubStore(rows), userContent: '我做过哪些绿色替代', locale: 'zh', now: NOW });
    expect(r.line).toContain('symy_alt_profile: 3 green-alternative adoptions total');
    expect(r.card).not.toBeNull();
    expect(r.card!.public.totalAdoptions).toBe(3);
    expect(r.card!.private.savedEstimate).toBe(120);
  });

  it('无召回意图 → 有行无卡; 意图命中但样本不足 → 无行无卡', async () => {
    const rows = [row('fur', 7), row('fur', 6), row('beauty_refill', 5)];
    const r1 = await loadAltAdoptionContext({ userId: 'u1', store: stubStore(rows), userContent: '今天天气不错', locale: 'zh', now: NOW });
    expect(r1.line).toBeDefined();
    expect(r1.card).toBeNull();

    const r2 = await loadAltAdoptionContext({ userId: 'u1', store: stubStore([row('fur', 7)]), userContent: '我的替代足迹', locale: 'zh', now: NOW });
    expect(r2.line).toBeUndefined();
    expect(r2.card).toBeNull();
  });

  it('空数据 → 降级', async () => {
    const r = await loadAltAdoptionContext({ userId: 'u1', store: stubStore([]), userContent: '我的替代足迹', locale: 'zh', now: NOW });
    expect(r.line).toBeUndefined();
    expect(r.card).toBeNull();
  });
});
