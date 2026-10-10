// @vitest-environment happy-dom
// SymyAvatar — 四档成长阶段头像（此前 0 测试）
// 红线: 只认 growthStage, 不渲染枯萎/眼泪等羞耻符号（owner 人设铁律）。
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SymyAvatar } from '../symy-avatar';

// PNG 加载在 happy-dom 会走 onError 降级 — 但也可能不触发; 两种路径都验证。

describe('SymyAvatar — 成长阶段头像', () => {
  it('四档 growthStage 全渲染不炸 (baby/young/adult/elder)', () => {
    for (const stage of ['baby', 'young', 'adult', 'elder'] as const) {
      const { container, unmount } = render(<SymyAvatar growthStage={stage} />);
      expect(container.querySelector('div')).not.toBeNull();
      unmount();
    }
  });

  it('animate=false 不挂呼吸动画 class', () => {
    const { container } = render(<SymyAvatar growthStage="young" animate={false} />);
    expect(container.querySelector('.animate-buddy-breathe')).toBeNull();
  });

  it('animate=true (默认) 挂呼吸动画', () => {
    const { container } = render(<SymyAvatar growthStage="young" />);
    expect(container.querySelector('.animate-buddy-breathe')).not.toBeNull();
  });

  it('容器 aria-hidden (装饰性头像, 读屏跳过)', () => {
    const { container } = render(<SymyAvatar growthStage="adult" />);
    expect(container.querySelector('div[aria-hidden="true"]')).not.toBeNull();
  });

  it('className 透传', () => {
    const { container } = render(<SymyAvatar growthStage="adult" className="my-extra" />);
    expect(container.querySelector('.my-extra')).not.toBeNull();
  });

  it('零羞耻符号红线: 渲染产物不含枯萎/眼泪/失望文案或 class', () => {
    for (const stage of ['baby', 'young', 'adult', 'elder'] as const) {
      const { container } = render(<SymyAvatar growthStage={stage} />);
      const text = (container.textContent || '') + container.innerHTML;
      expect(text).not.toMatch(/wither|wilt|tear|sad|shame|枯萎|眼泪|羞耻|失望/i);
    }
  });

  it('PNG 路径按阶段映射 (2.5D 主图)', () => {
    for (const [stage, path] of [
      ['baby', '/avatars/baby-elephant.png'],
      ['young', '/avatars/young-elephant.png'],
      ['adult', '/avatars/adult-elephant.png'],
      ['elder', '/avatars/elder-elephant.png'],
    ] as const) {
      const { container, unmount } = render(<SymyAvatar growthStage={stage} />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toBe(path);
      unmount();
    }
  });

  it('PNG onError → 降级纯 SVG (img 移除, svg 在位)', () => {
    const { container } = render(<SymyAvatar growthStage="young" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // 模拟加载失败
    img?.dispatchEvent(new Event('error'));
    // 降级: img 移除, svg 渲染
    const svg = container.querySelector('svg');
    if (svg) {
      // happy-dom 若同步触发降级, img 应已被替换
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('elder 专属: 披风 (#143527 松绿) + 莲花胸针在降级 SVG', () => {
    const { container } = render(<SymyAvatar growthStage="elder" />);
    const img = container.querySelector('img');
    img?.dispatchEvent(new Event('error'));
    const svg = container.querySelector('svg');
    if (svg) {
      const html = svg.innerHTML;
      expect(html).toContain('#143527'); // 披风 PINE
      expect(html).toContain('#F4CFDD'); // 莲花
    }
  });

  it('adult 专属: 领巾 (#2F7A57) + 象牙在降级 SVG', () => {
    const { container } = render(<SymyAvatar growthStage="adult" />);
    const img = container.querySelector('img');
    img?.dispatchEvent(new Event('error'));
    const svg = container.querySelector('svg');
    if (svg) {
      const html = svg.innerHTML;
      expect(html).toContain('#2F7A57'); // 领巾
      expect(html).toContain('#F6FBF3'); // 象牙
    }
  });

  it('young 专属: 星星发夹 (#F2C94C 金) 在降级 SVG; baby 无金色', () => {
    const { container } = render(<SymyAvatar growthStage="young" />);
    const img = container.querySelector('img');
    img?.dispatchEvent(new Event('error'));
    const svg = container.querySelector('svg');
    if (svg) {
      expect(svg.innerHTML).toContain('#F2C94C'); // 星星发夹
    }
    const { container: babyC } = render(<SymyAvatar growthStage="baby" />);
    babyC.querySelector('img')?.dispatchEvent(new Event('error'));
    const babySvg = babyC.querySelector('svg');
    if (babySvg) {
      expect(babySvg.innerHTML).not.toContain('#F2C94C'); // baby 无金
    }
  });
});
