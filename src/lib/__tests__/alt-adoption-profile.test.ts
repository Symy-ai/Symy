import { describe, it, expect } from 'vitest';
import {
  aggregateAltAdoptionProfile,
  greenAltDisplayLabel,
  ALT_ADOPTION_TRIGGER_PREFIX,
} from '../alt-adoption-profile';

const NOW = new Date(2026, 8, 8, 12, 0, 0);

function row(entryId: string, day: number, opts: { estSaved?: number; triggerId?: string } = {}) {
  return {
    triggerId: opts.triggerId ?? `${ALT_ADOPTION_TRIGGER_PREFIX}${entryId}:2026-09-${String(day).padStart(2, '0')}`,
    metadata: {
      kind: 'green_alt_adoption',
      entryId,
      estSaved: opts.estSaved ?? 0,
    },
    createdAt: new Date(2026, 8, day, 9, 0, 0),
  };
}

describe('aggregateAltAdoptionProfile', () => {
  it('Top-3 按 count 降序; 同 count 时 estSaved 权重高者靠前; 再按 entryId 稳定排序', () => {
    const profile = aggregateAltAdoptionProfile([
      row('beauty_refill', 1),
      row('beauty_refill', 2),
      row('beauty_refill', 3),
      row('refurb_gadget', 4, { estSaved: 500 }),
      row('refurb_gadget', 5, { estSaved: 500 }),
      row('secondhand_furniture', 6, { estSaved: 0 }),
      row('secondhand_furniture', 7, { estSaved: 0 }),
      row('fur', 8, { estSaved: 0 }),
    ], NOW);
    expect(profile.status).toBe('ok');
    expect(profile.topEntries.map((e) => e.entryId)).toEqual([
      'beauty_refill', // count=3 第一
      'refurb_gadget', // count=2, estSaved 权重 1000 > 0
      'secondhand_furniture', // count=2 同权重 0, entryId 字典序 's' > 'r' 但权重已分出; 此处与 fur 比 count 2>1
    ]);
  });

  it('同 count 同权重 → entryId 字典序稳定排序', () => {
    const profile = aggregateAltAdoptionProfile([
      row('fur', 1),
      row('beauty_refill', 2),
      row('tortoiseshell', 3),
      row('fur', 4),
      row('beauty_refill', 5),
      row('tortoiseshell', 6),
    ], NOW);
    expect(profile.topEntries.map((e) => e.entryId)).toEqual(['beauty_refill', 'fur', 'tortoiseshell']);
  });

  it('Top-3 解析出 zh/en 显示名与 category', () => {
    const profile = aggregateAltAdoptionProfile([
      row('beauty_refill', 1),
      row('beauty_refill', 2),
      row('refurb_gadget', 3),
    ], NOW);
    const top = profile.topEntries[0];
    expect(top.labelZh).toBe('替换装');
    expect(top.labelEn).toBe('refill');
    expect(top.category).toBe('beauty');
  });

  it('最近 30 天窗口计数 + 覆盖域数 (去重非 other 品类)', () => {
    const old = (entryId: string) => ({
      triggerId: `${ALT_ADOPTION_TRIGGER_PREFIX}${entryId}:2026-07-01`,
      metadata: { kind: 'green_alt_adoption', entryId, estSaved: 0 },
      createdAt: new Date(2026, 6, 1, 9, 0, 0), // 7 月 1 日 → 窗口外
    });
    const profile = aggregateAltAdoptionProfile([
      row('beauty_refill', 20), // 9 月 → 窗口内
      old('refurb_gadget'),
      old('fur'),
    ], NOW);
    expect(profile.totalAdoptions).toBe(3);
    expect(profile.last30Days).toBe(1);
    expect(profile.categoriesCovered).toBe(3); // beauty + electronics + wear
  });

  it('样本不足 (<3) → insufficient 稳定降级, 不抛错', () => {
    const profile = aggregateAltAdoptionProfile([row('fur', 1), row('fur', 2)], NOW);
    expect(profile.status).toBe('insufficient');
    expect(profile.totalAdoptions).toBe(0);
    expect(profile.topEntries).toEqual([]);
  });

  it('空输入 / 全无效行 → insufficient', () => {
    expect(aggregateAltAdoptionProfile([], NOW).status).toBe('insufficient');
    expect(aggregateAltAdoptionProfile(null, NOW).status).toBe('insufficient');
    expect(aggregateAltAdoptionProfile([
      { triggerId: null, metadata: { kind: 'other' }, createdAt: 'x' },
      { triggerId: null, metadata: null, createdAt: '2026-09-01' },
      { triggerId: null, metadata: { kind: 'green_alt_adoption' }, createdAt: 'not-a-date' },
    ], NOW).status).toBe('insufficient');
  });

  it('triggerId 去重 (落账幂等双保险)', () => {
    const profile = aggregateAltAdoptionProfile([
      row('fur', 1, { triggerId: 'green-alt-adoption:fur:2026-09-01' }),
      row('fur', 2, { triggerId: 'green-alt-adoption:fur:2026-09-01' }),
      row('beauty_refill', 3),
    ], NOW);
    // 去重后仅 2 条有效 → insufficient
    expect(profile.status).toBe('insufficient');
  });

  it('金额红线: estSaved 只做内部排序权重, 输出结构面无金额 (红线测试范式)', () => {
    const profile = aggregateAltAdoptionProfile([
      row('fur', 1, { estSaved: 1234.5 }),
      row('beauty_refill', 2, { estSaved: 99.9 }),
      row('refurb_gadget', 3, { estSaved: 8888 }),
    ], NOW);
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('1234.5');
    expect(serialized).not.toContain('8888');
    expect(serialized).not.toMatch(/estSaved|saved|amount/i);
  });

  it('未注册词条: 计入次数但不参选 Top-3', () => {
    const profile = aggregateAltAdoptionProfile([
      row('ghost_entry_x', 1),
      row('ghost_entry_x', 2),
      row('fur', 3),
    ], NOW);
    expect(profile.status).toBe('ok');
    expect(profile.totalAdoptions).toBe(3);
    expect(profile.topEntries.map((e) => e.entryId)).toEqual(['fur']);
  });
});

describe('greenAltDisplayLabel', () => {
  it('词条表首 trigger 作显示名; 未注册回退 id', () => {
    expect(greenAltDisplayLabel('ivory_bone_carving', 'zh')).toBe('象牙');
    expect(greenAltDisplayLabel('ivory_bone_carving', 'en')).toBe('ivory');
    expect(greenAltDisplayLabel('ghost_entry', 'zh')).toBe('ghost_entry');
  });
});
