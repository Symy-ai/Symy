/**
 * green-alt-retro 测试 — 证据词表/落账载荷/解析/映射 (batch68-a)
 *
 * 覆盖: 载荷形状 (trigger_id 约定 / metadata / 零金额零碳); 非法输入拒绝;
 * 自由文本净化截断 + 定性词提取 (金额词不进证据); 事件行解析 roundtrip;
 * 复盘原因 → 既有偏好词表映射 (already_have→already_have,
 * rent_borrow→wrong_channel, 其余不产冷却)。
 */

import { describe, expect, it } from 'vitest';
import {
  GREEN_ALT_RETRO_OPTIONS,
  buildGreenAltRetroEventPayload,
  isGreenAltRetroOptionId,
  parseGreenAltRetroEvent,
  qualitativeKeywordsFromNote,
  retroReasonToPreferenceReason,
  sanitizeGreenAltRetroNote,
} from '../green-alt-retro';

const NOW = new Date('2026-09-09T12:00:00Z');

describe('buildGreenAltRetroEventPayload', () => {
  it('选项回答 → manual_adjustment 载荷, trigger_id/metadata 符合通道约定', () => {
    const payload = buildGreenAltRetroEventPayload({ entryId: 'milk_tea', reason: 'already_have', now: NOW });
    expect(payload).not.toBeNull();
    expect(payload!.eventType).toBe('manual_adjustment');
    expect(payload!.triggerSource).toBe('manual');
    expect(payload!.triggerId).toBe(`green-alt-retro:milk_tea:already_have:2026-09-09`);
    expect(payload!.metadata).toMatchObject({
      source: 'green_alt_retro',
      entryId: 'milk_tea',
      category: 'food',
      reason: 'already_have',
    });
    expect(payload!.metadata.note).toBeUndefined();
    expect(payload!.metadata.keywords).toBeUndefined();
  });

  it('选项回答载荷零金额零碳数值 (无数字字段)', () => {
    const payload = buildGreenAltRetroEventPayload({ entryId: 'milk_tea', reason: 'rent_borrow', now: NOW })!;
    expect(JSON.stringify(payload)).not.toMatch(/amount|saved|carbon|co2|estSaved/i);
  });

  it('freeform 回答只带净化原话与定性词', () => {
    const payload = buildGreenAltRetroEventPayload({
      entryId: 'milk_tea',
      reason: 'freeform',
      note: '  家里有保温杯,\u000b 很顺手！ ',
      now: NOW,
    })!;
    expect(payload.metadata.note).toBe('家里有保温杯, 很顺手！');
    expect(payload.metadata.keywords).toContain('顺手');
    expect(payload.metadata.keywords).toContain('家里有');
  });

  it('未知词条/未知原因 → null (调用方不发请求)', () => {
    expect(buildGreenAltRetroEventPayload({ entryId: 'not-a-real-entry', reason: 'already_have', now: NOW })).toBeNull();
    expect(buildGreenAltRetroEventPayload({ entryId: '', reason: 'already_have', now: NOW })).toBeNull();
  });

  it('trigger_id 按日期键区分 — 同词条同 reason 不同日可再记', () => {
    const a = buildGreenAltRetroEventPayload({ entryId: 'milk_tea', reason: 'try_once', now: NOW })!;
    const b = buildGreenAltRetroEventPayload({ entryId: 'milk_tea', reason: 'try_once', now: new Date('2026-09-10T00:00:01Z') })!;
    expect(a.triggerId).not.toBe(b.triggerId);
  });
});

describe('sanitizeGreenAltRetroNote / qualitativeKeywordsFromNote', () => {
  it('控制符被剥离, 超长截断到 160', () => {
    const long = 'x'.repeat(300);
    expect(sanitizeGreenAltRetroNote(long).length).toBe(160);
    expect(sanitizeGreenAltRetroNote('a\u0000b\t c')).toBe('a b c');
  });

  it('定性词提取去重且封顶 6; 无命中返回空数组', () => {
    const words = qualitativeKeywordsFromNote('省事方便, 家里有, 试试看, 租来的也行, 顺手, 环保, 再加一个');
    expect(words.length).toBeLessThanOrEqual(6);
    expect(new Set(words).size).toBe(words.length);
    expect(words).toContain('省事');
    expect(qualitativeKeywordsFromNote('今天天气不错')).toEqual([]);
    expect(qualitativeKeywordsFromNote(undefined)).toEqual([]);
  });

  it('en 定性词命中 (renting / already have)', () => {
    const words = qualitativeKeywordsFromNote('I am renting one, already have a thermos');
    expect(words.join(' ').toLowerCase()).toMatch(/rent|already/);
  });
});

describe('parseGreenAltRetroEvent', () => {
  it('payload → 行形状 → 解析 roundtrip 保留 reason/note/keywords', () => {
    const payload = buildGreenAltRetroEventPayload({
      entryId: 'milk_tea',
      reason: 'freeform',
      note: '家里有, 省事',
      now: NOW,
    })!;
    const parsed = parseGreenAltRetroEvent({ triggerId: payload.triggerId, metadata: payload.metadata, createdAt: NOW.toISOString() });
    expect(parsed).toMatchObject({ entryId: 'milk_tea', category: 'food', reason: 'freeform', note: '家里有, 省事' });
    expect(parsed!.atMs).toBe(NOW.getTime());
  });

  it('source 不符/非法 reason/坏时间戳 → null (静默跳过)', () => {
    expect(parseGreenAltRetroEvent({ metadata: { source: 'green_alt_rejection', entryId: 'milk_tea', reason: 'already_have' }, createdAt: NOW.toISOString() })).toBeNull();
    expect(parseGreenAltRetroEvent({ metadata: { source: 'green_alt_retro', entryId: 'milk_tea', reason: 'bogus' }, createdAt: NOW.toISOString() })).toBeNull();
    expect(parseGreenAltRetroEvent({ metadata: { source: 'green_alt_retro', entryId: 'milk_tea', reason: 'try_once' }, createdAt: 'not-a-date' })).toBeNull();
    expect(parseGreenAltRetroEvent(null)).toBeNull();
  });
});

describe('retroReasonToPreferenceReason — 只读映射进既有偏好词表', () => {
  it('already_have → already_have; rent_borrow → wrong_channel', () => {
    expect(retroReasonToPreferenceReason('already_have')).toBe('already_have');
    expect(retroReasonToPreferenceReason('rent_borrow')).toBe('wrong_channel');
  });

  it('try_once / reduce_idle / freeform 不映射 (不产冷却, 只进定性行)', () => {
    expect(retroReasonToPreferenceReason('try_once')).toBeNull();
    expect(retroReasonToPreferenceReason('reduce_idle')).toBeNull();
    expect(retroReasonToPreferenceReason('freeform')).toBeNull();
  });
});

describe('词表形状', () => {
  it('4 个非羞辱选项, 顺序固定, 收类型守卫保护', () => {
    expect(GREEN_ALT_RETRO_OPTIONS).toEqual(['already_have', 'rent_borrow', 'try_once', 'reduce_idle']);
    expect(isGreenAltRetroOptionId('already_have')).toBe(true);
    expect(isGreenAltRetroOptionId('freeform')).toBe(false);
    expect(isGreenAltRetroOptionId(42)).toBe(false);
  });
});
