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
});
