// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanionBackground } from '../companion-background';

describe('CompanionBackground', () => {
  afterEach(cleanup);

  it('renders the shared chat background image', () => {
    render(<CompanionBackground health="healthy" vitality={72} />);
    expect((screen.getByAltText('') as HTMLImageElement).getAttribute('src')).toBe('/symy-chat-bg.png');
  });

  it('maps thriving health to the green vitality gradient', () => {
    const { container } = render(<CompanionBackground health="thriving" vitality={90} />);
    const bar = container.querySelector('.h-full.transition-all.duration-1000');
    expect(bar?.className).toContain('from-green-500 via-emerald-400 to-cyan-400');
    expect(bar?.getAttribute('style')).toContain('width: 90%');
  });

  it('maps weak and critical health to their vitality gradients', () => {
    const { rerender, container } = render(<CompanionBackground health="weak" vitality={40} />);
    expect(container.querySelector('.h-full.transition-all.duration-1000')?.className).toContain('from-yellow-500 via-amber-400 to-orange-400');

    rerender(<CompanionBackground health="critical" vitality={10} />);
    expect(container.querySelector('.h-full.transition-all.duration-1000')?.className).toContain('from-red-500 via-rose-400 to-pink-400');
  });

  it('maps healthy health to the emerald vitality gradient', () => {
    const { container } = render(<CompanionBackground health="healthy" vitality={60} />);
    expect(container.querySelector('.h-full.transition-all.duration-1000')?.className).toContain('from-emerald-500 via-green-400 to-cyan-400');
  });

  it('renders floating particles for non-dormant health', () => {
    const { container } = render(<CompanionBackground health="healthy" vitality={60} />);
    expect(container.querySelectorAll('.animate-float-1').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('.animate-float-2').length).toBeGreaterThanOrEqual(3);
  });

  it('hides the accent orb and particles when dormant', () => {
    const { container } = render(<CompanionBackground health="dormant" vitality={0} />);
    expect(container.querySelector('.h-full.transition-all.duration-1000')?.getAttribute('style')).toContain('width: 0%');
    expect(container.querySelector('.animate-float-1')).toBeNull();
    expect(container.querySelector('.animate-float-2')).toBeNull();
    expect(container.querySelector('.animate-float-3')).toBeNull();
    expect(container.className).not.toContain('bg-rose-400/15');
  });
});
