import { describe, expect, it } from 'vitest';

import {
  generateFallbackOutline,
  parseChoiceFromLLM,
  parseCompleteStoryFromLLM,
  parseOutlineFromLLM,
  validateTone,
} from '../parsers';

/**
 * parsers.ts (305行) — LLM 输出解析器 + fallback (C6 拆分件, 纯函数)。
 *
 * 核心红线:
 * - JSON 提取双策略 (M5: 非贪心优先 + 贪心后备)
 * - LLM 前后缀噪声容忍
 * - hasChoice 只在第 2 章 (CHOICE_CHAPTER_INDICES=[2])
 * - 兜底三件套: outline/completeStory/choice 永不抛错
 * - considering → "imagined buying" (task 1)
 */

describe('parseOutlineFromLLM', () => {
  it('纯净 JSON: 章节映射+hasChoice 锁定第 2 章', () => {
    const out = parseOutlineFromLLM(
      JSON.stringify({ chapters: [{ index: 1, title: '一', summary: 's', tone: 'warm', timeSpan: '晚' }, { title: '二' }, { title: '三' }], endingHint: 'eh' }),
      'bought', '机械键盘',
    );
    expect(out.version).toBe(1);
    expect(out.chapters).toHaveLength(3);
    expect(out.chapters[0].hasChoice).toBe(false);
    expect(out.chapters[1].hasChoice).toBe(true); // CHOICE_CHAPTER_INDICES=[2]
    expect(out.chapters[2].hasChoice).toBe(false);
    expect(out.endingHint).toBe('eh');
  });

  it('LLM 前后缀噪声 (markdown 围栏+闲聊): 仍提取 JSON (M5 容忍)', () => {
    const noisy = '好的！这是大纲：\n```json\n' + JSON.stringify({ chapters: [{ title: 'A' }], endingHint: 'x' }) + '\n```\n以上仅供参考';
    const out = parseOutlineFromLLM(noisy, 'resisted', '奶茶');
    expect(out.chapters[0].title).toBe('A');
  });

  it('字段缺失降级: index 补位/title 默认/timeSpan 兜底/tone 无效回 neutral', () => {
    const out = parseOutlineFromLLM(JSON.stringify({ chapters: [{}, {}, {}] }), 'bought', 'd');
    expect(out.chapters[0].index).toBe(1);
    expect(out.chapters[1].index).toBe(2);
    expect(out.chapters[2].title).toBe('Chapter 3');
    expect(out.chapters[0].timeSpan).toBe('sometime later');
    expect(out.chapters[0].tone).toBe('neutral');
  });

  it('完全非 JSON → generateFallbackOutline 三章结构', () => {
    const out = parseOutlineFromLLM('抱歉我无法完成这个请求', 'bought', 'x');
    expect(out.chapters).toHaveLength(3);
    expect(out.chapters[0].title).toBe('The Moment of Decision');
    expect(out.chapters[1].hasChoice).toBe(true);
  });

  it('M5 非贪心 lookahead: 仅串尾 } 或 ``` 前生效; 两对象拼接串走贪心→无效→fallback', () => {
    // lazy 正则 (?=\s*$|\s*```): 第一个 } 不在串尾 → 不命中 → 贪心吃整块 → 无效 JSON → catch → fallback
    const out = parseOutlineFromLLM('{"noise": 1} {"chapters": [{"title": "真"}]}', 'bought', 'd');
    expect(out.chapters).toHaveLength(3); // fallback 三章
    expect(out.chapters[0].title).toBe('The Moment of Decision');
  });

  it('M5 非贪心真命中: 单对象在串尾 → 解析其空 chapters', () => {
    const out = parseOutlineFromLLM('说明文字 {"noise": 1}', 'bought', 'd');
    expect(out.chapters).toEqual([]);
    expect(out.endingHint).toBe('The future remains unwritten.');
  });

  it('M5 后备: 非贪心结果无效时贪心整块', () => {
    // '{broken' 开头 + 内嵌完整对象 → 非贪心匹配 {....} 到 '}' 截止可能无效 → 贪心救场
    const out = parseOutlineFromLLM('前缀 {"a": {"b": "x"}, "chapters": [{"title": "嵌"}], "endingHint": "z"} 后缀', 'bought', 'd');
    expect(out.chapters[0].title).toBe('嵌');
  });
});

describe('parseCompleteStoryFromLLM', () => {
  it('三章 JSON: chapters/butterflyEffect/finalTone 透传', () => {
    const out = parseCompleteStoryFromLLM(
      JSON.stringify({ chapters: [{ index: 1, title: '一', content: 'c1' }, { index: 2, title: '二', content: 'c2' }, { index: 3, title: '三', content: 'c3' }], butterflyEffect: '省了 50', finalTone: 'twist' }),
      'resisted', 'x',
    );
    expect(out.chapters).toHaveLength(3);
    expect(out.chapters[1].content).toBe('c2');
    expect(out.butterflyEffect).toBe('省了 50');
    expect(out.finalTone).toBe('twist');
  });

  it('非 JSON → fallback 三章 (chapter 2 hasChoice)', () => {
    const out = parseCompleteStoryFromLLM('garbage no json here', 'bought', 'd');
    expect(out.chapters).toHaveLength(3);
    // speed fix: fallback 完整故事纯线性三章, hasChoice 全 false
    expect(out.chapters.every((c) => !c.hasChoice)).toBe(true);
    expect(out.finalTone).toBeTruthy();
  });
});

describe('parseChoiceFromLLM', () => {
  it('JSON: prompt+options 透传, 缺 id 补 A/B/C', () => {
    const out = parseChoiceFromLLM(JSON.stringify({ prompt: '走哪条?', options: [{ label: '甲' }, { label: '乙' }] }));
    expect(out.prompt).toBe('走哪条?');
    expect(out.options[0].id).toBe('A');
    expect(out.options[1].id).toBe('B');
    expect(out.options[0].label).toBe('甲');
  });

  it('M13: 重复 id 去重保唯一', () => {
    const out = parseChoiceFromLLM(JSON.stringify({ prompt: 'p', options: [{ id: 'X', label: '1' }, { id: 'X', label: '2' }, { id: 'Y', label: '3' }] }));
    const ids = out.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('X');
  });

  it('非 JSON → 默认二元选择 (safe path / unknown path)', () => {
    const out = parseChoiceFromLLM('no braces at all');
    expect(out.prompt).toBe('Which path do you take?');
    expect(out.options).toHaveLength(2);
    expect(out.options[0].id).toBe('A');
  });
});

describe('validateTone + generateFallbackOutline', () => {
  it('validateTone: 合法 tone 透传, 非法回 neutral', () => {
    expect(validateTone('hopeful')).toBe('hopeful');
    expect(validateTone('dark')).toBe('dark');
    expect(validateTone('twist')).toBe('twist');
    expect(validateTone('neutral')).toBe('neutral');
    expect(validateTone('green')).toBe('neutral'); // 非法 (合法集不含)
    expect(validateTone('bogus')).toBe('neutral');
    expect(validateTone(undefined)).toBe('neutral');
    expect(validateTone(42)).toBe('neutral');
  });

  it('fallback outline: considering → "imagined buying" (task 1)', () => {
    const out = generateFallbackOutline('considering', '新手机');
    expect(out.chapters[0].summary).toContain('imagined buying');
    expect(out.chapters[0].summary).toContain('新手机');
  });

  it('fallback outline: bought/resisted 用原词', () => {
    expect(generateFallbackOutline('bought', 'x').chapters[0].summary).toContain('bought');
    expect(generateFallbackOutline('resisted', 'x').chapters[0].summary).toContain('resisted');
  });

  it('fallback outline: 三章标题+tone (章 2/3 twist)+第 2 章 hasChoice', () => {
    const out = generateFallbackOutline('bought', 'd');
    expect(out.chapters.map((c) => c.title)).toEqual([
      'The Moment of Decision', 'The First Ripple', 'Where the Ripples End',
    ]);
    expect(out.chapters[1].tone).toBe('twist');
    expect(out.chapters[2].tone).toBe('twist');
    expect(out.chapters.filter((c) => c.hasChoice).map((c) => c.index)).toEqual([2]);
  });
});
