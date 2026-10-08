import { describe, expect, it } from 'vitest';
import { generateSVGIllustration } from '../svg-illustration-engine';

function decode(dataUrl: string): string {
  expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  const b64 = dataUrl.slice('data:image/svg+xml;base64,'.length);
  return typeof Buffer !== 'undefined'
    ? Buffer.from(b64, 'base64').toString('utf-8')
    : decodeURIComponent(escape(atob(b64)));
}

describe('generateSVGIllustration (323行 SVG 插图引擎)', () => {
  it('返回 data URL + 内含合法 SVG 骨架 (viewBox 384x672)', () => {
    const url = generateSVGIllustration('Test', 'hopeful', 1);
    const svg = decode(url);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 672"');
    expect(svg).toContain('</svg>');
  });

  it('确定性: 同输入同输出 (seed = hash(title+tone+chapter))', () => {
    const a = generateSVGIllustration('Same Title', 'twist', 2);
    const b = generateSVGIllustration('Same Title', 'twist', 2);
    expect(a).toBe(b);
    // 不同章节 → 不同图
    const c = generateSVGIllustration('Same Title', 'twist', 3);
    expect(c).not.toBe(a);
  });

  it('四 tone 均可生成且色板生效 (hopeful 绿/dark 红/twist 紫)', () => {
    for (const tone of ['hopeful', 'dark', 'twist', 'neutral'] as const) {
      const svg = decode(generateSVGIllustration('T', tone, 1));
      expect(svg).toContain('bg-grad');
      expect(svg).toContain('ripple-grad');
    }
    const hopeful = decode(generateSVGIllustration('T', 'hopeful', 1));
    expect(hopeful).toContain('#10b981'); // dark 模式 hopeful primary
    const dark = decode(generateSVGIllustration('T', 'dark', 1));
    expect(dark).toContain('#ef4444');
    const twist = decode(generateSVGIllustration('T', 'twist', 1));
    expect(twist).toContain('#a855f7');
  });

  it('isLight: 浅色色板 + 浅色 vignette/ground/figure', () => {
    const light = decode(generateSVGIllustration('T', 'hopeful', 1, true));
    expect(light).toContain('#34d399'); // light hopeful primary
    expect(light).toContain('#f0fdf4'); // light bg
    const dark = decode(generateSVGIllustration('T', 'hopeful', 1, false));
    expect(dark).toContain('#0a1a0f'); // dark bg
    // light 专属: 白色 vignette 边 + 低透明度
    expect(light).toContain('opacity="0.2"'); // vignetteOpacity light
    expect(dark).toContain('opacity="0.4"'); // vignetteOpacity dark
  });

  it('涟漪主题: 同心圆光圈存在 (V11 无蝴蝶)', () => {
    const svg = decode(generateSVGIllustration('T', 'neutral', 1));
    expect(svg).toContain('translate(275, 125)'); // ripple 位置
    expect((svg.match(/<circle cx="0" cy="0"/g) || []).length).toBeGreaterThanOrEqual(6);
    // V11: 蝴蝶图形已移除 (注释里提到 replaced butterfly 不算图形回归)
    expect(svg).not.toMatch(/<path[^>]*butterfly|<g[^>]*butterfly/i);
  });

  it('人物剪影 + 粒子层 (25 粒子)', () => {
    const svg = decode(generateSVGIllustration('T', 'neutral', 1));
    expect(svg).toContain('translate(192, 340)'); // 剪影位置
    const particles = svg.match(/filter="url\(#glow\)"/g) || [];
    expect(particles.length).toBeGreaterThanOrEqual(25);
  });

  it('标题语义场景元素: rain/storm → 雨线', () => {
    const rain = decode(generateSVGIllustration('Rainy Night Storm', 'dark', 1));
    const calm = decode(generateSVGIllustration('Sunny Morning', 'dark', 1));
    const rainLines = (rain.match(/stroke-width="1" opacity/g) || []).length;
    const calmLines = (calm.match(/stroke-width="1" opacity/g) || []).length;
    expect(rainLines).toBeGreaterThan(calmLines);
    expect(rainLines).toBeGreaterThanOrEqual(15);
  });

  it('标题语义场景元素: night/dark/moon → 星点 (白/灰)', () => {
    const night = decode(generateSVGIllustration('Midnight Moon', 'neutral', 1, false));
    expect(night).toContain('fill="#ffffff"'); // dark 模式白星
    const lightNight = decode(generateSVGIllustration('Midnight Moon', 'neutral', 1, true));
    expect(lightNight).toContain('#6b7280'); // light 模式灰星
  });

  it('标题语义场景元素: door/gate/window → 门窗光', () => {
    const door = decode(generateSVGIllustration('The Open Door', 'hopeful', 1));
    expect(door).toContain('x="150" y="250" width="84" height="150"'); // 门框 rect
  });

  it('Unicode 标题 (中文) 不炸 (BUG-295: btoa 非 ASCII)', () => {
    expect(() => generateSVGIllustration('咖啡机的涟漪 — 命运之夜', 'twist', 2)).not.toThrow();
    const svg = decode(generateSVGIllustration('咖啡机', 'twist', 2));
    expect(svg).toContain('<svg');
  });

  it('幂等可用: 生成两次同标题无副作用', () => {
    const a = generateSVGIllustration('Idem', 'neutral', 1);
    const b = generateSVGIllustration('Idem', 'neutral', 1);
    expect(a).toBe(b);
  });
});
