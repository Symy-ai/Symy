'use client';

/**
 * SettingsBasicSection — 设置页默认区 (batch95-a 小白三问减法重设计)
 *
 * owner 09-20 令: 设置太复杂, 假设用户是小白。默认只露答完「小白三问」
 * 所需的核心行: 显示昵称 / 绿色守护总开关 / 通知推送 / 深色模式 / 帮助与反馈,
 * 外加物品清单查看卡 (BP p12 画像露出面, lane 判断保留默认区, 非第 7 项)。
 * 其余全部收纳进 settings-advanced-section.tsx 的「高级设置」折叠区。
 *
 * 本文件只做搬运, 行为零变化; 组件内部逻辑一律不动。
 */

import { User, ChevronRight, Moon, Leaf, HelpCircle, MessageSquare } from 'lucide-react';
import { SettingToggle, SettingLink } from '@/components/profile-parts/setting-components';
import { PushNotificationSettings } from '../push-notification-settings';
// 🗂️ batch84-a: 物品清单查看卡 — BP p12 数据飞轮第②环「画像」露出面 (只读+删除, 无手动添加)
import { InventoryListCard } from '@/components/profile-parts/inventory-list-card';

type TFunc = (key: string, opts?: { defaultValue?: string }) => string;

interface SettingsBasicSectionProps {
  isDemo: boolean;
  hasCustomName: boolean;
  displayName: string;
  onClose: () => void;
  onOpenDisplayNameDialog: () => void;
  /** 🌱 绿色守护模式 — 荣誉开关 (默认开) */
  greenPrefEnabled: boolean;
  onToggleGreenPref: () => void;
  darkMode: boolean;
  resolvedTheme: string | undefined;
  onToggleDarkMode: () => void;
  onOpenFaqDialog: () => void;
  t: TFunc;
}

export function SettingsBasicSection({ isDemo, hasCustomName, displayName, onClose, onOpenDisplayNameDialog, greenPrefEnabled, onToggleGreenPref, darkMode, resolvedTheme, onToggleDarkMode, onOpenFaqDialog, t }: SettingsBasicSectionProps) {
  return (
    <>
      {/* 🔧 P2-3 fix: Display Name Setting */}
      <button onClick={() => { onClose(); onOpenDisplayNameDialog(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors text-left">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted"><User className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.displayNameDialogTitle')}</p>
          <p className="text-xs text-text-tertiary truncate">{hasCustomName ? displayName : t('profile.setDisplayNameBtn')}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
      </button>

      {/* 🌱 绿色守护模式 — 荣誉开关 (默认开)。说明行写清里子: 开启时小象帮拦冲动消费,
          每次守护都是真实省下的钱 (自由小时); 关闭提示只讲功能后果, 无道德审判。
          🧭 batch68-b: guard-anchor-chat = 总控索引「对话守护」组跳转落点 */}
      <div id="guard-anchor-chat" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
        <SettingToggle
          icon={<Leaf className="w-4 h-4" />}
          label={t('profile.greenPrefTitle')}
          description={t('profile.greenPrefDesc')}
          enabled={greenPrefEnabled}
          onToggle={onToggleGreenPref}
        />
        {!greenPrefEnabled && (
          <p className="pl-[60px] pr-3 -mt-1 pb-1 text-xs text-text-tertiary italic">
            {t('profile.greenPrefOffNote')}
          </p>
        )}
      </div>

      {/* 🔧 BUG-2 fix: 推送通知从主体页面移入设置 overlay */}
      {/* 🔧 BUG-3 fix: 删除旧 SettingToggle (重复文案), 用 PushNotificationSettings 组件替代
          🧭 batch68-b: guard-anchor-push = 总控索引「推送守护」组跳转落点 */}
      <div id="guard-anchor-push" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
        <PushNotificationSettings t={t} isDemo={isDemo} />
      </div>

      <SettingToggle
        icon={<Moon className="w-4 h-4" />}
        label={t('profile.darkMode')}
        description={darkMode ? t('profile.darkModeOn') : t('profile.lightModeOn')}
        enabled={darkMode}
        onToggle={onToggleDarkMode}
        disabled={!resolvedTheme}
      />

      {/* 帮助与反馈 — FAQ + 反馈合并一个区块 (batch95-a 默认区第 5 项) */}
      <div className="rounded-xl border border-glass-border divide-y divide-glass-border overflow-hidden">
        <SettingLink
          icon={<HelpCircle className="w-4 h-4" />}
          label={t('profile.helpFaq')}
          description={t('profile.helpFaqDesc')}
          onClick={() => { onClose(); onOpenFaqDialog(); }}
        />
        <SettingLink
          icon={<MessageSquare className="w-4 h-4" />}
          label={t('profile.sendFeedback')}
          description={t('profile.sendFeedbackDesc')}
          onClick={() => { window.open('mailto:hcl.mygtt@gmail.com?subject=Symy%20Feedback', '_blank', 'noopener,noreferrer'); }}
        />
      </div>

      {/* 🗂️ batch84-a: 物品清单查看卡 (BP p12 飞轮第②环) — batch95-a lane 判断:
          物品清单是画像露出面, 保留默认区; demo 模式不挂 (无真实清单数据) */}
      {!isDemo && <InventoryListCard />}
    </>
  );
}
