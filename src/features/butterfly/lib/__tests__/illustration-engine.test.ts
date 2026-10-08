import { describe, expect, it } from 'vitest';
import {
  buildSceneIllustrationPrompt,
  buildMultiShotScenePrompts,
  buildPrompt,
} from '../illustration-engine';

// 模块级 env 消费 — isImageAPIConfigured 不在测试范围 (re-export), 纯函数直测

const SCENE = 'A person stands alone at a crossroads';
const TITLE = 'Chapter One';
const DESC = 'buy a coffee machine';

describe('buildSceneIllustrationPrompt', () => {
  it('dark 基调: 含场景文本/决策上下文/tone 色板/红线否定词', () => {
    const p = buildSceneIllustrationPrompt(SCENE, TITLE, 'dark', DESC);
    expect(p).toContain(SCENE);
    expect(p).toContain(`"${DESC}"`);
    // dark tone → crimson palette
    expect(p).toContain('crimson palette');
    // 红线: 禁蝴蝶/昆虫/露脸
    expect(p).toContain('NO butterflies');
    expect(p).toContain('NO insect imagery');
    expect(p).toContain('NO face visible');
    // 主角 stick figure 约束
    expect(p).toContain('no face');
  });

  it('light 基调: bright light background + light 色板映射', () => {
    const p = buildSceneIllustrationPrompt(SCENE, TITLE, 'hopeful', DESC, true);
    expect(p).toContain('bright light background');
    expect(p).toContain('green palette'); // hopeful → green
  });

  it('dark 基调背景词 + 未知 tone 兜底 neutral', () => {
    const p = buildSceneIllustrationPrompt(SCENE, TITLE, 'neutral', DESC, false);
    expect(p).toContain('dark background with depth');
    expect(p).toContain('blue palette'); // neutral → blue
  });
});

describe('buildMultiShotScenePrompts', () => {
  it('shotCount=2 → wide+closeup 双 prompt', () => {
    const prompts = buildMultiShotScenePrompts(SCENE, TITLE, 'neutral', DESC, 2);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('wide establishing shot');
    expect(prompts[1]).toContain('extreme close-up');
  });

  it('shotCount=3 → wide+medium+closeup; shotCount=1 → medium 单镜头', () => {
    const three = buildMultiShotScenePrompts(SCENE, TITLE, 'neutral', DESC, 3);
    expect(three).toHaveLength(3);
    expect(three[1]).toContain('medium shot');
    const one = buildMultiShotScenePrompts(SCENE, TITLE, 'neutral', DESC, 1);
    expect(one).toHaveLength(1);
    expect(one[0]).toContain('medium shot');
  });

  it('每个 prompt 含场景文本 + 红线否定词 (蝴蝶/昆虫/露脸)', () => {
    const prompts = buildMultiShotScenePrompts(SCENE, TITLE, 'twist', DESC, 2, true);
    for (const p of prompts) {
      expect(p).toContain(SCENE);
      expect(p).toContain('NO butterflies');
      expect(p).toContain('NO insect imagery');
      expect(p).toContain('NO face visible');
    }
  });

  it('tone 映射: twist → purple, light mode 背景', () => {
    const prompts = buildMultiShotScenePrompts(SCENE, TITLE, 'twist', DESC, 2, true);
    // light mode twist → lavender (light 色板独立于 dark 的 purple)
    expect(prompts[0]).toContain('lavender palette');
    expect(prompts[0]).toContain('bright light background');
  });
});

describe('buildPrompt (re-export 兼容)', () => {
  it('从 illustration-helpers re-export 可用 (title/tone/timeSpan/desc 签名)', () => {
    expect(typeof buildPrompt).toBe('function');
    const p = buildPrompt(TITLE, 'dark', '1 year later', DESC, 'bought', SCENE, undefined, false);
    // helpers 版 prompt 模板: dark → 'crimson colors' + 无露脸红线
    expect(p).toContain('crimson colors');
    expect(p).toContain('No face visible');
  });
});
