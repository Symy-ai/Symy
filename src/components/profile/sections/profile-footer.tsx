'use client';

import { useI18n } from '@/i18n/provider';

interface ProfileFooterProps {
  /** user?.created_at */
  createdAt?: string;
  locale: string;
  onOpenAbout: () => void;
}

/**
 * Member Since footer + About Symy 入口
 * (原为 profile-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 */
export function ProfileFooter({ createdAt, locale, onOpenAbout }: ProfileFooterProps) {
  const { t } = useI18n();
  return (
    <div className="text-center pt-4 pb-2">
      {/* 🔧 P1-13 fix: 用 i18n 插值让日期嵌入句子中间 — 旧代码 "你从" + 日期 = 不完整句子 */}
      <p className="text-[10px] text-text-tertiary">
        {createdAt
          ? t('profile.memberSince', {
              date: new Date(createdAt).toLocaleDateString(
                locale === 'zh' ? 'zh-CN' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' }
              ),
              defaultValue: `You started buying yourself back ${new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            })
          : t('profile.memberSince', { date: '2025', defaultValue: 'You started buying yourself back 2025' })}
      </p>
      {/* 🔧 PM-#24 fix: footer 按钮文案改为明确的 "About Symy" (旧文案 "symy.ai · You already know" 像页脚文本, 用户不知道可点击)
          点击行为保持: 弹出 AboutModal (关于我们) */}
      <button
        onClick={onOpenAbout}
        className="text-[10px] text-text-tertiary mt-1 hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-center gap-1"
        aria-label={t('profile.aboutSymy', { defaultValue: 'About Symy' })}
      >
        {t('profile.aboutSymy', { defaultValue: 'About Symy' })}
        <span className="text-text-tertiary/60">·</span>
        <span className="italic">{t('profile.footerTagline', { defaultValue: 'You already know.' })}</span>
      </button>
    </div>
  );
}
