import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/butterfly/lib/engine', () => ({
  // 透传原文 (前缀锚 kind) — 内容断言可进
  buildButterflyAgentMessage: (kind: string, sys: string, user: string) => `[${kind}]${sys}
---
${user}`,
}));

import { buildCompleteStoryProsePrompt } from '../complete-story-prompt';

/**
 * complete-story-prompt.ts (84行) — 一次成 3 章散文故事 prompt (streaming fix)。
 *
 * 锁定:
 * - 决策三分支文案 (bought/resisted/considering+预购注记)
 * - locale=zh → 中文语言指令; 缺省英文
 * - 分隔符协议锚 (===CHAPTER N===/===BUTTERFLY EFFECT===)
 * - amount 格式化 ($x.xx); 可选字段条件展开
 */
describe('buildCompleteStoryProsePrompt', () => {
  it('决策三分支文案', () => {
    const bought = buildCompleteStoryProsePrompt('bought', 'a phone');
    expect(bought).toContain('DECIDED TO BUY: "a phone"');
    const resisted = buildCompleteStoryProsePrompt('resisted', 'sneakers');
    expect(resisted).toContain('DECIDED NOT TO BUY: "sneakers"');
    const considering = buildCompleteStoryProsePrompt('considering', 'laptop');
    expect(considering).toContain('CONSIDERING BUYING');
    expect(considering).toContain('PRE-PURCHASE reflection'); // considering 专属注记
    expect(bought).not.toContain('PRE-PURCHASE'); // 其他分支无
  });

  it('locale=zh → 中文指令; 缺省英文', () => {
    expect(buildCompleteStoryProsePrompt('bought', 'x', 1, 'p', 'c', 'zh')).toContain('Chinese (Simplified)');
    expect(buildCompleteStoryProsePrompt('bought', 'x')).toContain('Write the ENTIRE story in **English**');
  });

  it('分隔符协议锚 (三章+蝴蝶效应)', () => {
    const p = buildCompleteStoryProsePrompt('bought', 'x');
    expect(p).toContain('===CHAPTER 1: [Short Title]===');
    expect(p).toContain('===CHAPTER 3');
    expect(p).toContain('===BUTTERFLY EFFECT===');
    expect(p).toContain('exactly 3 = signs'); // 协议刚性说明
  });

  it('amount 格式化+可选字段条件展开', () => {
    const full = buildCompleteStoryProsePrompt('bought', 'x', 129.5, 'taobao', 'birthday soon');
    expect(full).toContain('Amount: $129.50'); // toFixed(2)
    expect(full).toContain('Platform: taobao');
    expect(full).toContain('Context: birthday soon');
    const bare = buildCompleteStoryProsePrompt('bought', 'x');
    expect(bare).not.toContain('Amount:');
    expect(bare).not.toContain('Platform:');
    expect(bare).not.toContain('Context:');
  });

  it('经 buildButterflyAgentMessage 组装 (kind=chapter)', () => {
    const p = buildCompleteStoryProsePrompt('bought', 'x');
    expect(p).toMatch(/^\[chapter\]/); // 引擎封装 kind 前缀
  });
});
