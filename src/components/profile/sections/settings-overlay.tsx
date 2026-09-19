'use client';

import { useState } from 'react';
import { ChevronLeft, User, ChevronRight, Shield, Moon, Globe, CreditCard, HelpCircle, MessageSquare, Leaf, Wind, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { LOCALES, type Locale } from '@/i18n/config';
import { SettingToggle, SettingLink } from '@/components/profile-parts/setting-components';
import { EmailConnectionSetting } from '../profile-parts';
import { PushNotificationSettings } from '../push-notification-settings';
import { DeleteAccountButton } from '../delete-account-button';
import { GreenImpactDashboard } from '@/components/profile-parts/green-impact-dashboard';
// 🗂️ batch84-a: 物品清单查看卡 — BP p12 数据飞轮第②环「画像」露出面 (只读+删除, 无手动添加)
import { InventoryListCard } from '@/components/profile-parts/inventory-list-card';
import type { EmailConnection } from '@/lib/supabase';
import { useGreenPrefs, type Intensity, type Wording, type PushTheme } from '@/hooks/use-green-prefs';
// 🛡️ batch48-a: 守护强度三档 (gentle/balanced/strict) — localStorage 持久化, 零 DDL
import { GuardIntensitySetting } from './guard-intensity-setting';
import { GuardScopeSetting } from './guard-scope-setting';
// 🌙 batch49-a: 我的深夜时段四档 (early/standard/nightOwl/off) — localStorage 持久化, 零 DDL
import { NightWindowSetting } from './night-window-setting';
// 💰 batch51-b: 我的时间价值 — 预设档 + 自定义时薪, useHourlyRate 共享通道持久化
import { TimeValueSetting } from './time-value-setting';
// 📜 batch58-b: 守护档案 — 配置全貌 + 成果导出 (完整版自留含金额 / 分享版结构性无金额)
import { GuardProfileExportSetting } from './guard-profile-export-setting';
// 🧹 batch59-b: 守护数据管理 — 规模总览 + 分类清除 (轻装叙事) + 设置恢复默认
import { GuardDataManagementSetting } from './guard-data-management-setting';
// 🎚️ batch61-a: 我的守护风格向导 — 聚合既有四渠道, 草稿式一次生效, 零 DDL
import { GuardianStyleWizard } from './guardian-style-wizard';
// 🧭 batch68-b: 守护总控索引 — 设置页顶部一屏总览, 分组锚点跳转, 只读不挪项
import { GuardControlIndex } from './guard-control-index';
import { GuardPolicyPreviewSetting } from './guard-policy-preview-setting';
import { GuardRuleCoverageSetting } from './guard-rule-coverage-setting';
import { SpendingCapSetting } from '@/components/profile-parts/spending-cap-setting';

const INTENSITY_OPTIONS: { value: Intensity; labelEn: string; labelZh: string }[] = [
  { value: 'balanced', labelEn: 'Balanced', labelZh: '平衡' },
  { value: 'gentle', labelEn: 'Gentle', labelZh: '温和' },
  { value: 'firm', labelEn: 'Firm', labelZh: '坚决' },
  { value: 'lockdown', labelEn: 'Lockdown', labelZh: '锁定' },
];

const WORDING_OPTIONS: { value: Wording; labelEn: string; labelZh: string }[] = [
  { value: 'cheerful', labelEn: 'Cheerful', labelZh: '轻松鼓励' },
  { value: 'neutral', labelEn: 'Neutral', labelZh: '中性说明' },
  { value: 'direct', labelEn: 'Direct', labelZh: '直接提醒' },
];

const PUSH_OPTIONS: { value: PushTheme; labelEn: string; labelZh: string }[] = [
  { value: 'none', labelEn: 'Standard', labelZh: '标准' },
  { value: 'seasonal', labelEn: 'Seasonal', labelZh: '季节主题' },
  { value: 'guardian', labelEn: 'Guardian', labelZh: '守护季' },
];

function GreenPreferencesSection({ t, locale }: { t: (key: string, opts?: { defaultValue?: string }) => string; locale: string }) {
  const { prefs, setGreenPrefField, resetGreenPrefs } = useGreenPrefs();
  const [saving, setSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  const isZh = locale === 'zh';

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 220));
    setSaving(false);
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
        <Wind className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{t('profile.greenPrefsTitle', { defaultValue: 'Green Preferences' })}</p>
        <p className="text-xs text-text-tertiary mb-2">{t('profile.greenPrefsDesc', { defaultValue: 'Lock your preferred green level, wording, and push theme — Symy and your buddy will use the same setup everywhere.' })}</p>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-text-secondary">{t('profile.greenPrefsIntensityLabel', { defaultValue: 'Green intensity' })}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {INTENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGreenPrefField('intensity', opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${prefs.intensity === opt.value ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-secondary">{t('profile.greenPrefsWordingLabel', { defaultValue: 'Alternative wording' })}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WORDING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGreenPrefField('wording', opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${prefs.wording === opt.value ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-secondary">{t('profile.greenPrefsPushLabel', { defaultValue: 'Push green theme' })}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PUSH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGreenPrefField('pushTheme', opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${prefs.pushTheme === opt.value ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? '...' : t('profile.greenPrefsSave', { defaultValue: 'Save' })}
          </button>
          <button
            onClick={() => setLocked(!locked)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${locked ? 'border-cyan-500/60 bg-cyan-500/10 text-text-primary' : 'border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover'}`}
          >
            {locked ? t('profile.greenPrefsLocked', { defaultValue: 'Locked' }) : t('profile.greenPrefsUnlock', { defaultValue: 'Unlock' })}
          </button>
          <button
            onClick={() => setResetConfirmOpen(true)}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            {t('profile.greenPrefsResetLabel', { defaultValue: 'Reset green preferences' })}
          </button>
        </div>

        {resetConfirmOpen && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs font-medium text-text-primary">{t('profile.greenPrefsResetConfirm', { defaultValue: 'Reset all green preferences?' })}</p>
            <p className="text-[11px] text-text-tertiary mt-1">{t('profile.greenPrefsResetConfirmDesc', { defaultValue: 'We will clear your saved green preferences, cache, and demo data. Your account, orders, and honors are not affected.' })}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  resetGreenPrefs();
                  setResetConfirmOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-200 font-medium hover:bg-red-500/30 transition-colors cursor-pointer"
              >
                {t('profile.greenPrefsResetConfirmButton', { defaultValue: 'Yes, reset' })}
              </button>
              <button
                onClick={() => setResetConfirmOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-glass-border bg-glass-fill text-text-secondary hover:bg-glass-hover transition-colors cursor-pointer"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SettingsOverlayProps {
  isDemo: boolean;
  hasCustomName: boolean;
  displayName: string;
  onClose: () => void;
  onOpenDisplayNameDialog: () => void;
  /** 🌱 绿色守护模式 — 荣誉开关 (默认开) */
  greenPrefEnabled: boolean;
  onToggleGreenPref: () => void;
  emailConnections: EmailConnection[];
  onDisconnectEmail: (connectionId: string) => Promise<void>;
  onNavigateMonitor?: () => void;
  isEmailMonitorEnabled: boolean;
  showComingSoonToast: () => void;
  darkMode: boolean;
  resolvedTheme: string | undefined;
  onToggleDarkMode: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  showPremiumToastMsg: (msg: string) => void;
  onOpenFaqDialog: () => void;
}

/**
 * 🔧 ARCH fix Round 78: Settings overlay — opened via top-right gear icon
 * (原为 profile-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {showSettingsOverlay && <SettingsOverlay .../>}
 */
export function SettingsOverlay({ isDemo, hasCustomName, displayName, onClose, onOpenDisplayNameDialog, greenPrefEnabled, onToggleGreenPref, emailConnections, onDisconnectEmail, onNavigateMonitor, isEmailMonitorEnabled, showComingSoonToast, darkMode, resolvedTheme, onToggleDarkMode, locale, setLocale, showPremiumToastMsg, onOpenFaqDialog }: SettingsOverlayProps) {
  const { t } = useI18n();
  // 🎚️ batch61-a: 我的守护风格向导 — 设置页内二级 overlay, 关闭后回到原位
  const [showGuardianStyleWizard, setShowGuardianStyleWizard] = useState(false);
  return (
    <>
    <div className="fixed inset-0 z-[200] bg-surface-1 flex flex-col animate-tab-in max-w-md mx-auto">
      <div className="flex-shrink-0 flex items-center px-4 py-3 border-b border-glass-border">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">{t('common.back', { defaultValue: '← Back' })}</span>
        </button>
        <h2 className="text-base font-bold text-text-primary ml-4">{t('profile.settings', { defaultValue: 'Settings' })}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
        {/* 🧭 batch68-b: 守护总控索引 — 顶部一屏总览 (只读), 分组行锚点跳转到下文既有设置项 */}
        <GuardControlIndex greenGuardEnabled={greenPrefEnabled} />

        {/* 🔧 P2-3 fix: Display Name Setting */}
        <button onClick={() => { onClose(); onOpenDisplayNameDialog(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors text-left">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted"><User className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">{t('profile.displayNameDialogTitle')}</p>
            <p className="text-xs text-text-tertiary truncate">{hasCustomName ? displayName : t('profile.setDisplayNameBtn')}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        </button>

        {/* 💰 batch51-b: 我的时间价值 — 预设档 + 自定义 (钳制 1–500), 保存走 useHourlyRate 共享通道 */}
        <TimeValueSetting isDemo={isDemo} />

        {/* 🌱 绿色守护模式 — 荣誉开关 (默认开)。说明行写清里子: 开启时小象帮拦冲动消费,
            每次守护都是真实省下的钱 (自由小时); 关闭提示只讲功能后果, 无道德审判。
            🧭 batch68-b: guard-anchor-chat = 总控索引「对话守护」组跳转落点 */}
        <div id="guard-anchor-chat" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
          <SettingToggle
            icon={<Leaf className="w-4 h-4" />}
            label={t('profile.greenPrefTitle', { defaultValue: 'Green Guardian Mode' })}
            description={t('profile.greenPrefDesc', { defaultValue: 'Symy helps you pause impulse buys — every save is real money kept' })}
            enabled={greenPrefEnabled}
            onToggle={onToggleGreenPref}
          />
          {!greenPrefEnabled && (
            <p className="pl-[60px] pr-3 -mt-1 pb-1 text-xs text-text-tertiary italic">
              {t('profile.greenPrefOffNote', { defaultValue: 'While off, Symy stops intercepting impulse buys and guardian medals pause. Switch it back on anytime.' })}
            </p>
          )}
        </div>

        {/* 🎚️ batch61-a: 我的守护风格向导 — 聚合强度/深夜时段/提醒节奏/守护范围四渠道
            🧭 batch68-b: guard-anchor-style = 总控索引风格行跳转落点 */}
        <div id="guard-anchor-style" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40" data-testid="guardian-style-entry" onClick={() => setShowGuardianStyleWizard(true)}>
          <SettingLink
            icon={<Sparkles className="w-4 h-4" />}
            label={t('profile.guardianStyleTitle')}
            description={t('profile.guardianStyleEntryDesc')}
          />
        </div>

        {/* 🛡️ batch48-a: 守护强度三档 — 选中即保存 (demo 模式只写本地不落库) */}
        <GuardIntensitySetting />

        {/* 🗺️ batch53-b: 守护范围三态 — 按品类豁免/加严, 选中即保存 (demo 模式只写本地不落库)
            🧭 batch68-b: guard-anchor-cart = 总控索引「购物车守护」组跳转落点 */}
        <div id="guard-anchor-cart" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
          <GuardScopeSetting />
        </div>

        {/* 🌙 batch49-a: 我的深夜时段四档 — banner 只在用户自己设定的脆弱时段出现 */}
        <NightWindowSetting />

        <SpendingCapSetting isDemo={isDemo} />

        {/* 🧪 batch63-c: 守护策略预演沙盒 — 只读模拟, 确认后才走既有设置通道 */}
        <GuardPolicyPreviewSetting isDemo={isDemo} />

        {/* 🛡️ batch65-b: 守护规则自检 — 只读发现品类/触发词缺口, 不改词条
            🧭 batch68-b: guard-anchor-coverage = 总控索引覆盖行跳转落点 */}
        <div id="guard-anchor-coverage" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
          <GuardRuleCoverageSetting />
        </div>

        {/* 📜 batch58-b: 守护档案 — 一处看清配置全貌, 导出完整版 (自留) 与分享版 (无金额)
            🧭 batch68-b: guard-anchor-evidence = 总控索引「资料与证据」组跳转落点 */}
        <div id="guard-anchor-evidence" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
          <GuardProfileExportSetting isDemo={isDemo} />
        </div>

        {/* 🧹 batch59-b: 守护数据管理 — 查看/清除/重置自己的守护数据, 金额知情提醒仅 App 内私享 */}
        <GuardDataManagementSetting isDemo={isDemo} />

        {/* 🔧 batch43-a: 绿色偏好冻结态区块 */}
        <GreenPreferencesSection t={t} locale={locale} />

        {/* 🔧 batch44-c: 绿色影响仪表盘 (只读) */}
        <GreenImpactDashboard />

        {/* 🗂️ batch84-a: 物品清单查看卡 (BP p12 飞轮第②环) — 位置: 绿色影响 dashboard 之后;
            demo 模式不挂 (无真实清单数据) */}
        {!isDemo && <InventoryListCard />}

        {/* 🔧 BUG-2 fix: 推送通知从主体页面移入设置 overlay */}
        {/* 🔧 BUG-3 fix: 删除旧 SettingToggle (重复文案), 用 PushNotificationSettings 组件替代
            🧭 batch68-b: guard-anchor-push = 总控索引「推送守护」组跳转落点 */}
        <div id="guard-anchor-push" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
          <PushNotificationSettings t={t} isDemo={isDemo} />
        </div>
        <EmailConnectionSetting
          connections={emailConnections}
          onNavigateMonitor={onNavigateMonitor}
          isVIPEnabled={isEmailMonitorEnabled}
          onDisconnect={onDisconnectEmail}
        />
        <SettingToggle
          icon={<Shield className="w-4 h-4" />}
          label={t('profile.rpaPlugin')}
          description={t('profile.rpaPluginDesc')}
          enabled={false}
          onToggle={showComingSoonToast}
        />
        <SettingToggle
          icon={<Moon className="w-4 h-4" />}
          label={t('profile.darkMode')}
          description={darkMode ? t('profile.darkModeOn', { defaultValue: 'Night mode on' }) : t('profile.lightModeOn', { defaultValue: 'Light mode on' })}
          enabled={darkMode}
          onToggle={onToggleDarkMode}
          disabled={!resolvedTheme}
        />
        {/* Language Switcher */}
        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-glass-hover transition-colors cursor-pointer" onClick={() => {
          const currentIndex = LOCALES.findIndex((l) => l.code === locale);
          const nextIndex = (currentIndex + 1) % LOCALES.length;
          const newLocale = LOCALES[nextIndex].code;
          setLocale(newLocale);
          // 🔧 Round 115: toast 反馈
          showPremiumToastMsg(newLocale === 'zh' ? '已切换为中文' : 'Switched to English');
        }}>
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
            <Globe className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">
              {t('profile.languageSetting')}
            </p>
            <p className="text-xs text-text-tertiary">
              {LOCALES.find((l) => l.code === locale)?.nativeLabel || 'English'}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-icon-muted" />
        </div>
        <SettingLink
          icon={<CreditCard className="w-4 h-4" />}
          label={t('profile.paymentMethods')}
          description={t('profile.paymentMethodsDesc')}
          onClick={showComingSoonToast}
        />
        <SettingLink
          icon={<HelpCircle className="w-4 h-4" />}
          label={t('profile.helpFaq', { defaultValue: 'Help & FAQ' })}
          description={t('profile.helpFaqDesc', { defaultValue: 'Learn how to use Symy' })}
          onClick={() => { onClose(); onOpenFaqDialog(); }}
        />
        <SettingLink
          icon={<MessageSquare className="w-4 h-4" />}
          label={t('profile.sendFeedback', { defaultValue: 'Send Feedback' })}
          description={t('profile.sendFeedbackDesc', { defaultValue: 'Share your thoughts' })}
          onClick={() => { window.open('mailto:hcl.mygtt@gmail.com?subject=Symy%20Feedback', '_blank', 'noopener,noreferrer'); }}
        />

        {/* 🔧 BUG-2 fix: 删除账户从主体页面移入设置 overlay 底部 */}
        <DeleteAccountButton isDemo={isDemo} t={t} />
      </div>
    </div>
    {showGuardianStyleWizard && (
      <GuardianStyleWizard isDemo={isDemo} onClose={() => setShowGuardianStyleWizard(false)} />
    )}
    </>
  );
}
