/**
 * Tests for challenge-rules.ts — getChallengeType, getChallengeTypeLabel, getChallengeTypeI18nKey
 *
 * 🔧 ARCH fix (Round 58): 测试基础设施 — vitest + 5 个核心 helper 测试
 */

import { describe, it, expect } from 'vitest';
import {
  getChallengeType,
  getChallengeTypeLabel,
  getChallengeTypeLabelByAmount,
  getChallengeTypeI18nKey,
  CHALLENGE_THRESHOLDS,
} from '@/lib/challenge-rules';

describe('getChallengeType', () => {
  it('returns quick_pass for amount ≤ 30', () => {
    expect(getChallengeType(1)).toBe('quick_pass');
    expect(getChallengeType(30)).toBe('quick_pass');
  });

  it('returns standard for 31-200', () => {
    expect(getChallengeType(31)).toBe('standard');
    expect(getChallengeType(100)).toBe('standard');
    expect(getChallengeType(200)).toBe('standard');
  });

  it('returns boss for > 200', () => {
    expect(getChallengeType(201)).toBe('boss');
    expect(getChallengeType(1000)).toBe('boss');
  });

  it('returns quick_pass for NaN (defensive)', () => {
    expect(getChallengeType(NaN)).toBe('quick_pass');
  });

  it('returns quick_pass for negative (defensive)', () => {
    expect(getChallengeType(-100)).toBe('quick_pass');
  });

  it('returns quick_pass for 0 (defensive)', () => {
    expect(getChallengeType(0)).toBe('quick_pass');
  });

  it('returns quick_pass for Infinity (defensive)', () => {
    expect(getChallengeType(Infinity)).toBe('quick_pass');
  });
});

describe('getChallengeTypeLabel', () => {
  it('returns correct labels', () => {
    expect(getChallengeTypeLabel('quick_pass')).toBe('Quick Pass');
    expect(getChallengeTypeLabel('standard')).toBe('Standard');
    expect(getChallengeTypeLabel('boss')).toBe('Boss');
  });
});

describe('getChallengeTypeLabelByAmount', () => {
  it('returns correct labels by amount', () => {
    expect(getChallengeTypeLabelByAmount(10)).toBe('Quick Pass');
    expect(getChallengeTypeLabelByAmount(100)).toBe('Standard');
    expect(getChallengeTypeLabelByAmount(500)).toBe('Boss');
  });
});

describe('getChallengeTypeI18nKey', () => {
  it('returns correct i18n key suffixes', () => {
    expect(getChallengeTypeI18nKey(10)).toBe('quickPass');
    expect(getChallengeTypeI18nKey(100)).toBe('standard');
    expect(getChallengeTypeI18nKey(500)).toBe('boss');
  });
});

describe('CHALLENGE_THRESHOLDS', () => {
  it('has correct threshold values', () => {
    expect(CHALLENGE_THRESHOLDS.QUICK_PASS_MAX).toBe(30);
    expect(CHALLENGE_THRESHOLDS.STANDARD_MAX).toBe(200);
  });
});
