import { describe, expect, it } from 'vitest';

import {
  buildAlreadyCompletedMessage,
  buildCompletionMessage,
  buildFailedReturn,
  buildFailureMessage,
} from '../messages';

/**
 * messages.ts (157行) — complete_challenge 消息构造 (P0-3 归一 + 5x 去重提取件)。
 *
 * 锁定:
 * - already-completed: 庆祝再回应指令 + 禁技术黑话 (PM-NEW-2)
 * - completion: reward tier 后缀 + boss 徽章 + atomic 存款提示
 * - failure: record_impulse 规范序列指引
 * - buildFailedReturn: P0-3 双路径同形状 (message 只在顶层)
 */
describe('complete-challenge messages', () => {
  it('already-completed: 金额嵌入 + 庆祝再回应 + 禁技术黑话', () => {
    const msg = buildAlreadyCompletedMessage({ challengeType: 'impulse', savedAmount: 89 });
    expect(msg).toContain('already completed');
    expect(msg).toContain('saved $89');
    expect(msg).toContain('celebrating again');
    expect(msg).toContain('NEVER use technical or engineering slang');
    // context 不进消息 (仅 operator 日志)
    const withCtx = buildAlreadyCompletedMessage({ challengeType: 'impulse', savedAmount: 89, context: 'cas_failed' });
    expect(withCtx).not.toContain('cas_failed');
    expect(withCtx).toBe(msg);
  });

  it('completion: 四奖励数字 + itemName 后缀 + atomic 存款提示', () => {
    const msg = buildCompletionMessage({
      challengeType: 'impulse', savedAmount: 120, itemName: '机械键盘',
      tokenReward: 30, vitalityReward: 5, xpReward: 40,
      rewardTier: 'item' as never, isAtomicPath: true,
    });
    expect(msg).toContain('saved $120 (机械键盘)');
    expect(msg).toContain('earned 30 tokens, +5 vitality, +40 XP');
    expect(msg).toContain('deposit the $120 into their Dream Fund');
  });

  it('completion: 非 atomic 无存款提示; boss 徽章后缀', () => {
    const noAtomic = buildCompletionMessage({
      challengeType: 'impulse', savedAmount: 10, itemName: undefined,
      tokenReward: 5, vitalityReward: 1, xpReward: 5,
      rewardTier: 'basic' as never, isAtomicPath: false,
    });
    expect(noAtomic).not.toContain('Dream Fund');
    const boss = buildCompletionMessage({
      challengeType: 'boss', savedAmount: 800, itemName: 'x',
      tokenReward: 100, vitalityReward: 20, xpReward: 100,
      rewardTier: 'golden' as never, isAtomicPath: false,
    });
    expect(boss).toContain('Badge: boss_slayer!');
  });

  it('failure: record_impulse 规范序列 + item 兜底', () => {
    expect(buildFailureMessage('手机', 999)).toContain('user bought 手机 ($999)');
    expect(buildFailureMessage('手机', 999)).toContain('Please call record_impulse');
    expect(buildFailureMessage(undefined, 50)).toContain('user bought item ($50)');
  });

  it('buildFailedReturn: P0-3 归一形状 (message 仅顶层 + result 七字段)', () => {
    const ret = buildFailedReturn({
      toolCallId: 'tc-1', challengeId: 'ch-9', challengeType: 'impulse',
      savedAmount: 66, itemName: '耳机', healthEventCreated: true, atomic: false,
    });
    expect(ret).toMatchObject({
      toolCallId: 'tc-1',
      name: 'complete_challenge',
      success: true,
      message: expect.stringContaining('record_impulse'),
    });
    expect(ret.result).toEqual({
      challengeId: 'ch-9',
      challengeType: 'impulse',
      savedAmount: 66,
      itemName: '耳机',
      status: 'failed',
      rewardApplied: false,
      healthEventCreated: true,
      atomic: false,
    });
    // P0-3 红线: result 内无 message (老 typo 已修)
    expect('message' in ret.result).toBe(false);
  });

  it('buildFailedReturn: healthEventCreated/atomic 双态透传 (Issue 5 真值)', () => {
    const ret = buildFailedReturn({
      toolCallId: 't', challengeId: 'c', challengeType: 'impulse',
      savedAmount: 1, itemName: undefined, healthEventCreated: false, atomic: true,
    });
    expect(ret.result.healthEventCreated).toBe(false);
    expect(ret.result.atomic).toBe(true);
  });
});
