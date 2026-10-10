import { describe, it, expect } from 'vitest';
import { suggestAlternative } from '../green-alternatives';

/**
 * 🔒 词表顺序纪律守卫 (2026-09-30, phone_case 子串误伤修复后的系统性验证)
 *
 * 背景: trigger 用 includes 子串匹配, 短 trigger(如裸「礼物」)会被长 query
 * (如「手工礼物」)误含。防线 = GREEN_ALTERNATIVES 数组顺序「更具体在前」。
 * 手机壳事故(refurb_gadget 裸「手机」⊂「手机壳」)是唯一漏网 — electronics
 * 域排最后且前面没有 phone_case 条目。
 *
 * 本守卫: 对全部已知的「短trigger ⊂ 长trigger」对做实命中断言, 加新词条若
 * 破坏顺序纪律(短 trigger 的条目排在长 trigger 条目之前且不同 id)会在此红。
 * 词表再新增子串对时, 在 CASES 里补一行。
 */
const CASES: Array<[string, string]> = [
  ['浇水壶', 'garden_tools_borrow'],          // 「浇水」⊂「浇水壶」— 顺序保护
  ['差点忘了买礼物', 'holiday_gift_cooldown'], // 「买礼物」「礼物」⊂
  ['圣诞礼物', 'holiday_gift_cooldown'],
  ['手工礼物', 'handmade_gift'],
  ['礼物包装', 'wrap_less_gift'],
  ['衣柜里没衣服', 'capsule_wardrobe'],        // 「衣柜」⊂
  ['外卖打包盒', 'single_use_plastic'],        // 「外卖」⊂
  ['新手宠物玩具', 'pet_toy_single_start'],    // 「宠物玩具」⊂
  ['第一次买猫玩具', 'pet_toy_single_start'],
  ['我想买个手机壳', 'phone_case'],            // 手机壳事故回归锚
  ['我想换手机', 'refurb_gadget'],             // 收窄后正常路径
];

describe('green-alt 词表顺序纪律守卫 (子串错配防护)', () => {
  it.each(CASES)('%s → 命中 %s (更具体条目在前保护)', (query, expectedId) => {
    const r = suggestAlternative(query, 'zh');
    expect(r?.id).toBe(expectedId);
  });

});

describe('suggestAlternative 输入与输出契约', () => {
  it('空/异常输入一律 null (不抛)', () => {
    expect(suggestAlternative('', 'zh')).toBeNull();
    expect(suggestAlternative('   ', 'zh')).toBeNull();
    expect(suggestAlternative(null as never, 'zh')).toBeNull();
    expect(suggestAlternative(undefined as never, 'zh')).toBeNull();
  });

  it('en locale → en 文案 (同条目双语出口)', () => {
    const zh = suggestAlternative('我想买个手机壳', 'zh');
    const en = suggestAlternative('我想买个手机壳', 'en');
    expect(zh?.id).toBe('phone_case');
    expect(en?.id).toBe('phone_case');
    // en 出口文案与 zh 不同 (双语分轨)
    if (zh && en) expect(en.message).not.toBe(zh.message); // en 拼接含空格, zh 无
  });

  it('normalizeQuery: 大小写+多空格归一后命中', () => {
    // en trigger 小写化匹配 — 大写 query 应命中
    const r = suggestAlternative('I Want To Buy A PHONE CASE', 'en');
    expect(r).not.toBeNull();
  });

  it('未命中品类 → null', () => {
    expect(suggestAlternative('今天天气真好啊', 'zh')).toBeNull();
  });
});
