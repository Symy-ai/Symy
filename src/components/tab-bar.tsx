/**
 * Tab Bar — Bottom navigation bar with glassmorphism
 *
 * Round 105: 3-tab architecture (Buddy / Defense Net / Me)
 *    Mirror 入口在 Buddy 页面的 "看见" 按钮
 *    Gacha 入口在 Buddy 页面 (替换原 Pet Symy 位置)
 *    Pet Symy 移到点击头像打开详情时触发
 */

'use client';

import { useI18n } from '@/i18n/provider';
import type { TabId } from '@/lib/tab-registry';

/**
 * 🔧 ARCH fix: Tab type 从 @/lib/tab-registry 导入, re-export 保持外部兼容。
 *    外部代码仍可 `import type { Tab } from '@/components/tab-bar'`。
 */
export type Tab = TabId;

interface TabBarProps {
  activeTab: Tab;
  previousTab: Tab;
  onTabClick: (tab: Tab) => void;
}

export function TabBar({ activeTab, previousTab, onTabClick }: TabBarProps) {
  const { t } = useI18n();

  // Round 105: 3 tabs — Mirror/Gacha moved to Buddy page entries
  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: t('tabs.chat') },
    { id: 'buddy', label: t('tabs.buddy') },
    { id: 'defense', label: t('tabs.defense') },
    { id: 'profile', label: t('tabs.profile') },
  ];

  const isActiveTab = (tabId: Tab) => {
    return (activeTab === 'monitor' || activeTab === 'family' || activeTab === 'butterfly') ? previousTab === tabId : activeTab === tabId;
  };

  return (
    // 🔧 P2-12 fix: Floating bottom nav — 56px height (iOS HIG), rounded, doesn't fill full width.
    //    Old: 80px solid bar eating content space. New: floating pill with margin + shadow.
    //    Content area must add bottom padding (see page.tsx main scroll container).
    <div className="flex-shrink-0 px-3 pb-2 pb-safe">
      <nav
        className="flex items-center justify-around h-[52px] bg-surface-tabbar backdrop-blur-2xl border border-glass-border rounded-2xl shadow-lg shadow-black/10 dark:shadow-black/30"
        aria-label="Main navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-onboarding={`tab-${tab.id}`}
            onClick={() => {
              if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              onTabClick(tab.id);
            }}
            className={`flex items-center justify-center gap-1 px-5 h-[44px] min-w-[44px] rounded-xl transition-all duration-200 relative ${
              isActiveTab(tab.id)
                ? 'text-cyan-500 dark:text-cyan-400 bg-cyan-500/10'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            aria-label={tab.label}
            aria-current={isActiveTab(tab.id) ? 'page' : undefined}
          >
            {/* Round 95: spring bounce for active emoji */}
            <span
              key={isActiveTab(tab.id) ? 'active' : 'inactive'}
              className={`text-base ${isActiveTab(tab.id) ? 'tab-emoji-active' : ''}`}
              style={{
                transition: 'transform 0.3s var(--ease-spring)',
                transform: isActiveTab(tab.id) ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              {tab.label}
            </span>
            {/* Round 95: dot pop animation */}
            {isActiveTab(tab.id) && (
              <span
                key="dot"
                className="tab-dot-active absolute -bottom-0.5 left-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400"
                style={{ transform: 'translateX(-50%)' }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
