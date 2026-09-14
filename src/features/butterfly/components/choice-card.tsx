/**
 * ChoiceCard — 分岔路口选择卡片 (Round 96: 3D 翻转)
 *
 * 当故事到达关键分岔路口时，展示选择选项。
 * 设计原则：
 * - 不剧透未来，只给暗示
 * - 每个选项都有吸引力，让用户纠结
 * - 视觉上营造"命运岔路口"的氛围
 *
 * Round 96 升级:
 * - 选项被点击后, 整张卡片 rotateY(180deg) 翻转
 * - 反面显示"命运已定"神秘揭示 (✦ + 星轨粒子)
 * - 翻转使用 preserve-3d + backface-hidden
 * - 移动端触觉反馈 (navigator.vibrate)
 * - 支持 prefers-reduced-motion
 */

'use client';

import { useState, useRef, useEffect, memo } from 'react';
import type { ChoiceOption } from '../types';
import { useI18n } from '@/i18n/provider';

// ============================================================
// Round 96: 3D 翻转辅助 — 反面装饰粒子
// ============================================================
const FATE_PARTICLES = Array.from({ length: 8 }).map((_, i) => ({
  angle: (i / 8) * Math.PI * 2,
  radius: 22 + (i % 3) * 4,
  delay: i * 0.08,
  size: 1.5 + (i % 2) * 0.8,
}));

// ============================================================
// Props
// ============================================================

interface ChoiceCardProps {
  /** 选择提示文本 */
  prompt: string;
  /** 可选项 */
  options: ChoiceOption[];
  /** 选择回调 */
  onSelect: (optionId: string) => void;
  /** 是否禁用（选择中） */
  isDisabled?: boolean;
  /** 是否为亮色模式 */
  isLight?: boolean;
}

// ============================================================
// 组件
// ============================================================

// 🔧 TECH-DEBT-C: React.memo — choosing 阶段父组件因其他 state 重渲染时避免不必要重渲染
// props 稳定性已核实：onSelect 来自 player hook 的 useCallback，options/prompt 来自 useState currentChoice
export const ChoiceCard = memo(function ChoiceCard({
  prompt,
  options,
  onSelect,
  isDisabled = false,
  isLight = false,
}: ChoiceCardProps) {
  const { t } = useI18n();
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSelect = (optionId: string) => {
    if (isDisabled || selectedOption) return;
    setSelectedOption(optionId);
    // Round 96: 触觉反馈
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 30, 40]);
    }
    // 短暂延迟让 3D 翻转动画播放 (700ms 翻转 + 缓冲)
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onSelect(optionId);
    }, 850);
  };

  return (
    <div className="px-4 py-6 space-y-4">
      {/* 分隔线 + 蝴蝶图标 + 收起/展开按钮 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
        <button
          onClick={() => setIsCollapsed(prev => !prev)}
          className="flex items-center gap-1 cursor-pointer"
          aria-label={isCollapsed ? t('butterfly.expandChoices') : t('butterfly.collapseChoices')}
        >
          <span className="text-2xl" role="img" aria-label="gacha">
            🎰
          </span>
          <svg
            viewBox="0 0 16 16"
            className={`w-3 h-3 ${isLight ? 'text-purple-600' : 'text-purple-300'} transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
            fill="currentColor"
          >
            <path d="M8 11L3 6h10l-5 5z" />
          </svg>
        </button>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
      </div>

      {!isCollapsed && (
        <>
          {/* 选择提示 */}
          <div className="text-center">
            <p className={`text-sm ${isLight ? 'text-purple-700' : 'text-purple-200'} font-medium mb-1`}>
              {t('butterfly.crossroadsPrompt')}
            </p>
            <p className={`${isLight ? 'text-gray-800' : 'text-gray-200'} text-[15px] leading-relaxed`}>
              {prompt}
            </p>
          </div>

          {/* 选项卡片 — Round 96: 3D 翻转 */}
          <div className="space-y-3" style={{ perspective: '1000px' }}>
            {options.map((option) => {
              const isSelected = selectedOption === option.id;
              const isOtherSelected = selectedOption && selectedOption !== option.id;
              const isHovered = hoveredOption === option.id;

              return (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  onMouseEnter={() => setHoveredOption(option.id)}
                  onMouseLeave={() => setHoveredOption(null)}
                  disabled={isDisabled || !!selectedOption}
                  className="relative w-full text-left rounded-2xl cursor-pointer disabled:cursor-not-allowed"
                  style={{
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.7s var(--ease-spring), opacity 0.3s ease',
                    transform: isSelected
                      ? 'rotateY(180deg) scale(1.02)'
                      : isOtherSelected
                        ? 'scale(0.94)'
                        : isHovered
                          ? 'scale(1.01) translateZ(10px)'
                          : 'scale(1)',
                    opacity: isOtherSelected ? 0.4 : 1,
                  }}
                >
                  {/* ===== 正面 (选项内容) ===== */}
                  <div
                    className={`absolute inset-0 rounded-2xl border-2 p-4 backface-hidden ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-400/10 shadow-lg shadow-cyan-400/20'
                        : isHovered
                          ? 'border-purple-400/60 bg-purple-400/5 shadow-md shadow-purple-400/10'
                          : isLight
                            ? 'border-gray-300/40 bg-white/30'
                            : 'border-gray-600/40 bg-gray-800/30'
                    }`}
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                    aria-hidden={isSelected ? 'true' : undefined}
                  >
                    <div className="flex items-start gap-3">
                      {/* 选项标识 */}
                      <div
                        className={`
                          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          transition-colors duration-300
                          ${isSelected
                            ? 'bg-cyan-400 text-gray-900'
                            : isHovered
                              ? 'bg-purple-400/20 text-purple-300'
                              : isLight
                                ? 'bg-gray-200/50 text-gray-500'
                                : 'bg-gray-700/50 text-gray-400'
                          }
                        `}
                      >
                        {option.id}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* 选项标题 */}
                        <div
                          className={`
                            font-medium mb-1 transition-colors duration-300
                            ${isSelected
                              ? 'text-cyan-600'
                              : isHovered
                                ? isLight ? 'text-purple-700' : 'text-purple-200'
                                : isLight
                                  ? 'text-gray-800'
                                  : 'text-gray-200'
                            }
                          `}
                        >
                          {option.label}
                        </div>

                        {/* 选项暗示 */}
                        <div className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'} italic`}>
                          {option.hint}
                        </div>
                      </div>

                      {/* Hover 提示箭头 (未选中时) */}
                      {!selectedOption && (
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                          <svg className={`w-3 h-3 ${isLight ? 'text-purple-600' : 'text-purple-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ===== 反面 (命运揭示) — rotateY(180deg) 让反面在翻转后正面朝向用户 ===== */}
                  <div
                    className="absolute inset-0 rounded-2xl border-2 border-cyan-400/70 bg-gradient-to-br from-cyan-500/15 via-purple-500/10 to-cyan-500/15 p-4 backface-hidden shadow-2xl shadow-cyan-400/30 overflow-hidden"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                    aria-hidden={!isSelected ? 'true' : undefined}
                  >
                    {/* 反面装饰: 星轨粒子 */}
                    <div className="absolute inset-0 pointer-events-none">
                      {FATE_PARTICLES.map((p, i) => (
                        <span
                          key={i}
                          className="absolute rounded-full bg-cyan-300"
                          style={{
                            width: `${p.size}px`,
                            height: `${p.size}px`,
                            left: '50%',
                            top: '50%',
                            transform: `translate(-50%, -50%) translate(${Math.cos(p.angle) * p.radius * 3}px, ${Math.sin(p.angle) * p.radius * 3}px)`,
                            opacity: 0,
                            animation: isSelected ? `fate-particle-in 0.6s var(--ease-out-expo) ${0.3 + p.delay}s forwards` : 'none',
                            boxShadow: '0 0 6px rgba(34,211,238,0.8)',
                          }}
                        />
                      ))}
                    </div>
                    {/* 中心 ✦ 标记 */}
                    <div className="relative h-full flex flex-col items-center justify-center gap-1">
                      <div
                        className="text-2xl text-cyan-300"
                        style={{
                          animation: isSelected ? 'fate-symbol-in 0.6s var(--ease-spring) 0.3s backwards' : 'none',
                          textShadow: '0 0 12px rgba(34,211,238,0.7), 0 0 24px rgba(168,85,247,0.4)',
                        }}
                      >
                        ✦
                      </div>
                      <div
                        className={`text-xs font-medium tracking-widest uppercase ${isLight ? 'text-cyan-700' : 'text-cyan-200'}`}
                        style={{ animation: isSelected ? 'fate-text-in 0.5s var(--ease-out-expo) 0.5s backwards' : 'none' }}
                      >
                        {t('butterfly.fateSealed', { defaultValue: 'Fate Sealed' })}
                      </div>
                    </div>
                  </div>

                  {/* 占位元素维持高度 (因正面/反面都是 absolute) — 用真实内容保证高度一致 */}
                  <div className="invisible p-4 pointer-events-none" aria-hidden>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium mb-1">{option.label}</div>
                        <div className="text-xs italic">{option.hint}</div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 底部提示 */}
          <p className={`text-center text-[11px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
            {t('butterfly.chooseWisely')}
          </p>
        </>
      )}

      {isCollapsed && (
        <div className="text-center">
          <p className={`text-sm ${isLight ? 'text-purple-600' : 'text-purple-300/60'} italic`}>
            {t('butterfly.tapToSeeChoices')}
          </p>
        </div>
      )}
    </div>
  );
});
