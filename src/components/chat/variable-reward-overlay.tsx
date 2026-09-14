'use client';
/**
 * Variable Reward Overlay — P1-1 高水准可变奖励动画 (Round 93)
 *
 * 重写为 canvas 粒子系统:
 * - 三层粒子: 背景光爆 + 中景物理粒子 + 前景闪光
 * - 粒子带重力下落 + 旋转 + 空气阻力
 * - 0.4s 后二次 ring 扩散
 * - 文字 stagger 逐字出现 + 光晕描边
 * - 屏幕闪光 + 镜头推近
 * - 移动端触觉反馈 (navigator.vibrate)
 * - 支持 prefers-reduced-motion
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/i18n/provider';

interface VariableRewardOverlayProps {
  rewardTier: 'basic' | 'card' | 'item' | 'golden' | null;
  bonusTokens: number;
  bonusVitality: number;
  onComplete?: () => void;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; color: string;
  rotation: number; rotSpeed: number;
  life: number; maxLife: number;
  shape: 'circle' | 'star' | 'ring';
}

const TIER_CONFIG = {
  golden: {
    primary: '#FFD700', secondary: '#FFA500', highlight: '#FFFFFF',
    glow: 'rgba(255, 215, 0, 0.6)',
    titleKey: 'chat.rewardGoldenTitle', titleDefault: 'GOLDEN SEEING', emoji: '✨',
    subtitleKey: 'chat.rewardGoldenSubtitle', subtitleDefault: 'The mirror shimmered',
    particleCount: 40, ringCount: 12,
    bgGradient: 'radial-gradient(circle at center, rgba(255,215,0,0.15), rgba(255,165,0,0.05), transparent)',
    borderColor: 'rgba(255, 215, 0, 0.5)',
    textColor: '#FFD700',
    textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 165, 0, 0.4)',
    vibrate: [30, 50, 30],
  },
  item: {
    primary: '#60A5FA', secondary: '#3B82F6', highlight: '#DBEAFE',
    glow: 'rgba(96, 165, 250, 0.5)',
    titleKey: 'chat.rewardItemTitle', titleDefault: 'BONUS REWARD', emoji: '🎁',
    subtitleKey: 'chat.rewardItemSubtitle', subtitleDefault: 'Extra tokens & vitality',
    particleCount: 30, ringCount: 8,
    bgGradient: 'radial-gradient(circle at center, rgba(96,165,250,0.15), rgba(59,130,246,0.05), transparent)',
    borderColor: 'rgba(96, 165, 250, 0.5)',
    textColor: '#60A5FA',
    textShadow: '0 0 20px rgba(96, 165, 250, 0.6), 0 0 40px rgba(59, 130, 246, 0.3)',
    vibrate: [20, 30],
  },
  card: {
    primary: '#C084FC', secondary: '#A855F7', highlight: '#F3E8FF',
    glow: 'rgba(192, 132, 252, 0.5)',
    titleKey: 'chat.rewardCardTitle', titleDefault: 'BONUS CARDS', emoji: '🃏',
    subtitleKey: 'chat.rewardCardSubtitle', subtitleDefault: 'A little extra',
    particleCount: 20, ringCount: 6,
    bgGradient: 'radial-gradient(circle at center, rgba(192,132,252,0.15), rgba(168,85,247,0.05), transparent)',
    borderColor: 'rgba(192, 132, 252, 0.5)',
    textColor: '#C084FC',
    textShadow: '0 0 20px rgba(192, 132, 252, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)',
    vibrate: [15],
  },
  basic: null,
} as const;

export function VariableRewardOverlay({ rewardTier, bonusTokens, bonusVitality, onComplete }: VariableRewardOverlayProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  const [showFlash, setShowFlash] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const config = rewardTier && rewardTier !== 'basic' ? TIER_CONFIG[rewardTier] : null;

  const initParticles = useCallback(() => {
    if (!config || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const particles: Particle[] = [];

    // 中景物理粒子
    for (let i = 0; i < config.particleCount; i++) {
      const angle = (i / config.particleCount) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 3 + Math.random() * 6;
      const colors = [config.primary, config.secondary, config.highlight];
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2, // 初始向上偏移
        size: 3 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 60 + Math.random() * 40,
        shape: Math.random() > 0.7 ? 'star' : Math.random() > 0.8 ? 'ring' : 'circle',
      });
    }

    particlesRef.current = particles;
  }, [config]);

  const drawParticle = (ctx: CanvasRenderingContext2D, p: Particle) => {
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 2;

    if (p.shape === 'star') {
      drawStar(ctx, 0, 0, 5, p.size, p.size * 0.4);
    } else if (p.shape === 'ring') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outer: number, inner: number) => {
    let rot = Math.PI / 2 * 3;
    let x = cx, y = cy;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outer);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outer;
      y = cy + Math.sin(rot) * outer;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * inner;
      y = cy + Math.sin(rot) * inner;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outer);
    ctx.closePath();
    ctx.fill();
  };

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !config) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景光爆 (0-400ms)
    if (elapsed < 400) {
      const burstScale = elapsed / 400;
      const burstAlpha = (1 - burstScale) * 0.6;
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, 300 * burstScale,
      );
      gradient.addColorStop(0, `${config.primary}${Math.floor(burstAlpha * 255).toString(16).padStart(2, '0')}`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 二次 ring 扩散 (400ms 后)
    if (elapsed > 400 && elapsed < 800) {
      const ringProgress = (elapsed - 400) / 400;
      const ringRadius = ringProgress * 250;
      const ringAlpha = (1 - ringProgress) * 0.5;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = config.primary;
      ctx.lineWidth = 3;
      ctx.globalAlpha = ringAlpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 更新和绘制粒子
    const gravity = 0.12;
    const friction = 0.98;
    particlesRef.current = particlesRef.current.filter(p => {
      p.life++;
      if (p.life >= p.maxLife) return false;
      p.vy += gravity;
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      drawParticle(ctx, p);
      return true;
    });

    if (particlesRef.current.length > 0 || elapsed < 800) {
      animationRef.current = requestAnimationFrame(animate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- drawParticle is stable
  }, [config]);

  useEffect(() => {
    if (!rewardTier || rewardTier === 'basic' || !config) return;

    // 触觉反馈
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(config.vibrate);
    }

    // 屏幕闪光
    setShowFlash(true);
    const flashTimer = setTimeout(() => setShowFlash(false), 200);

    // 初始化 canvas
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
      startTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    }

    // 4s 后自动关闭
    const closeTimer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 4000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(closeTimer);
      cancelAnimationFrame(animationRef.current);
    };
  }, [rewardTier, config, initParticles, animate, onComplete]);

  // prefers-reduced-motion 降级
  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  if (!rewardTier || rewardTier === 'basic' || !visible || !config) return null;

  const subtitle = rewardTier === 'golden'
    ? t('chat.rewardTokensVitality', { defaultValue: `+${bonusTokens} tokens · +${bonusVitality} vitality`, tokens: bonusTokens, vitality: bonusVitality })
    : rewardTier === 'item'
      ? t('chat.rewardTokensVitality', { defaultValue: `+${bonusTokens} tokens · +${bonusVitality} vitality`, tokens: bonusTokens, vitality: bonusVitality })
      : t('chat.rewardTokens', { defaultValue: `+${bonusTokens} tokens`, tokens: bonusTokens });

  // 文字 stagger
  const titleText = t(config.titleKey, { defaultValue: config.titleDefault });
  const titleChars = titleText.split('');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: config.bgGradient,
        backdropFilter: 'blur(4px)',
        animation: prefersReducedMotion ? 'none' : 'reward-camera-in 0.6s var(--ease-out-expo)',
      }}
      onClick={() => { setVisible(false); onComplete?.(); }}
    >
      {/* 屏幕闪光 */}
      {showFlash && !prefersReducedMotion && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{ animation: 'screen-flash 0.2s ease-out forwards' }}
        />
      )}

      {/* Canvas 粒子 */}
      {!prefersReducedMotion && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
        />
      )}

      {/* 中心文字 */}
      <div
        className="relative z-10 text-center px-8 py-6 rounded-3xl backdrop-blur-xl shadow-2xl"
        style={{
          background: 'rgba(15, 15, 25, 0.7)',
          border: `1px solid ${config.borderColor}`,
          animation: prefersReducedMotion ? 'none' : 'reward-card-in 0.5s var(--ease-spring) 0.1s backwards',
        }}
      >
        {/* Emoji */}
        <div
          className="text-5xl mb-3"
          style={{ animation: prefersReducedMotion ? 'none' : 'reward-emoji-pop 0.6s var(--ease-spring) 0.2s backwards' }}
        >
          {config.emoji}
        </div>

        {/* 标题 — 逐字 stagger */}
        <h2
          className="text-2xl font-bold mb-2 tracking-wider"
          style={{ color: config.textColor, textShadow: config.textShadow }}
        >
          {titleChars.map((char, i) => (
            <span
              key={i}
              className="inline-block"
              style={{
                animation: prefersReducedMotion ? 'none' : `text-pop 0.5s var(--ease-spring) ${0.3 + i * 0.05}s backwards`,
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          ))}
        </h2>

        {/* 副标题 */}
        <p className="text-sm text-white/70 mb-1" style={{ animation: prefersReducedMotion ? 'none' : 'text-fade-up 0.4s var(--ease-out-expo) 0.8s backwards' }}>
          {subtitle}
        </p>
        <p className="text-xs text-white/40 italic" style={{ animation: prefersReducedMotion ? 'none' : 'text-fade-up 0.4s var(--ease-out-expo) 1s backwards' }}>
          {t(config.subtitleKey, { defaultValue: config.subtitleDefault })}
        </p>
      </div>

      <style>{`
        @keyframes reward-camera-in {
          0% { transform: scale(1.05); filter: brightness(1.3); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        @keyframes screen-flash {
          0% { opacity: 0; }
          10% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes reward-card-in {
          0% { opacity: 0; transform: scale(0.7) translateY(20px); }
          60% { transform: scale(1.08) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes reward-emoji-pop {
          0% { opacity: 0; transform: scale(0) rotate(-45deg); }
          60% { transform: scale(1.3) rotate(10deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes text-pop {
          0% { opacity: 0; transform: translateY(20px) scale(0.5); }
          60% { transform: translateY(-8px) scale(1.15); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes text-fade-up {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
