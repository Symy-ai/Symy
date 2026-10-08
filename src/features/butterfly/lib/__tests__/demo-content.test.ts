import { describe, expect, it } from 'vitest';
import {
  DEMO_ILLUSTRATION_URLS,
  getDemoChapterIllustrationUrl,
  getDemoSceneIllustrations,
  generateDemoOutline,
  generateDemoChapterContent,
  generateDemoChoice,
  generateDemoSummary,
} from '../demo-content';

describe('DEMO_ILLUSTRATION_URLS 预置 CDN 图库', () => {
  it('5 章 × 3 场景图, 全部 CDN png URL', () => {
    for (let ch = 1; ch <= 5; ch++) {
      expect(DEMO_ILLUSTRATION_URLS[ch]).toHaveLength(3);
      for (const url of DEMO_ILLUSTRATION_URLS[ch]) {
        expect(url).toMatch(/^https:\/\/pro\.filesystem\.site\/cdn\/.+\.png$/);
      }
    }
  });

  it('getDemoChapterIllustrationUrl: 首场景图; 未知章 fallback 章 1', () => {
    expect(getDemoChapterIllustrationUrl(2)).toBe(DEMO_ILLUSTRATION_URLS[2][0]);
    expect(getDemoChapterIllustrationUrl(99)).toBe(DEMO_ILLUSTRATION_URLS[1][0]);
  });

  it('getDemoSceneIllustrations: idx→[url] 映射; 未知章空对象', () => {
    expect(getDemoSceneIllustrations(1)).toEqual({ 0: [DEMO_ILLUSTRATION_URLS[1][0]], 1: [DEMO_ILLUSTRATION_URLS[1][1]], 2: [DEMO_ILLUSTRATION_URLS[1][2]] });
    expect(getDemoSceneIllustrations(42)).toEqual({});
  });
});

describe('generateDemoOutline 双语大纲', () => {
  it('zh: 3 章结构 + 中文标题/时间跨度 + 决策类型措辞', () => {
    const o = generateDemoOutline('bought', '咖啡机', 'zh');
    expect(o.chapters).toHaveLength(3);
    expect(o.chapters.map(c => c.index)).toEqual([1, 2, 3]);
    expect(o.chapters[0].title).toBe('决定的那一刻');
    expect(o.chapters[0].summary).toContain('买下了');
    expect(o.chapters[1].hasChoice).toBe(true); // 章二分岔
    expect(o.chapters[0].hasChoice).toBe(false);
    expect(o.decisionType).toBe('bought');
    expect(o.version).toBe(1);
  });

  it('en 默认 locale: 英文标题 + endingHint', () => {
    const o = generateDemoOutline('resisted', 'jacket');
    expect(o.chapters[0].title).toBe('The Moment of Decision');
    expect(o.chapters[0].summary).toContain('walked away from');
    expect(o.endingHint).toContain('gentler');
  });

  it('resisted 分支措辞 (en: walked away / zh: 放下了)', () => {
    expect(generateDemoOutline('resisted', 'x', 'zh').chapters[0].summary).toContain('放下了');
    expect(generateDemoOutline('resisted', 'x').chapters[0].summary).toContain('walked away from');
  });

  it('tone 分布: neutral → twist → twist (章三反转)', () => {
    const o = generateDemoOutline('bought', 'x', 'zh');
    expect(o.chapters.map(c => c.tone)).toEqual(['neutral', 'twist', 'twist']);
  });
});

describe('generateDemoChapterContent 章节内容', () => {
  it('场景以 ||| 分割成 3 段', () => {
    for (const ch of [1, 2, 3]) {
      const content = generateDemoChapterContent(ch, 'bought', '咖啡机', {}, 'zh');
      const scenes = content.split('|||');
      expect(scenes.length).toBe(3);
      for (const s of scenes) expect(s.trim().length).toBeGreaterThan(10);
    }
  });

  it('章 2 选择分支: A/B/未选 三态文案不同', () => {
    const a = generateDemoChapterContent(2, 'bought', 'x', { 2: 'A' }, 'zh');
    const b = generateDemoChapterContent(2, 'bought', 'x', { 2: 'B' }, 'zh');
    const none = generateDemoChapterContent(2, 'bought', 'x', {}, 'zh');
    expect(a).toContain('靠近');
    expect(b).toContain('松开');
    expect(none).toContain('转弯');
    expect(a).not.toBe(b);
  });

  it('未知章节号 fallback 章 1', () => {
    const content = generateDemoChapterContent(99, 'bought', 'x', {}, 'zh');
    expect(content).toBe(generateDemoChapterContent(1, 'bought', 'x', {}, 'zh'));
  });

  it('双语: en 内容含决策描述', () => {
    expect(generateDemoChapterContent(1, 'bought', 'coffee machine', {}, 'en')).toContain('coffee machine');
  });
});

describe('generateDemoChoice 选择卡', () => {
  it('章 2 (分岔): bought 分支小象守护者文案 + A/B', () => {
    const c = generateDemoChoice(2, 'bought', '咖啡机', 'zh');
    expect(c.prompt).toContain('小象守护者');
    expect(c.options).toHaveLength(2);
    expect(c.options.map(o => o.id)).toEqual(['A', 'B']);
    expect(c.options[0].label).toBe('让它靠近');
  });

  it('章 2 resisted 分支措辞 (守住)', () => {
    const c = generateDemoChoice(2, 'resisted', 'x', 'zh');
    expect(c.prompt).toContain('放下');
    expect(c.prompt).toContain('守住什么');
  });

  it('非章 2: 通用路径选择 (无决策词)', () => {
    const c = generateDemoChoice(1, 'bought', '咖啡机', 'zh');
    expect(c.prompt).toBe('你想走哪一条小路？');
    expect(c.options[0].label).toBe('熟悉的小路');
    const en = generateDemoChoice(1, 'bought', 'x', 'en');
    expect(en.prompt).toBe('Which path would you like to take?');
  });
});

describe('generateDemoSummary 蝴蝶效应总结', () => {
  it('bought/zh: 买下了 + 钱用对了地方', () => {
    const s = generateDemoSummary('bought', '咖啡机', 'zh');
    expect(s).toContain('买下了「咖啡机」');
    expect(s).toContain('钱用对了地方');
  });

  it('resisted/en: walked away + The money stayed', () => {
    const s = generateDemoSummary('resisted', 'jacket', 'en');
    expect(s).toContain('walked away from "jacket"');
    expect(s).toContain('The money stayed');
  });
});
