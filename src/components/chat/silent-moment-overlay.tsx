'use client';

/**
 * SilentMomentOverlay — 挑战结束后的"沉默时刻"
 *
 * 🔧 需求九: 用户点击 "I saw it" / "I choose to buy" 后,
 *    先显示 2 秒全屏沉默时刻, 再显示 Deposit 选择卡 (或直接结束, buy 路径)。
 *
 * 设计:
 *   - 全屏覆盖, 纯色背景 (暗色模式深灰, 亮色模式米白)
 *   - 文字居中, 大留白
 *   - 打字机效果 (一个字一个字出现, 增加重量感)
 *   - 显示 ~2 秒后自动淡出
 *   - 无按钮、无交互 — 纯仪式
 *
 * 文案 (根据挑战结果动态生成):
 *   - saw (不买): "You saw it. / $X stays in your life. / This isn't saved money. / This is time reclaimed."
 *   - bought (清醒地买): "You saw the cost. / $X · Y hours of life. / You still want it. / You choose freely."
 *
 * 镜子哲学: 不评判。看见之后, 用户自己决定。这段沉默是让"看见"沉淀的仪式。
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/provider';

export type SilentMomentOutcome = 'saw' | 'bought';

export interface SilentMomentOverlayProps {
  /** 挑战结果: saw = 用户不买 (看见), bought = 用户清醒地买 */
  outcome: SilentMomentOutcome;
  /** 挑战金额 */
  amount: number;
  /** 物品名 (仅用于日志, 不显示) */
  itemName?: string;
  /** 生命小时数 (用于 bought 文案) */
  hoursOfLife: number;
  /** 沉默时刻结束后回调 (父组件显示 DepositDialog 或结束流程) */
  onComplete: () => void;
}

// 🔧 每行逐字出现的间隔 (ms)。总时长约 2 秒。
const CHAR_INTERVAL_MS = 45;
// 🔧 全部文字打完后, 停留时长 (ms), 让用户感受"看见"
const HOLD_DURATION_MS = 700;
// 🔧 淡出动画时长 (ms)
const FADE_OUT_DURATION_MS = 600;

export function SilentMomentOverlay({
  outcome,
  amount,
  hoursOfLife,
  onComplete,
}: SilentMomentOverlayProps) {
  const { t, locale } = useI18n();
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 构造文案 (根据 outcome) — 🔧 P2-1 fix: use i18n keys instead of hardcoded strings
  const lines: string[] = (() => {
    const amountStr = `$${amount.toFixed(0)}`;
    const hoursStr = hoursOfLife < 1
      ? t('chat.lifeMinutes', { minutes: String(Math.round(hoursOfLife * 60)) })
      : t('chat.lifeHours', { hours: hoursOfLife.toFixed(1) });

    if (outcome === 'saw') {
      return [
        t('chat.silentMomentSawLine1', { defaultValue: 'You saw it.' }),
        t('chat.silentMomentSawLine2', { defaultValue: '{amount} stays in your life.', amount: amountStr }),
        t('chat.silentMomentSawLine3', { defaultValue: "This isn't saved money." }),
        t('chat.silentMomentSawLine4', { defaultValue: 'This is time reclaimed.' }),
        t('chat.silentMomentSawElephant', { defaultValue: '🐘 Symy happily swung its trunk ✨' }),
      ];
    }
    // bought
    return [
      t('chat.silentMomentBoughtLine1', { defaultValue: 'You saw the cost.' }),
      t('chat.silentMomentBoughtLine2', { defaultValue: '{amount} · {hours} of life.', amount: amountStr, hours: hoursStr }),
      t('chat.silentMomentBoughtLine3', { defaultValue: 'You still want it.' }),
      t('chat.silentMomentBoughtLine4', { defaultValue: 'You choose freely.' }),
      t('chat.silentMomentBoughtElephant', { defaultValue: '🐘 Symy nodded understandingly 🙂' }),
    ];
  })();

  // 🔧 打字机效果: 逐行逐字显示
  // 🔧 ARCH fix Round 74 (Finding 12): Track ALL timer IDs in a Set for complete cleanup.
  //    旧代码: 只 clearTimeout(startTimer), HOLD/FADE 递归 setTimeout 未追踪 →
  //    卸载后这些 timer 仍 fire (cancelled flag 防崩溃, 但 timer 泄漏到下次 tick).
  //    根因修复: trackedTimers Set 统一管理所有 setTimeout, cleanup 时全部清除.
  useEffect(() => {
    let cancelled = false;
    let charIndex = 0;
    let lineIndex = 0;
    const trackedTimers = new Set<ReturnType<typeof setTimeout>>();

    const trackedSetTimeout = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
      const id = setTimeout(() => {
        trackedTimers.delete(id);
        if (!cancelled) fn();
      }, ms);
      trackedTimers.add(id);
      return id;
    };

    const typeNext = () => {
      if (cancelled) return;
      if (lineIndex >= lines.length) {
        // 全部打完 → 停留 → 淡出 → 完成
        trackedSetTimeout(() => {
          if (cancelled) return;
          setIsFadingOut(true);
          trackedSetTimeout(() => {
            if (cancelled) return;
            onCompleteRef.current();
          }, FADE_OUT_DURATION_MS);
        }, HOLD_DURATION_MS);
        return;
      }
      const currentLine = lines[lineIndex];
      if (charIndex >= currentLine.length) {
        // 当前行打完 → 下一行
        // 🔧 REVIEW-1 M4 fix: 不 append 完整行 (最后一拍 partial 已是完整行, append 会重复)
        //    下一行的第一个字符会 push 新 entry
        lineIndex++;
        charIndex = 0;
        // 行间小停顿 (让用户感受换行)
        trackedSetTimeout(typeNext, CHAR_INTERVAL_MS * 4);
        return;
      }
      // 逐字增加 (一次加 1-2 字, 加快节奏但保留重量感)
      const charsPerTick = charIndex === 0 ? 1 : 2; // 行首慢一点
      const nextCharIndex = Math.min(charIndex + charsPerTick, currentLine.length);
      const partialLine = currentLine.slice(0, nextCharIndex);
      setVisibleLines(prev => {
        const copy = [...prev];
        if (copy.length <= lineIndex) copy.push('');
        copy[lineIndex] = partialLine;
        return copy;
      });
      charIndex = nextCharIndex;
      trackedSetTimeout(typeNext, CHAR_INTERVAL_MS);
    };

    // 启动打字 (稍延迟, 让覆盖层先淡入)
    const startTimer = trackedSetTimeout(typeNext, 250);
    return () => {
      cancelled = true;
      // 🔧 ARCH fix Round 74: Clear ALL tracked timers (not just startTimer)
      trackedTimers.forEach(id => clearTimeout(id));
      trackedTimers.clear();
      void startTimer; // startTimer is already in trackedTimers, no separate clearTimeout needed
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, amount, hoursOfLife, locale]);

  return createPortal(
    <div
      // 🔧 ARCH fix Round 74 (Finding 3): z-[310] (above AhaMomentOnboarding z-[300]).
      //    旧代码: 两者都用 z-[300], onChallengeCompleted 同时触发 → 两个全屏覆盖重叠.
      //    根因修复 (本层): SilentMomentOverlay 用 z-[310] 确保在 AhaMoment 之上.
      //    根因修复 (时序层): onChallengePassed 推迟到 onComplete (见 chat-tab.tsx),
      //    所以 AhaMoment 不会在 SilentMoment 显示期间出现, 但 z-index 仍分层防边缘情况.
      className={`fixed inset-0 z-[310] flex items-center justify-center transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        // 🔧 纯色背景: 暗色模式深灰, 亮色模式米白 (用 CSS 变量适配主题)
        backgroundColor: 'var(--surface-1, #0a0a0f)',
      }}
      aria-live="polite"
      aria-label={outcome === 'saw' ? 'Silent moment of seeing' : 'Silent moment of choosing'}
      role="dialog"
    >
      <div className="text-center px-8 max-w-md">
        <div className="space-y-5">
          {lines.map((fullLine, idx) => (
            <p
              key={idx}
              className={`leading-relaxed transition-opacity duration-300 ${
                visibleLines[idx] ? 'opacity-100' : 'opacity-0'
              } ${
                idx === 0
                  ? 'text-2xl font-bold text-text-primary'
                  : idx === lines.length - 1
                    ? 'text-lg font-medium text-cyan-400/90'
                    : 'text-base text-text-secondary'
              }`}
            >
              {visibleLines[idx] || ''}
              {/* 打字机光标 — 当前行显示闪烁光标 */}
              {visibleLines[idx] && visibleLines[idx].length < fullLine.length && (
                <span className="inline-block w-0.5 h-5 ml-0.5 bg-cyan-400 animate-pulse" />
              )}
            </p>
          ))}
        </div>
      </div>
      {/* 隐藏的 aria 描述, 供屏幕阅读器 */}
      <span className="sr-only">
        {outcome === 'saw'
          ? t('chat.silentMomentSawDesc', { defaultValue: 'A moment to let the seeing settle.' })
          : t('chat.silentMomentBoughtDesc', { defaultValue: 'A moment to let the choosing settle.' })}
      </span>
    </div>,
    document.body
  );
}
