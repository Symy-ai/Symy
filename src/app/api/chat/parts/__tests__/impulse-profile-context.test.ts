import { describe, it, expect } from 'vitest';
import {
  buildImpulseProfileLine,
  loadImpulseProfileContextLine,
  type ImpulseProfileStore,
} from '../impulse-profile-context';
import { aggregateImpulseTriggerProfile } from '@/lib/impulse-trigger-profile';

function at(hour: number, day = 1): Date {
  return new Date(2026, 5, day, hour, 30, 0);
}

describe('buildImpulseProfileLine', () => {
  it('画像 → 单行摘要: 枚举字段 + 计数, 含 non-shame 使用指令', () => {
    const profile = aggregateImpulseTriggerProfile([
      { metadata: { itemName: 'sneakers', category: 'clothing' }, createdAt: at(23, 1) },
      { metadata: { itemName: 'hoodie', category: 'clothing' }, createdAt: at(23, 1) },
      { metadata: { itemName: 'cap', category: 'clothing' }, createdAt: at(0, 2) },
      { metadata: { itemName: 'disposable cups' }, createdAt: at(13, 2) },
    ]);
    const line = buildImpulseProfileLine(profile)!;
    expect(line).toContain('symy_impulse_profile:');
    expect(line).toContain('top trigger impulse (3/4)');
    expect(line).toContain('most intercepted category clothing');
    expect(line).toContain('Never shame');
  });

  it('insufficient 画像 → undefined (字段省略)', () => {
    expect(buildImpulseProfileLine(aggregateImpulseTriggerProfile([]))).toBeUndefined();
  });

  it('金额红线: 注入行无金额', () => {
    const profile = aggregateImpulseTriggerProfile([
      { metadata: { itemName: 'sneakers', savedAmount: 129.99 }, createdAt: at(23) },
      { metadata: { itemName: 'hoodie', savedAmount: 89.5 }, createdAt: at(23, 2) },
      { metadata: { itemName: 'cap' }, createdAt: at(23, 3) },
    ]);
    const line = buildImpulseProfileLine(profile)!;
    expect(line).not.toContain('129.99');
    expect(line).not.toMatch(/\$\d/);
  });
});

function stubStore(rows: unknown[], shouldThrow = false): ImpulseProfileStore {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
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
  } as unknown as ImpulseProfileStore;
}

describe('loadImpulseProfileContextLine', () => {
  it('无 userId / 无 store → undefined', async () => {
    expect(await loadImpulseProfileContextLine({ userId: undefined, store: stubStore([]) })).toBeUndefined();
    expect(await loadImpulseProfileContextLine({ userId: 'u1', store: null })).toBeUndefined();
  });

  it('查询失败 → 静默降级 undefined, 不抛错', async () => {
    expect(await loadImpulseProfileContextLine({ userId: 'u1', store: stubStore([], true) })).toBeUndefined();
  });

  it('空数据 → undefined; 有数据 → 单行摘要', async () => {
    expect(await loadImpulseProfileContextLine({ userId: 'u1', store: stubStore([]) })).toBeUndefined();

    const rows = [
      { metadata: { itemName: 'sneakers' }, created_at: '2026-06-01T23:30:00' },
      { metadata: { itemName: 'hoodie' }, created_at: '2026-06-02T23:30:00' },
      { metadata: { itemName: 'cap' }, created_at: '2026-06-03T23:30:00' },
    ];
    const line = await loadImpulseProfileContextLine({ userId: 'u1', store: stubStore(rows) });
    expect(line).toContain('symy_impulse_profile: top trigger impulse (3/3)');
  });
});
