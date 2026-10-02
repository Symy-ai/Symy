// reflection-detector — 反思问题检测行为锁（此前 0 测试）
// 精确匹配 SSOT 清单; canned reply 走 elephant-tone SSOT。
import { describe, expect, it } from 'vitest';
import { isReflectionQuestion, getReflectionCannedReply } from '../reflection-detector';
import { ALL_REFLECTION_QUESTIONS } from '@/components/chat/parts/reflection-questions';

describe('isReflectionQuestion — 精确匹配', () => {
  it('SSOT 清单原文命中', () => {
    const sample = ALL_REFLECTION_QUESTIONS[0];
    expect(typeof sample).toBe('string');
    expect(isReflectionQuestion(sample)).toBe(true);
  });

  it('trim 后命中 (组件发送时可能带空白)', () => {
    const sample = ALL_REFLECTION_QUESTIONS[0];
    expect(isReflectionQuestion(`  ${sample}  `)).toBe(true);
  });

  it('近似但不相等的文本不命中 (精确匹配红线)', () => {
    const sample = ALL_REFLECTION_QUESTIONS[0];
    expect(isReflectionQuestion(`${sample}吗`)).toBe(false);
    expect(isReflectionQuestion(`${sample}??`)).toBe(false);
  });

  it('空输入安全', () => {
    expect(isReflectionQuestion('')).toBe(false);
    expect(isReflectionQuestion('   ')).toBe(false);
  });

  it('普通购物消息不命中', () => {
    expect(isReflectionQuestion('我想买台空气炸锅')).toBe(false);
  });
});

describe('getReflectionCannedReply — 小象语气', () => {
  it('zh 返回非空文案', () => {
    const zh = getReflectionCannedReply('zh');
    expect(typeof zh).toBe('string');
    expect(zh.length).toBeGreaterThan(4);
  });

  it('en 返回非空文案且与 zh 走各自 locale', () => {
    const en = getReflectionCannedReply('en');
    expect(typeof en).toBe('string');
    expect(en.length).toBeGreaterThan(4);
  });
});
