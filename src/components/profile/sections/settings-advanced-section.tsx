'use client';

/**
 * SettingsAdvancedSection — 设置页「高级设置」折叠区 (batch95-a 小白三问减法重设计)
 *
 * owner 09-20 令: 默认只露核心行, 其余全部收纳进本折叠区, 渐进披露不删功能 —
 * 收进去的每一项组件原样搬移, 内部逻辑零变化。展开态存 localStorage
 * (symy-settings-advanced-open), 收起即回到默认收起态。
 *
 * 🛡️ 99-d 定案: 强度唯一入口 = GuardIntensitySetting 三档 (本区块内);
 * 绿色偏好区块不再重复呈现强度选择 (历史 firm/lockdown 由迁移模块映射 strict)。
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Shield, Globe, CreditCard, Sparkles } from 'lucide-react';
import { LOCALES, type Locale } from '@/i18n/config';
import { SettingToggle, SettingLink } from '@/components/profile-parts/setting-components';
import { EmailConnectionSetting } from '../profile-parts';
import { DeleteAccountButton } from '../delete-account-button';
import { GreenImpactDashboard } from '@/components/profile-parts/green-impact-dashboard';
import type { EmailConnection } from '@/lib/supabase';
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
// 🧭 batch68-b: 守护总控索引 — 一屏总览, 分组锚点跳转, 只读不挪项
import { GuardControlIndex } from './guard-control-index';
import { GuardPolicyPreviewSetting } from './guard-policy-preview-setting';
import { GuardRuleCoverageSetting } from './guard-rule-coverage-setting';
import { SpendingCapSetting } from '@/components/profile-parts/spending-cap-setting';
import { GreenPreferencesSection } from './green-preferences-section';

const ADVANCED_OPEN_STORAGE_KEY = 'symy-settings-advanced-open';

function readInitialAdvancedOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ADVANCED_OPEN_STORAGE_KEY) === 'true';
  } catch {
    // safe to ignore: 隐私模式读不到 localStorage → 默认收起
    return false;
  }
}

function persistAdvancedOpen(open: boolean): void {
  try {
    window.localStorage.setItem(ADVANCED_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    // safe to ignore: 持久化失败时本次会话内展开态照常工作
  }
}

type TFunc = (key: string, opts?: { defaultValue?: string }) => string;

interface SettingsAdvancedSectionProps {
  isDemo: boolean;
  greenPrefEnabled: boolean;
  emailConnections: EmailConnection[];
  onNavigateMonitor?: () => void;
  isEmailMonitorEnabled: boolean;
  onDisconnectEmail: (connectionId: string) => Promise<void>;
  showComingSoonToast: () => void;
  showPremiumToastMsg: (msg: string) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  onOpenGuardianStyleWizard: () => void;
  t: TFunc;
}

export function SettingsAdvancedSection({ isDemo, greenPrefEnabled, emailConnections, onNavigateMonitor, isEmailMonitorEnabled, onDisconnectEmail, showComingSoonToast, showPremiumToastMsg, locale, setLocale, onOpenGuardianStyleWizard, t }: SettingsAdvancedSectionProps) {
  const [open, setOpen] = useState(readInitialAdvancedOpen);

  const toggleOpen = () => {
    setOpen((prev) => {
      persistAdvancedOpen(!prev);
      return !prev;
    });
  };

  return (
    <div>
      {/* 折叠头 — 默认收起, aria-expanded 同步展开态 */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        data-testid="settings-advanced-toggle"
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-glass-border bg-glass-fill hover:bg-glass-hover transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-glass-fill flex items-center justify-center text-icon-muted">
          <Shield className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t('profile.settingsAdvanced')}</p>
          <p className="text-xs text-text-tertiary">{t('profile.settingsAdvancedDesc')}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 折叠内容 — 条件渲染: 收起时不挂载, 展开后组件照常工作 */}
      {open && (
        <div className="mt-1 space-y-1">
          {/* 🧭 batch68-b: 守护总控索引 (只读), 分组行锚点跳转到本区块内既有设置项 */}
          <GuardControlIndex greenGuardEnabled={greenPrefEnabled} />

          {/* 🎚️ batch61-a: 我的守护风格向导 — 聚合强度/深夜时段/提醒节奏/守护范围四渠道
              🧭 batch68-b: guard-anchor-style = 总控索引风格行跳转落点 */}
          <div id="guard-anchor-style" tabIndex={-1} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40" data-testid="guardian-style-entry" onClick={onOpenGuardianStyleWizard}>
            <SettingLink
              icon={<Sparkles className="w-4 h-4" />}
              label={t('profile.guardianStyleTitle')}
              description={t('profile.guardianStyleEntryDesc')}
            />
          </div>

          {/* 💰 batch51-b: 我的时间价值 — 预设档 + 自定义 (钳制 1–500), 保存走 useHourlyRate 共享通道 */}
          <TimeValueSetting isDemo={isDemo} />

          {/* 🛡️ batch48-a: 守护强度三档 — 选中即保存 (demo 模式只写本地不落库)。
              batch95-a: 全 overlay 唯一强度选择器 (绿色偏好区重复份已删, 99-d 定案) */}
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

          {/* 🔧 batch43-a: 绿色偏好冻结态区块 (batch95-a 起不再含强度选择) */}
          <GreenPreferencesSection t={t} locale={locale} />

          {/* 🔧 batch44-c: 绿色影响仪表盘 (只读) */}
          <GreenImpactDashboard />

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

          {/* 🔧 BUG-2 fix: 删除账户 — 破坏性操作, 确认弹窗语义原样保留 (batch95-a 收纳进高级区底部) */}
          <DeleteAccountButton isDemo={isDemo} t={t} />
        </div>
      )}
    </div>
  );
}
