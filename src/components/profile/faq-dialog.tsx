'use client';

/**
 * FaqDialog — "What's unclear" 帮助对话框 (PM-#28 fix)
 *
 * 🔧 PM-#28 fix: 旧代码 "What's unclear" 按钮跳转 /#faq 锚点, 但页面无 FAQ section → 死链
 *   修复: 改为弹出此对话框, 解释 Symy 核心概念
 *
 * 🐘 batch7-c: 概念课从旧哲学词汇换成守护体系真实概念 —
 *   守护挑战(绿门) / 绿色替代 / 守护勋章 / 梦想基金 / 每日仪式 / Symy 小象,
 *   每个概念在 app 内都有真实功能对应 (挑战流 / 购物绿色排序 / 徽章墙 /
 *   guard-to-dream 转存 / daily-ritual-overlay / Letta 小象人设)
 *
 * 荣誉框架: 解释产品概念, 而非营销话术; 荣誉非羞辱, 绝不评判
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

interface FaqDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FaqDialog({ open, onClose }: FaqDialogProps) {
  const { t } = useI18n();

  // ESC 键关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const faqs = [
    {
      q: t('profile.faqGuardTitle', { defaultValue: 'What is a guardian challenge?' }),
      a: t('profile.faqGuardDesc', {
        defaultValue:
          'When an impulse to buy shows up, Symy holds it at the green gate with you: pause for a moment, look at the real cost, then decide. Guard the gate and the money stays with you — buy anyway, and Symy stays with you too. No judgment, ever.',
      }),
    },
    {
      q: t('profile.faqGreenSwapTitle', { defaultValue: 'What are greener swaps?' }),
      a: t('profile.faqGreenSwapDesc', {
        defaultValue:
          'Before you check out, Symy lines up greener options that do the same job — durable instead of disposable, refillable instead of single-use. You still get what you need; the planet gets a break.',
      }),
    },
    {
      q: t('profile.faqMedalTitle', { defaultValue: 'What are Guardian Marks?' }),
      a: t('profile.faqMedalDesc', {
        defaultValue:
          "Every choice you guard earns a mark — intercepts, streaks, milestones. They're honor, not homework: collect them, watch them add up, and show them off.",
      }),
    },
    {
      q: t('profile.faqDreamFundTitle', { defaultValue: 'What are Dream Funds?' }),
      a: t('profile.faqDreamFundDesc', {
        defaultValue:
          'Dream Funds are where your guarded money goes. Each time you guard a purchase, that amount moves toward a goal you actually care about — paying off debt, a trip, savings.',
      }),
    },
    {
      q: t('profile.faqRitualTitle', { defaultValue: 'What is the daily ritual?' }),
      a: t('profile.faqRitualDesc', {
        defaultValue:
          'Once a day, your little elephant has a few words for you — a quiet minute to stand guard together. Keep the ritual going and your green streak keeps growing.',
      }),
    },
    {
      q: t('profile.faqSymyTitle', { defaultValue: 'Who is Symy?' }),
      a: t('profile.faqSymyDesc', {
        defaultValue:
          'Symy is your AI green-shopping companion — a little elephant standing guard with you and the planet. Every choice you guard makes it stronger, and every win is worth a happy trunk dance.',
      }),
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-glass-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-glass-border flex-shrink-0">
          <h2 className="text-base font-bold text-text-primary">
            {t('profile.faqDialogTitle', { defaultValue: 'Understanding Symy' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-glass-hover cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FAQ list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {faqs.map((faq, i) => (
            <div key={i} className="space-y-1.5">
              <h3 className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                {faq.q}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}

          {/* 底部鼓励语 */}
          <div className="pt-3 border-t border-glass-border">
            <p className="text-xs text-text-tertiary italic text-center">
              {t('profile.faqFooter', {
                defaultValue: 'Still unclear? Talk to Symy — just say "I\'m confused."',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
