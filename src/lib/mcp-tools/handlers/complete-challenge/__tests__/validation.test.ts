import { describe, expect, it } from 'vitest';

import {
  normalizeLocale,
  normalizeStatus,
  validateChallengeId,
  validateSavedAmount,
} from '../validation';

/**
 * validation.ts (100行) — complete_challenge 输入校验 (P1-6/P1-7/P2-13 修复件)。
 *
 * 锁定:
 * - P1-6: challenge_id UUID 校验 (数字/对象 → 明确报错, 非 Postgres 误导性 not found)
 * - P1-7: status 大小写/空白归一 (REWARD-FARMING 向量封堵); 未知串默认 passed
 * - P2-13: saved_amount 双模式正数校验 (NaN/0/负 → throw)
 * - P2-12: locale 变体归一 (zh-CN/en-US → zh/en)
 */
describe('validateChallengeId (P1-6)', () => {
  it('合法 UUID 通过 (含放宽格式 hex 版本位)', () => {
    expect(validateChallengeId('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(validateChallengeId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('空值 → undefined (合法缺省)', () => {
    expect(validateChallengeId(undefined)).toBeUndefined();
    expect(validateChallengeId(null)).toBeUndefined();
    expect(validateChallengeId('')).toBeUndefined();
  });

  it('数字/对象/非 UUID → 明确 throw (非误导 not found)', () => {
    expect(() => validateChallengeId(12345)).toThrow(/must be a UUID/);
    expect(() => validateChallengeId({ id: 'x' })).toThrow(/must be a UUID.*object/i);
    expect(() => validateChallengeId('not-a-uuid')).toThrow(/must be a UUID/);
  });
});

describe('normalizeStatus (P1-7 reward-farming 封堵)', () => {
  it('大小写/空白归一: FAILED/Failed/"failed " → failed', () => {
    expect(normalizeStatus('FAILED')).toBe('failed');
    expect(normalizeStatus('Failed')).toBe('failed');
    expect(normalizeStatus('failed ')).toBe('failed');
    expect(normalizeStatus('PASSED')).toBe('passed');
  });

  it('非字符串/缺失 → passed 默认', () => {
    expect(normalizeStatus(undefined)).toBe('passed');
    expect(normalizeStatus(123)).toBe('passed');
  });

  it('未知串 (success/complete) → 宽容默认 passed', () => {
    expect(normalizeStatus('success')).toBe('passed');
    expect(normalizeStatus('complete')).toBe('passed');
  });
});

describe('validateSavedAmount (P2-13)', () => {
  it('正数通过 (数字/数字串)', () => {
    expect(validateSavedAmount(89.5, 'args')).toBe(89.5);
    expect(validateSavedAmount('50', 'db')).toBe(50);
  });

  it('NaN/0/负/null → throw 带 source', () => {
    expect(() => validateSavedAmount(NaN, 'args')).toThrow(/received NaN from args/);
    expect(() => validateSavedAmount(0, 'db')).toThrow(/received 0 from db/);
    expect(() => validateSavedAmount(-5, 'args')).toThrow(/received -5 from args/);
    expect(() => validateSavedAmount(null, 'db')).toThrow(/received null from db/);
  });
});

describe('normalizeLocale (P2-12)', () => {
  it('变体归一: zh-CN/zh-Hans/en-US → zh/en', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('zh-Hans')).toBe('zh');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('EN')).toBe('en');
  });

  it('非 zh/en → undefined (回退 DB 查询)', () => {
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
    expect(normalizeLocale(123)).toBeUndefined();
  });
});
