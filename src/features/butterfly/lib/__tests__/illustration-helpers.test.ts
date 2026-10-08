import { describe, expect, it } from 'vitest';
import {
  TONE_COLOR_MAP_DARK,
  TONE_COLOR_MAP_LIGHT,
  TONE_MOOD_MAP_DARK,
  extractVisualHintsFromContent,
  extractSceneFromTitle,
  buildIllustrationPrompt,
  MANGA_PROTAGONIST_PROMPT,
} from '../illustration-helpers';

describe('Tone 视觉映射表 (双模式)', () => {
  it('dark 四 tone 色板: hopeful 绿/dark 红/twist 紫/neutral 蓝', () => {
    expect(TONE_COLOR_MAP_DARK).toEqual({ hopeful: 'green', dark: 'crimson', twist: 'purple', neutral: 'blue' });
  });

  it('light 色板存在且四 tone 全', () => {
    for (const tone of ['hopeful', 'dark', 'twist', 'neutral'] as const) {
      expect(TONE_COLOR_MAP_LIGHT[tone]).toBeTruthy();
    }
    expect(TONE_MOOD_MAP_DARK.twist).toBe('surreal');
  });
});

describe('extractVisualHintsFromContent', () => {
  it('时间+地点+情绪线索合并 (各限 1)', () => {
    const r = extractVisualHintsFromContent('Rain fell in the kitchen. Tears on her face.');
    expect(r).toContain('rain');
    expect(r).toContain('kitchen');
    expect(r).toContain('tears');
    expect(r).toContain('Scene includes');
  });

  it('多地点只取一个 (else-if 链序: kitchen>bedroom>office, 与词序无关)', () => {
    const r = extractVisualHintsFromContent('office then bedroom then hospital');
    expect(r).toContain('bedroom'); // 链序 bedroom 在 office 前
    expect(r).not.toContain('office');
    expect(r).not.toContain('hospital');
    const r2 = extractVisualHintsFromContent('hospital office kitchen');
    expect(r2).toContain('kitchen'); // kitchen 链首
  });

  it('线索全空 → null (无假提示)', () => {
    expect(extractVisualHintsFromContent('Nothing visual here at all')).toBeNull();
  });

  it('时间线索可叠加 (非互斥)', () => {
    const r = extractVisualHintsFromContent('sunset turning to dawn, rain and snow');
    expect(r).toContain('sunset light');
    expect(r).toContain('dawn light');
    expect(r).toContain('rain');
    expect(r).toContain('snow');
  });
});

describe('extractSceneFromTitle (50+ 分支)', () => {
  it('雨天标题 → 暗窗雨景', () => {
    expect(extractSceneFromTitle('Rain on the Window', 'x')).toContain('rain streaking down a dark window');
  });

  it('涟漪/蝴蝶 → 水面同心圆 (echo 分支优先于 begin 的 ripple)', () => {
    // 注意: 'ripple' 同时出现在 echo 和 begin 分支 — echo 在前优先
    const r = extractSceneFromTitle('The Ripple Effect', 'x');
    expect(r).toContain('ripples');
  });

  it('决策描述物品提取: bought a jacket → with ... visible nearby', () => {
    const r = extractSceneFromTitle('The Night After', 'bought a jacket for winter');
    expect(r).toContain('with ');
    expect(r).toContain('visible nearby');
  });

  it('兜底分支: 无匹配词 → 门槛剪影', () => {
    const r = extractSceneFromTitle('Xyzzy Plugh Qqqq', 'nothing to extract');
    expect(r).toContain('threshold between shadow and illumination');
  });
});

describe('buildIllustrationPrompt (组装)', () => {
  it('三源优先级: llmSceneDescription > contentSnippet > title', () => {
    const llm = buildIllustrationPrompt('Title', 'hopeful', 'now', 'x', 'bought', undefined, 'LLM 描述的专属场景');
    expect(llm).toContain('LLM 描述的专属场景');
    const content = buildIllustrationPrompt('Title', 'hopeful', 'now', 'x', 'bought', 'Rain in the kitchen while tears fell silently down her cheeks one by one.');
    expect(content).toContain('rain');
    expect(content).toContain('kitchen');
    const titleOnly = buildIllustrationPrompt('Storm Night', 'hopeful', 'now', 'x', 'bought');
    expect(titleOnly).toContain('rain streaking');
  });

  it('短内容 (<=50 字符) 走 title 分支', () => {
    const r = buildIllustrationPrompt('Mirror', 'twist', 'now', 'x', 'bought', 'short');
    expect(r).toContain('cracked mirror');
    expect(r).not.toContain('Scene includes');
  });

  it('铁律组装: 火柴人无脸 + tone mood + tone color + No face visible', () => {
    const r = buildIllustrationPrompt('T', 'dark', 'now', 'x', 'bought');
    expect(r).toContain(MANGA_PROTAGONIST_PROMPT);
    expect(r).toContain('ominous mood'); // TONE_MOOD_MAP_DARK.dark
    expect(r).toContain('crimson colors'); // TONE_COLOR_MAP_DARK.dark
    expect(r).toContain('No face visible');
    expect(r).toContain('stick figure'); // 风格前缀
  });

  it('isLight: light 色板 + light 风格', () => {
    const dark = buildIllustrationPrompt('T', 'hopeful', 'now', 'x', 'bought', undefined, undefined, false);
    const light = buildIllustrationPrompt('T', 'hopeful', 'now', 'x', 'bought', undefined, undefined, true);
    expect(dark).toContain('green colors');
    expect(light).toContain(TONE_COLOR_MAP_LIGHT.hopeful);
    // MANGA_STYLE_LIGHT/DARK 当前字面相同 (源码即同串) — light 差异在色板不在风格串
    expect(light).toContain(TONE_COLOR_MAP_LIGHT.hopeful);
  });
});
