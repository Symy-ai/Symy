/**
 * batch60-b — push preferences 纯库单测
 *
 * 锁三件事:
 * 1. normalizePushPreferences 对脏/缺/旧形状数据宽容落默认 (cron 读坏行不崩不误发)
 * 2. 通道 × 频率过滤矩阵逐格锁死 — 事件通道 (dreamFund/challenge) 豁免频率但必须受开关控制,
 *    日常通道 (dailyAlgorithm/missYou) 仅 daily 发, weeklyGuardian off 不发
 * 3. 写入面 strict — 未知字段 (含 endpoint/keys) 拒绝
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  isPushChannelEnabled,
  pushPreferencesSchema,
  type PushChannel,
} from '../preferences';

describe('normalizePushPreferences', () => {
  it('returns full defaults for null / junk shapes (never crashes a cron)', () => {
    for (const raw of [null, undefined, 'daily', 42, [], { frequency: 'hourly' }, { missYou: 'yes' }]) {
      expect(normalizePushPreferences(raw)).toEqual({
        missYou: true,
        dreamFund: true,
        challenge: true,
        weeklyGuardian: true,
        dailyAlgorithm: true,
        frequency: 'daily',
      });
    }
  });

  it('merges stored partial JSON over defaults (legacy rows without weeklyGuardian)', () => {
    expect(normalizePushPreferences({ missYou: false, frequency: 'weekly' })).toEqual({
      missYou: false,
      dreamFund: true,
      challenge: true,
      weeklyGuardian: true,
      dailyAlgorithm: true,
      frequency: 'weekly',
    });
  });

  it('keeps the legacy dailyAlgorithm:false defense key honored', () => {
    expect(normalizePushPreferences({ dailyAlgorithm: false }).dailyAlgorithm).toBe(false);
  });
});

describe('isPushChannelEnabled — 通道 × 频率矩阵', () => {
  const on: PushChannel[] = ['dailyAlgorithm', 'missYou', 'dreamFund', 'challenge', 'weeklyGuardian'];

  it('defaults: every channel enabled at frequency daily', () => {
    for (const channel of on) {
      expect(isPushChannelEnabled(DEFAULT_PUSH_PREFERENCES, channel)).toBe(true);
    }
  });

  it('frequency off: routine channels silent, event channels still follow their toggle', () => {
    const prefs = { ...DEFAULT_PUSH_PREFERENCES, frequency: 'off' as const };
    expect(isPushChannelEnabled(prefs, 'dailyAlgorithm')).toBe(false);
    expect(isPushChannelEnabled(prefs, 'missYou')).toBe(false);
    expect(isPushChannelEnabled(prefs, 'weeklyGuardian')).toBe(false);
    expect(isPushChannelEnabled(prefs, 'dreamFund')).toBe(true);
    expect(isPushChannelEnabled(prefs, 'challenge')).toBe(true);
  });

  it('frequency weekly: daily channels silent, weekly guardian still sends (legacy-safe)', () => {
    const prefs = { ...DEFAULT_PUSH_PREFERENCES, frequency: 'weekly' as const };
    expect(isPushChannelEnabled(prefs, 'dailyAlgorithm')).toBe(false);
    expect(isPushChannelEnabled(prefs, 'missYou')).toBe(false);
    expect(isPushChannelEnabled(prefs, 'weeklyGuardian')).toBe(true);
  });

  it('event channels are never blocked by frequency — challenge must not be mis-gated by daily pacing', () => {
    for (const frequency of ['daily', 'weekly', 'off'] as const) {
      const prefs = { ...DEFAULT_PUSH_PREFERENCES, frequency };
      expect(isPushChannelEnabled(prefs, 'challenge')).toBe(true);
      expect(isPushChannelEnabled(prefs, 'dreamFund')).toBe(true);
    }
  });

  it('every type toggle kills its own channel regardless of frequency', () => {
    const cases: Array<[PushChannel, boolean]> = [
      ['missYou', false],
      ['dreamFund', false],
      ['challenge', false],
      ['weeklyGuardian', false],
      ['dailyAlgorithm', false],
    ];
    for (const [channel, toggle] of cases) {
      const key = channel === 'challenge' ? 'challenge' : channel;
      for (const frequency of ['daily', 'weekly', 'off'] as const) {
        const prefs = normalizePushPreferences({ [key]: toggle, frequency });
        expect(isPushChannelEnabled(prefs, channel), `${channel}@${frequency}`).toBe(false);
      }
    }
  });
});

describe('pushPreferencesSchema — 写入面', () => {
  it('accepts partial patches and empty objects', () => {
    expect(pushPreferencesSchema.safeParse({}).success).toBe(true);
    expect(pushPreferencesSchema.safeParse({ missYou: false, frequency: 'weekly' }).success).toBe(true);
  });

  it('rejects unknown fields — endpoint/keys are not writable through preferences', () => {
    expect(pushPreferencesSchema.safeParse({ endpoint: 'https://push.example/1' }).success).toBe(false);
    expect(pushPreferencesSchema.safeParse({ keys: { p256dh: 'k', auth: 'a' } }).success).toBe(false);
    expect(pushPreferencesSchema.safeParse({ user_id: 'someone-else' }).success).toBe(false);
    expect(pushPreferencesSchema.safeParse({ frequency: 'hourly' }).success).toBe(false);
  });
});
