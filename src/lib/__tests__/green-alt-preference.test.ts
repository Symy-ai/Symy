/**
 * Tests for green-alt-preference (batch62-b)
 *
 * - recordGreenAltRejection: 载荷形状 (manual_adjustment 纯审计 + metadata.source)
 *   / 非法入参 invalid / 冷却窗内同 entry 同 reason 幂等 / 不同 reason 可记录 /
 *   冷却过期可再记录
 * - resolveGreenAltPreference: 词条级冷却窗口 / 品类级降频窗口 /
 *   过期自动失效 / 同词条最近一次拒绝优先 / 非法行跳过
 * - 冷却时长口径: prefer_buy 短冷却 (不永久屏蔽), already_have 最长
 */

import { describe, it, expect } from 'vitest';
import {
  GREEN_ALT_ENTRY_COOLDOWN_DAYS,
  GREEN_ALT_REJECTION_SOURCE,
  GREEN_ALT_REJECTION_TRIGGER_PREFIX,
  emptyGreenAltPreferenceState,
  greenAltCategoryPreference,
  greenAltEntryPreference,
  recordGreenAltRejection,
  resolveGreenAltPreference,
} from '../green-alt-preference';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const DAY_MS = 86400000;

function eventAt(entryId: string, reason: string, daysAgo: number, extraMeta: Record<string, unknown> = {}) {
  return {
    triggerId: `${GREEN_ALT_REJECTION_TRIGGER_PREFIX}${entryId}:${reason}:2026-09-0${Math.max(1, 9 - daysAgo)}`,
    metadata: { source: GREEN_ALT_REJECTION_SOURCE, entryId, reason, category: 'wear', ...extraMeta },
    createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  };
}

describe('recordGreenAltRejection', () => {
  it('recorded: 载荷走 manual_adjustment 纯审计通道 + metadata 全量口径', () => {
    const outcome = recordGreenAltRejection('fur', 'not_now', [], NOW);
    expect(outcome.status).toBe('recorded');
    const payload = outcome.payload!;
    expect(payload.eventType).toBe('manual_adjustment');
    expect(payload.triggerSource).toBe('manual');
    expect(payload.triggerId).toBe(`${GREEN_ALT_REJECTION_TRIGGER_PREFIX}fur:not_now:2026-09-09`);
    expect(payload.metadata).toEqual({
      source: 'green_alt_rejection',
      entryId: 'fur',
      category: 'wear',
      reason: 'not_now',
    });
    // 审计行: 描述不含用户内容 (隐私面), 无金额字段
    expect(payload.description).toBe('Green alternative rejection feedback');
    expect(JSON.stringify(payload)).not.toContain('$');
  });

  it('invalid: 未知词条 / 非法原因 → 不产载荷', () => {
    expect(recordGreenAltRejection('not_a_real_entry', 'not_now', [], NOW).status).toBe('invalid');
    expect(recordGreenAltRejection('fur', 'guilt_trip' as never, [], NOW).status).toBe('invalid');
  });

  it('idempotent: 冷却窗内同 entry 同 reason → duplicate (重复点击不制造垃圾事件)', () => {
    const recent = [eventAt('fur', 'not_now', 2)];
    expect(recordGreenAltRejection('fur', 'not_now', recent, NOW).status).toBe('duplicate');
    // 窗口边缘内一天也不重复
    expect(recordGreenAltRejection('fur', 'not_now', [eventAt('fur', 'not_now', 6)], NOW).status).toBe('duplicate');
  });

  it('不同 reason 同窗口可记录 (用户改口 = 更新偏好)', () => {
    const recent = [eventAt('fur', 'not_now', 2)];
    expect(recordGreenAltRejection('fur', 'already_have', recent, NOW).status).toBe('recorded');
  });

  it('冷却过期后同 entry 同 reason 可再记录 (刷新偏好, 历史行不删)', () => {
    // not_now 冷却 7 天, 8 天前的那条已过期
    const recent = [eventAt('fur', 'not_now', 8)];
    expect(recordGreenAltRejection('fur', 'not_now', recent, NOW).status).toBe('recorded');
  });

  it('prefer_buy 短冷却 (2 天): 不永久屏蔽用户自主权', () => {
    expect(GREEN_ALT_ENTRY_COOLDOWN_DAYS.prefer_buy).toBeLessThanOrEqual(2);
    expect(GREEN_ALT_ENTRY_COOLDOWN_DAYS.prefer_buy).toBeLessThan(GREEN_ALT_ENTRY_COOLDOWN_DAYS.already_have);
  });
});

describe('resolveGreenAltPreference', () => {
  it('空/全非法输入 → 空状态', () => {
    expect(resolveGreenAltPreference([], NOW).byEntry.size).toBe(0);
    expect(resolveGreenAltPreference(null, NOW).byCategory.size).toBe(0);
    const malformed = [{ metadata: { source: 'other' } }, { metadata: null }, { createdAt: 'not-a-date' }];
    const state = resolveGreenAltPreference(malformed as never, NOW);
    expect(state.byEntry.size).toBe(0);
    expect(state.byCategory.size).toBe(0);
  });

  it('词条级: 冷却窗内有效, 带原因与截止', () => {
    const state = resolveGreenAltPreference([eventAt('fur', 'not_now', 2)], NOW);
    const pref = greenAltEntryPreference(state, 'fur');
    expect(pref?.reason).toBe('not_now');
    expect(pref?.expiresAt).toBe(new Date(NOW.getTime() - 2 * DAY_MS + 7 * DAY_MS).toISOString());
  });

  it('词条级: 过期自动失效 (状态里消失, 事件行不删)', () => {
    const state = resolveGreenAltPreference([eventAt('fur', 'not_now', 8)], NOW);
    expect(greenAltEntryPreference(state, 'fur')).toBeNull();
    expect(emptyGreenAltPreferenceState().byEntry.size).toBe(0);
  });

  it('同词条最近一次拒绝优先 (改口覆盖旧原因)', () => {
    const state = resolveGreenAltPreference([eventAt('fur', 'not_now', 6), eventAt('fur', 'already_have', 1)], NOW);
    expect(greenAltEntryPreference(state, 'fur')?.reason).toBe('already_have');
  });

  it('品类级: not_now 降频同品类 3 天, wrong_channel / prefer_buy 不降频品类', () => {
    const notNow = resolveGreenAltPreference([eventAt('fur', 'not_now', 1)], NOW);
    expect(greenAltCategoryPreference(notNow, 'wear')?.reason).toBe('not_now');

    const wrongChannel = resolveGreenAltPreference([eventAt('fur', 'wrong_channel', 0)], NOW);
    expect(greenAltCategoryPreference(wrongChannel, 'wear')).toBeNull();

    const preferBuy = resolveGreenAltPreference([eventAt('fur', 'prefer_buy', 0)], NOW);
    expect(greenAltCategoryPreference(preferBuy, 'wear')).toBeNull();
    // 但词条级仍短冷却
    expect(greenAltEntryPreference(preferBuy, 'fur')?.reason).toBe('prefer_buy');
  });

  it('品类级: 取失效最晚的一条 (already_have 7 天 > not_now 3 天)', () => {
    const state = resolveGreenAltPreference([
      eventAt('fur', 'not_now', 0),
      eventAt('animal_leather', 'already_have', 2),
    ], NOW);
    expect(greenAltCategoryPreference(state, 'wear')?.reason).toBe('already_have');
    // 两词条各自的词条级偏好互不误伤
    expect(greenAltEntryPreference(state, 'fur')?.reason).toBe('not_now');
    expect(greenAltEntryPreference(state, 'animal_leather')?.reason).toBe('already_have');
  });
});
