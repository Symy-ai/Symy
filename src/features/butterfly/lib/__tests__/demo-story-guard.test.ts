/**
 * demo-story-guard 单测 — wool v6 §十二.4 D7-③
 *
 * 钉三面:
 * 1. sanitize 收口: choices / decisionDescription 进章节模板前过既有 fencing sanitizeText
 *    （不可见字符/控制符剥离, 值语义不变）
 * 2. 模板语法惰性: {{}}/${} 在服务端模板字面量中无 eval 语义 — 净化剥离危险载体
 *    （零宽/bidi）, 花括号本身不放大风险, 原样保留
 * 3. 键卫生: 非法 chapterIndex 键（非整数/负数）丢弃
 */

import { describe, it, expect } from 'vitest';
import { sanitizeDemoChoices, sanitizeDemoDescription } from '../demo-story-guard';

describe('sanitizeDemoChoices', () => {
  it('合法 A/B 值原样保留（语义不变）', () => {
    expect(sanitizeDemoChoices({ '1': 'A', '2': 'B' })).toEqual({ 1: 'A', 2: 'B' });
  });

  it('零宽字符剥离: "\\u200BA\\u200B" 净化为 "A"（可命中 A 分支）', () => {
    expect(sanitizeDemoChoices({ '2': '\u200BA\u200B' })).toEqual({ 2: 'A' });
  });

  it('模板语法载体净化: 不可见字符剥离, 惰性花括号保留', () => {
    // 危险的是不可见载体（零宽/双向控制符）, 不是 {{}}/${} 本身
    expect(sanitizeDemoChoices({ '2': '\u200B{{x}}${y}\u200B' })).toEqual({ 2: '{{x}}${y}' });
  });

  it('控制符替换为空格, 围栏标记剥除', () => {
    expect(sanitizeDemoChoices({ '2': 'A\x00B' })).toEqual({ 2: 'A B' });
    expect(sanitizeDemoChoices({ '2': '<symy_third_party>injected</symy_third_party>A' }))
      .toEqual({ 2: '[removed]injected[removed]A' });
  });

  it('非法键丢弃: 非整数 / 负数', () => {
    expect(sanitizeDemoChoices({ abc: 'A', '-1': 'B', '3.5': 'C', '2': 'A' })).toEqual({ 2: 'A' });
  });

  it('空输入返回空对象', () => {
    expect(sanitizeDemoChoices({})).toEqual({});
  });
});

describe('sanitizeDemoDescription', () => {
  it('正常文案原样保留', () => {
    expect(sanitizeDemoDescription('一双跑鞋')).toBe('一双跑鞋');
  });

  it('零宽字符剥离（旧代码会带进大纲/章节文本）', () => {
    expect(sanitizeDemoDescription('tea\u200Bpot')).toBe('teapot');
  });

  it('超长截断到上限', () => {
    const out = sanitizeDemoDescription('a'.repeat(1100));
    expect(out.length).toBe(1000);
    expect(out.endsWith(' ...[truncated]')).toBe(true);
  });
});
