import { describe, expect, it } from 'vitest';
import {
  cleanAgentReply,
  buildOutlineSystemPrompt,
  buildOutlineUserPrompt,
  buildCompleteStorySystemPrompt,
  buildRegenerateOutlinePrompt,
  buildChapterStorySystemPrompt,
  buildChapterStoryUserPrompt,
  buildChoiceOptionsPrompt,
  buildButterflyAgentMessage,
} from '../prompts';

const chapter = (index: number, overrides: Record<string, unknown> = {}) => ({
  index, title: `T${index}`, summary: `S${index}`, hasChoice: false, tone: 'neutral' as const, timeSpan: 'now', ...overrides,
});

describe('cleanAgentReply', () => {
  it('json 模式: 剥离对话前缀 + 提取 ```json 代码块', () => {
    const raw = "Here's the story outline:\n```json\n{\"chapters\": []}\n```";
    expect(cleanAgentReply(raw, 'json')).toBe('{\"chapters\": []}');
  });

  it('json 模式: 工具结果文本被移除', () => {
    const raw = "I've recorded your challenge successfully.\n\n{\"ok\": true}";
    const r = cleanAgentReply(raw, 'json');
    expect(r).not.toContain("I've recorded");
    expect(r).toContain('{\"ok\": true}');
  });

  it('prose 模式: 不提代码块, 保留全文 (仅去前缀)', () => {
    const raw = 'The machine hummed softly.';
    expect(cleanAgentReply(raw, 'prose')).toBe('The machine hummed softly.');
  });

  it('已干净的 JSON 原样返回', () => {
    expect(cleanAgentReply('{"a":1}', 'json')).toBe('{"a":1}');
  });
});

describe('buildOutlineSystemPrompt', () => {
  it('zh: 语言锁 Chinese Simplified + 中文时间跨度例', () => {
    const p = buildOutlineSystemPrompt('zh');
    expect(p).toContain('Chinese (Simplified)');
    expect(p).toContain('那天傍晚');
    // 注: JSON 示例 timeSpan 字段保留 "e.g. that evening" 英文格式说明 (设计如此), 不断言 not
  });

  it('en/默认: English + 英文时间跨度', () => {
    const p = buildOutlineSystemPrompt();
    expect(p).toContain('English');
    expect(p).toContain('that evening');
  });

  it('守卫小象人设 + tone twist 硬规则 + $ 保留规则', () => {
    const p = buildOutlineSystemPrompt('en');
    expect(p).toContain('guardian elephant');
    expect(p).toContain('MUST have tone "twist"');
    expect(p).toContain('preserve the dollar sign');
  });
});

describe('buildOutlineUserPrompt', () => {
  it('bought/resisted/considering 三分支措辞', () => {
    expect(buildOutlineUserPrompt('bought', 'x')).toContain('DECIDED TO BUY');
    expect(buildOutlineUserPrompt('resisted', 'x')).toContain('DECIDED NOT TO BUY');
    expect(buildOutlineUserPrompt('considering', 'x')).toContain('CONSIDERING BUYING');
  });

  it('considering: PRE-PURCHASE 预演注记', () => {
    expect(buildOutlineUserPrompt('considering', 'x')).toContain('PRE-PURCHASE reflection');
  });

  it('amount/context 注入; 无则省', () => {
    expect(buildOutlineUserPrompt('bought', 'x', 55.5)).toContain('Amount: $55.50');
    expect(buildOutlineUserPrompt('bought', 'x')).not.toContain('Amount:');
    const withCtx = buildOutlineUserPrompt('bought', 'x', undefined, undefined, 'user dream fund');
    expect(withCtx).toContain('Context: user dream fund');
    expect(withCtx).toContain('WEAVE these real facts');
    expect(buildOutlineUserPrompt('bought', 'x')).not.toContain('WEAVE');
  });
});

describe('buildCompleteStorySystemPrompt', () => {
  it('zh/en 语言锁', () => {
    expect(buildCompleteStorySystemPrompt('zh')).toContain('Chinese (Simplified)');
    expect(buildCompleteStorySystemPrompt()).toContain('English');
  });
});

describe('buildRegenerateOutlinePrompt', () => {
  it('已发生章节摘要 (H3: 用 outline.summary 非截断文本) + 选择信息 + 新章起点', () => {
    const prevChapters = [
      { index: 1, title: 'A', content: 'c1', tone: 'neutral' as const, timeSpan: 'now', hasChoice: false, createdAt: '' },
      { index: 2, title: 'B', content: 'c2', tone: 'dark' as const, timeSpan: '+1d', hasChoice: true, createdAt: '' },
    ];
    const prevOutline = {
      version: 2, decisionType: 'bought' as const, decisionDescription: 'x',
      chapters: [chapter(1), chapter(2), chapter(3, { summary: 'S3' })], endingHint: 'h',
    };
    const p = buildRegenerateOutlinePrompt(
      prevChapters, prevOutline,
      { prompt: 'which?', selectedOption: 'A', selectedLabel: 'label A' },
      'bought',
    );
    expect(p).toContain('Chapter 1 "T1": S1');
    expect(p).toContain('Chapter 2 "T2": S2');
    expect(p).not.toContain('S3'); // 未来章节摘要不进"已发生"区
    expect(p).toContain('They chose: "label A" (option A)');
    expect(p).toContain('starting from chapter 3');
  });
});

describe('buildChapterStorySystemPrompt', () => {
  it('zh/en 语言锁 + 第二人称 + 40-70 词短场景', () => {
    const zh = buildChapterStorySystemPrompt('zh');
    expect(zh).toContain('Chinese (Simplified)');
    const en = buildChapterStorySystemPrompt();
    expect(en).toContain('English');
    expect(en).toContain('40-70 words');
    expect(en).toContain('Second person');
  });
});

describe('buildChapterStoryUserPrompt', () => {
  it('章 1/2/3 进度提示 (hook/escalate/twist)', () => {
    expect(buildChapterStoryUserPrompt(chapter(1), 'bought', 'x')).toContain('FIRST chapter');
    expect(buildChapterStoryUserPrompt(chapter(2), 'bought', 'x')).toContain('SECOND chapter');
    expect(buildChapterStoryUserPrompt(chapter(3), 'bought', 'x')).toContain('FINAL chapter');
  });

  it('title 空 (stub outline): 让 LLM 自起标题', () => {
    expect(buildChapterStoryUserPrompt(chapter(1, { title: '' }), 'bought', 'x')).toContain('Create an evocative title');
  });

  it('前章结尾只取 300 字符 + storyContext 织入指令', () => {
    const long = 'x'.repeat(600);
    const p = buildChapterStoryUserPrompt(chapter(2), 'bought', 'd', long, 'dream fund iceland');
    expect(p).toContain('x'.repeat(300));
    expect(p).not.toContain('x'.repeat(301));
    expect(p).toContain('USER CONTEXT');
    expect(p).toContain('dream fund iceland');
  });
});

describe('buildChoiceOptionsPrompt', () => {
  it('章末 500 字符 + A/B 恰两个选项 + 均等诱人规则', () => {
    const long = 'y'.repeat(700);
    const p = buildChoiceOptionsPrompt(chapter(2, { hasChoice: true }), long, 'bought', 'ctx');
    expect(p).toContain('y'.repeat(500));
    expect(p).not.toContain('y'.repeat(501));
    expect(p).toContain('EXACTLY 2 choice options');
    expect(p).toContain('EQUALLY TEMPTING');
    expect(p).toContain('User context: ctx');
  });
});

describe('buildButterflyAgentMessage', () => {
  it('五种模式头 + 禁工具调用硬指令 (防 add_tokens/record_impulse 泄漏)', () => {
    for (const mode of ['outline', 'chapter', 'choice', 'regenerate', 'summary'] as const) {
      const msg = buildButterflyAgentMessage(mode, 'SYS', 'USR');
      expect(msg).toContain(`[BUTTERFLY EFFECT - ${mode.toUpperCase()} MODE]`);
      expect(msg).toContain('STORY GENERATION MODE');
      expect(msg).toContain('no add_tokens, no record_impulse');
      expect(msg).toContain('SYS');
      expect(msg).toContain('USR');
    }
  });
});
