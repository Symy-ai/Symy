/**
 * green-alt-retro-gate 测试 — 复盘让位检测 (batch68-a)
 *
 * 验收 #3: 新购买意图、数据问句、紧急情绪消息不触发复盘追问。
 * 让位 = shouldDeferGreenAltRetro → true; 轻量对话/回答语义 → false。
 */

import { describe, expect, it } from 'vitest';
import { shouldDeferGreenAltRetro } from '../green-alt-retro-gate';

describe('shouldDeferGreenAltRetro — 让位词面 (验收 #3)', () => {
  it('新购买意图让位 (zh/en)', () => {
    expect(shouldDeferGreenAltRetro('想买一个新的水杯', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('要不要再买一瓶', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('I want to buy a new bottle', 'en')).toBe(true);
    expect(shouldDeferGreenAltRetro('looking for a gift for my mom', 'en')).toBe(true);
  });

  it('数据问句让位 — 问账/分类/时段/预报/追问跟随五族', () => {
    expect(shouldDeferGreenAltRetro('我这个月省了多少', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('这个月奶茶拦截了几次', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('我晚上冲动买的多吗', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('下周容易冲动吗', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('how much have I saved this month', 'en')).toBe(true);
  });

  it('数据问句让位 — 守护脉搏第六族 (batch70-a: pending 恰遇脉搏问句不抢话)', () => {
    expect(shouldDeferGreenAltRetro('我什么时候最容易冲动', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('我几点最容易破防', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('what time of day am i most impulsive', 'en')).toBe(true);
    expect(shouldDeferGreenAltRetro('my weakest shopping hour', 'en')).toBe(true);
  });

  it('紧急求助让位', () => {
    expect(shouldDeferGreenAltRetro('手机屏幕碎了急用，怎么办', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('今晚就要，帮帮我', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('I need it right now, urgent!', 'en')).toBe(true);
  });

  it('绿色替代再请求让位 (新推荐轮优先, 不与追问抢话)', () => {
    expect(shouldDeferGreenAltRetro('奶茶还有什么替代', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('帮我看看耳机有没有绿色替代', 'zh')).toBe(true);
  });

  it('轻量对话/回答语义不让位 (触发复盘)', () => {
    expect(shouldDeferGreenAltRetro('哈哈确实', 'zh')).toBe(false);
    expect(shouldDeferGreenAltRetro('今天不错', 'zh')).toBe(false);
    expect(shouldDeferGreenAltRetro('手头正好有一个', 'zh')).toBe(false);
    expect(shouldDeferGreenAltRetro('just felt right, you know', 'en')).toBe(false);
    expect(shouldDeferGreenAltRetro('thanks!', 'en')).toBe(false);
  });

  it('空白/非字符串恒让位 (不问)', () => {
    expect(shouldDeferGreenAltRetro('', 'zh')).toBe(true);
    expect(shouldDeferGreenAltRetro('   ', 'en')).toBe(true);
  });
});
