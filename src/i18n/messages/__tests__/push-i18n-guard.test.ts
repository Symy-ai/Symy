import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

describe('push i18n symmetry', () => {
  it('keeps new dreamFund and dailyAlgorithm keys symmetric', () => {
    expect(Object.keys(zh.push.dreamFund)).toEqual(Object.keys(en.push.dreamFund));
    expect(Object.keys(zh.push.dailyAlgorithm).sort()).toEqual(Object.keys(en.push.dailyAlgorithm).sort());
  });

  it('keeps zh push copy free of amount wording (en legacy copy is exempt)', () => {
    expect(JSON.stringify({
      dreamFund: zh.push.dreamFund,
      dailyAlgorithm: zh.push.dailyAlgorithm,
    })).not.toMatch(/[¥$￥]|美元|元/);
  });
});
