/**
 * AtmosphereParticles — canvas-based particle effect for StoryViewer.
 *
 * 🔧 Round 80 F4: extracted from story-viewer.tsx (was 982 lines, target <800).
 *    Particle effect changes color based on story tone.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { StoryTone } from '../../types';
import { TONE_COLORS } from './helpers';

export interface AtmosphereParticlesProps {
  tone: StoryTone;
}

export function AtmosphereParticles({ tone }: AtmosphereParticlesProps) {
  const colors = TONE_COLORS[tone] || TONE_COLORS.neutral;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 粒子
    const particles: Array<{
      x: number; y: number;
      vx: number; vy: number;
      size: number; alpha: number;
      life: number; maxLife: number;
    }> = [];

    const createParticle = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.5 - 0.1,
      size: Math.random() * 2 + 1,
      alpha: Math.random() * 0.4 + 0.1,
      life: 0,
      maxLife: Math.random() * 200 + 100,
    });

    // 初始化 15 个粒子
    for (let i = 0; i < 15; i++) {
      const p = createParticle();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(lifeRatio * 5, 1);
        const fadeOut = Math.max(1 - (lifeRatio - 0.7) / 0.3, 0);
        const currentAlpha = p.alpha * fadeIn * (lifeRatio > 0.7 ? fadeOut : 1);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = colors.particleColor.replace(/[\d.]+\)$/, `${currentAlpha})`);
        ctx.fill();

        // 光晕
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = colors.particleColor.replace(/[\d.]+\)$/, `${currentAlpha * 0.2})`);
        ctx.fill();

        if (p.life >= p.maxLife) {
          particles[i] = createParticle();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [colors.particleColor]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[5] pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
}
