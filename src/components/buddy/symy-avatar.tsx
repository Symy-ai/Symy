'use client';

/**
 * Symy Avatar — 松绿小象内联 SVG (batch3-b: 大象视觉升级)
 *
 * 取代 Round 114 的 AI 生成 PNG (奶油色卡哇伊象, 与松绿 #143527 人设脱节)。
 * 改为参数化内联 SVG: 单一小象构造 + 四档 growthStage 差异参数,
 * 与拦截勋章卡同一绿色语言 (emerald→pine), 圆润 Q 版, 拒绝精细写实。
 *
 * 四档肉眼可辨差异:
 * - baby  象宝宝: 最小体型, 短象鼻, 头顶单叶嫩芽
 * - young 少年象: 体型变大, 象鼻变长, 双叶嫩芽 + 星星发夹
 * - adult 成年象: 接近满体型, 长象鼻带卷, 小象牙 + 叶形领巾
 * - elder 守护长老: 满体型, 最长象鼻优雅卷曲, 松绿叶披风 + 莲花胸针
 *
 * 荣誉非羞耻: 小象永远可爱 — 健康状态差异由 hero 区光晕/文字表达,
 * 本组件只认 growthStage, 不渲染枯萎/眼泪等羞耻符号。
 */

import { memo, useState } from 'react';
import type { GrowthStage } from '@/types/buddy-state';

const STAGE_PNG: Record<GrowthStage, string> = {
  baby: '/avatars/baby-elephant.png',
  young: '/avatars/young-elephant.png',
  adult: '/avatars/adult-elephant.png',
  elder: '/avatars/elder-elephant.png',
};

interface SymyAvatarProps {
  growthStage: GrowthStage;
  animate?: boolean;
  className?: string;
}

// ====== 松绿色板 (persona SSOT #143527 + 勋章卡 emerald 语言) ======
const PINE = '#143527';

interface StageVisual {
  /** 整体缩放 — 体型差异 (脚底 60,108 为锚点, 保证都站在同一条地面线) */
  scale: number;
  /** 头部半径 */
  headR: number;
  /** 耳朵 (rx, ry) */
  ear: { rx: number; ry: number };
  /** 象鼻末端 y (越长越大) */
  trunkEndY: number;
  /** 象鼻尖端卷曲 (adult/elder 才有) */
  trunkCurl: boolean;
  /** 身体主色 — 随阶段加深, 向松绿靠拢 */
  body: string;
  /** 身体暗部 (耳朵外缘/腿/鼻影) */
  bodyDark: string;
  /** PNG 主图 缩放 (2.5D 图为主时的体型差异) */
  pngScale: number;
}

const STAGE_VISUAL: Record<GrowthStage, StageVisual> = {
  baby: {
    scale: 0.74, pngScale: 0.8, headR: 27, ear: { rx: 14, ry: 16 }, trunkEndY: 63, trunkCurl: false,
    body: '#ACD8BF', bodyDark: '#7FB997',
  },
  young: {
    scale: 0.85, pngScale: 0.88, headR: 28, ear: { rx: 15.5, ry: 17.5 }, trunkEndY: 70, trunkCurl: false,
    body: '#97CFAE', bodyDark: '#69B18D',
  },
  adult: {
    scale: 0.95, pngScale: 0.96, headR: 29, ear: { rx: 17, ry: 19 }, trunkEndY: 77, trunkCurl: true,
    body: '#7FBE9D', bodyDark: '#549E7C',
  },
  elder: {
    scale: 1, pngScale: 1.04, headR: 30, ear: { rx: 18, ry: 20 }, trunkEndY: 80, trunkCurl: true,
    body: '#66AE8B', bodyDark: '#3E8A64',
  },
};

/** 鼻尖卷曲方向: 向用户视角右侧内卷 (温柔不含胡乱甩) */
function trunkPath(endY: number, curl: boolean): string {
  if (curl) {
    return `M60 52 C 58.5 ${endY - 14}, 58.5 ${endY - 7}, 59.5 ${endY} C 60.5 ${endY + 5}, 67 ${endY + 5}, 67.5 ${endY - 1}`;
  }
  return `M60 52 C 58.8 ${52 + (endY - 52) * 0.45}, 58.6 ${52 + (endY - 52) * 0.8}, 59.4 ${endY}`;
}

/** 头顶嫩芽 (baby 单叶 / young 双叶) */
function Sprout({ twin }: { twin: boolean }) {
  return (
    <g>
      <path d="M60 24 C 60 20, 60 17, 60 14.5" stroke="#4E8A67" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx="56.2" cy="13" rx="4.6" ry="3" fill="#6FBF92" transform="rotate(-28 56.2 13)" />
      {twin && <ellipse cx="63.8" cy="13" rx="4.6" ry="3" fill="#8FD3AC" transform="rotate(28 63.8 13)" />}
    </g>
  );
}

/** 星星发夹 (young) — 唯一允许的金色点缀, 别在右耳上 */
function StarPin() {
  return (
    <path
      d="M84 36 L85.4 39.4 L89 39.8 L86.3 42.1 L87.1 45.6 L84 43.7 L80.9 45.6 L81.7 42.1 L79 39.8 L82.6 39.4 Z"
      fill="#F2C94C" stroke="#D9AF2E" strokeWidth="0.6" strokeLinejoin="round"
    />
  );
}

/** 象牙 (adult) — 小而圆润, 象征成熟的力量 */
function Tusks() {
  return (
    <g fill="#F6FBF3">
      <path d="M52.5 62 C 51 66, 51.5 69.5, 54 71 C 54.6 68, 54.4 64.5, 55 62.6 Z" />
      <path d="M67.5 62 C 69 66, 68.5 69.5, 66 71 C 65.4 68, 65.6 64.5, 65 62.6 Z" />
    </g>
  );
}

/** 叶形领巾 (adult) — 与勋章卡同语言的一片横叶 (深绿, 与浅色肚皮强对比) */
function LeafScarf() {
  return (
    <g>
      <path
        d="M41 90 C 50 83.5, 70 83.5, 79 90 C 70 96.5, 50 96.5, 41 90 Z"
        fill="#2F7A57"
      />
      <path d="M45 90 L75 90" stroke="#1E563D" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

/** 守护长老披风: 松绿大披风 + 叶脉, 穿在身后 (荣誉配饰, 非权威权杖) */
function GuardianCape() {
  return (
    <g>
      <path
        d="M30 72 C 25 90, 30 103, 40 108 L 80 108 C 90 103, 95 90, 90 72 C 79 79, 41 79, 30 72 Z"
        fill={PINE}
      />
      {/* 叶脉 — 让披风读作"一片大叶" */}
      <path d="M60 77 L60 106" stroke="#2E5C45" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M60 85 L46 81 M60 85 L74 81 M60 95 L45 90 M60 95 L75 90" stroke="#2E5C45" strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

/** 莲花胸针 (elder) — 沉静智慧, 承接旧版 elder 的莲花意象 */
function LotusPin() {
  return (
    <g transform="translate(60 84)">
      <ellipse cx="-4.6" cy="0" rx="3.4" ry="4.4" fill="#F4CFDD" transform="rotate(-24)" />
      <ellipse cx="4.6" cy="0" rx="3.4" ry="4.4" fill="#F4CFDD" transform="rotate(24)" />
      <ellipse cx="0" cy="-0.6" rx="3" ry="4.6" fill="#FBE3EC" />
    </g>
  );
}

/**
 * 小象主体 — memo: growthStage 是稳定 enum, 头像在 tab 内高频父级渲染
 */
export const SymyAvatar = memo(function SymyAvatar({ growthStage, animate = true, className = '' }: SymyAvatarProps) {
  const breatheClass = animate ? 'animate-buddy-breathe' : '';
  const v = STAGE_VISUAL[growthStage];
  // 脚底锚点 (60,108): 缩放后小象始终站在同一地面线, 只向头顶方向长大
  const grounded = `translate(60 108) scale(${v.scale}) translate(-60 -108)`;

  // owner 09-06: 2.5D AI 图为主 (恢复立体质感), 阶段配饰 SVG 叠加层, 加载失败降级到纯 SVG
  const [pngFailed, setPngFailed] = useState(false);
  const stageImage = STAGE_PNG[growthStage];

  return (
    <div
      className={`w-full h-full flex items-center justify-center ${breatheClass} ${className}`}
      aria-hidden="true"
    >
      {!pngFailed && stageImage ? (
        <img
          src={stageImage}
          alt=""
          onError={() => setPngFailed(true)}
          className="w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(20,53,39,0.45)]"
          style={{ transform: `scale(${v.pngScale})` }}
        />
      ) : (
      <svg viewBox="13 12 94 104" className="w-full h-full" role="presentation" focusable="false">
        <g transform={grounded}>
          {/* elder: 披风在最底层 */}
          {growthStage === 'elder' && <GuardianCape />}

          {/* 耳朵 (头后) */}
          <ellipse cx={60 - v.headR - v.ear.rx + 6} cy="46" rx={v.ear.rx} ry={v.ear.ry} fill={v.bodyDark} stroke={PINE} strokeWidth="1.5" />
          <ellipse cx={60 + v.headR + v.ear.rx - 6} cy="46" rx={v.ear.rx} ry={v.ear.ry} fill={v.bodyDark} stroke={PINE} strokeWidth="1.5" />
          <ellipse cx={60 - v.headR - v.ear.rx + 6} cy="47" rx={v.ear.rx * 0.52} ry={v.ear.ry * 0.55} fill="#F3D9CE" />
          <ellipse cx={60 + v.headR + v.ear.rx - 6} cy="47" rx={v.ear.rx * 0.52} ry={v.ear.ry * 0.55} fill="#F3D9CE" />

          {/* 身体 + 腿 */}
          <ellipse cx="60" cy="90" rx="21" ry="17" fill={v.body} stroke={PINE} strokeWidth="1.5" />
          <rect x="47.5" y="96" width="10" height="12" rx="4.5" fill={v.bodyDark} stroke={PINE} strokeWidth="1.5" />
          <rect x="62.5" y="96" width="10" height="12" rx="4.5" fill={v.bodyDark} stroke={PINE} strokeWidth="1.5" />
          {/* 肚皮 */}
          <ellipse cx="60" cy="93" rx="12.5" ry="11" fill="#EAF6EE" />

          {/* adult: 领巾压在身体上、头之前由头部遮挡上缘 */}
          {growthStage === 'adult' && <LeafScarf />}

          {/* 头 */}
          <circle cx="60" cy="50" r={v.headR} fill={v.body} stroke={PINE} strokeWidth="1.5" />

          {/* 象鼻 — 粗圆stroke, 头正中垂下 */}
          <path
            d={trunkPath(v.trunkEndY, v.trunkCurl)}
            stroke={v.bodyDark}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={trunkPath(v.trunkEndY, v.trunkCurl)}
            stroke={v.body}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            opacity="0.55"
          />

          {/* adult: 象牙在鼻根两侧 */}
          {growthStage === 'adult' && <Tusks />}

          {/* 眼睛 — 大圆眼 + 双高光 (松绿瞳) */}
          <circle cx={60 - v.headR * 0.36} cy="47" r="3.8" fill={PINE} />
          <circle cx={60 + v.headR * 0.36} cy="47" r="3.8" fill={PINE} />
          <circle cx={60 - v.headR * 0.36 + 1.2} cy="45.7" r="1.3" fill="#FFFFFF" />
          <circle cx={60 + v.headR * 0.36 + 1.2} cy="45.7" r="1.3" fill="#FFFFFF" />

          {/* 腮红 — 熊二式温度 */}
          <circle cx={60 - v.headR * 0.56} cy="54.5" r="3.4" fill="#F3C6BC" opacity="0.75" />
          <circle cx={60 + v.headR * 0.56} cy="54.5" r="3.4" fill="#F3C6BC" opacity="0.75" />

          {/* 配饰 (头顶/耳上) */}
          {(growthStage === 'baby' || growthStage === 'young') && <Sprout twin={growthStage === 'young'} />}
          {growthStage === 'young' && <StarPin />}
          {growthStage === 'elder' && <LotusPin />}
        </g>
      </svg>
      )}
    </div>
  );
});
