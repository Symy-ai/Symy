import { describe, expect, it } from 'vitest';
import { isGatedFeedEntry, isQaTestData } from '../content-gate';

describe('isQaTestData — QA/TEST 编号条目判定', () => {
  it('flags the QA138 regression entries leaking into the community feed', () => {
    expect(isQaTestData('QA138-GRANT后UI提交验证')).toBe(true);
    expect(isQaTestData('QA138-GRANT验证-直插')).toBe(true);
  });

  it('flags prefix pattern with optional number + separator (QA/TEST/测试)', () => {
    expect(isQaTestData('TEST_02 add flow')).toBe(true);
    expect(isQaTestData('test-3 should not render')).toBe(true);
    expect(isQaTestData('测试-不要显示这条')).toBe(true);
    expect(isQaTestData('测试 5 内容')).toBe(true);
  });

  it('flags embedded numbered ids like "验证 QA138 直插"', () => {
    expect(isQaTestData('验证 QA138 直插流程')).toBe(true);
    expect(isQaTestData('regression TEST456 checkout')).toBe(true);
  });

  it('keeps normal reflections visible (no false positives)', () => {
    expect(isQaTestData('今天没有冲动消费，安静的一周')).toBe(false);
    expect(isQaTestData('Testing my new morning routine — it stuck!')).toBe(false);
    expect(isQaTestData('I passed my driving test 3 years ago')).toBe(false);
    expect(isQaTestData('qa quality time with family')).toBe(false);
    expect(isQaTestData('')).toBe(false);
  });

  it('is null/whitespace safe', () => {
    expect(isQaTestData(null as unknown as string)).toBe(false);
    expect(isQaTestData('   ')).toBe(false);
  });
});

describe('isGatedFeedEntry — 多字段文案统一过 gate', () => {
  it('gates when any field hits', () => {
    expect(isGatedFeedEntry(['安静的一周', 'QA138-GRANT验证-直插'])).toBe(true);
    expect(isGatedFeedEntry(['安静的一周', 'still quiet'])).toBe(false);
  });

  it('tolerates null/undefined fields', () => {
    expect(isGatedFeedEntry([null, undefined, 'normal text'])).toBe(false);
    expect(isGatedFeedEntry([null, 'QA12-seed sanity'])).toBe(true);
  });
});
