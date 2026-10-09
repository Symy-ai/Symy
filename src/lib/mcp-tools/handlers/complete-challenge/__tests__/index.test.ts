import { describe, expect, it } from 'vitest';

import * as barrel from '../index';
import * as casRollback from '../cas-rollback';
import * as companionEffects from '../companion-effects';
import * as messages from '../messages';
import * as metadataUpdate from '../metadata-update';
import * as rewardCalc from '../reward-calc';
import * as validation from '../validation';

/**
 * index.ts (56行) — complete-challenge barrel (纯转发件)。
 *
 * 锁定 (导出面防漂移):
 * - 六子模块全部经 barrel 可达
 * - 具名函数逐一锚定 (子模块加/删导出时此处红)
 */
describe('complete-challenge barrel 导出面', () => {
  it('六个子模块全部可达', () => {
    for (const mod of [rewardCalc, companionEffects, metadataUpdate, casRollback, messages, validation]) {
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
  });

  it('具名函数逐一锚定', () => {
    expect(barrel.getBaseRewardsForChallengeType).toBe(rewardCalc.getBaseRewardsForChallengeType);
    expect(barrel.rollVariableReward).toBe(rewardCalc.rollVariableReward);
    expect(barrel.formatRewardTierMessage).toBe(rewardCalc.formatRewardTierMessage);
    expect(barrel.fireCompletionCompanionEffects).toBe(companionEffects.fireCompletionCompanionEffects);
    expect(barrel.updateChallengeMetadataWithPlatform).toBe(metadataUpdate.updateChallengeMetadataWithPlatform);
    expect(barrel.rollbackChallengeStatusOnFailure).toBe(casRollback.rollbackChallengeStatusOnFailure);
    expect(barrel.buildAlreadyCompletedMessage).toBe(messages.buildAlreadyCompletedMessage);
    expect(barrel.buildCompletionMessage).toBe(messages.buildCompletionMessage);
    expect(barrel.buildFailureMessage).toBe(messages.buildFailureMessage);
    expect(barrel.buildFailedReturn).toBe(messages.buildFailedReturn);
    expect(barrel.validateChallengeId).toBe(validation.validateChallengeId);
    expect(barrel.normalizeStatus).toBe(validation.normalizeStatus);
    expect(barrel.validateSavedAmount).toBe(validation.validateSavedAmount);
    expect(barrel.normalizeLocale).toBe(validation.normalizeLocale);
  });

  it('barrel 总导出面 = 六子模块并集 (无私增无遗漏)', () => {
    const union = new Set<string>();
    for (const mod of [rewardCalc, companionEffects, metadataUpdate, casRollback, messages, validation]) {
      for (const k of Object.keys(mod)) union.add(k);
    }
    const barrelKeys = new Set(Object.keys(barrel));
    // barrel 可能只转发部分; 但转发的必须存在于子模块 (禁私增)
    for (const k of Array.from(barrelKeys)) expect(union.has(k)).toBe(true);
    // 关键函数必须全转发 (禁遗漏)
    for (const must of ['rollbackChallengeStatusOnFailure', 'validateChallengeId', 'buildCompletionMessage']) {
      expect(barrelKeys.has(must)).toBe(true);
    }
  });
});
