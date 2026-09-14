'use client';

/**
 * ChallengeModal — 绿色守护挑战弹窗 (batch4-b 改版)
 *
 * 两个视图 (顶部 pill 切换):
 *  1. 守护挑战库 (默认) — buddy.challengeLib SSOT 见 challenge-definitions.ts,
 *     每条挑战进度绑定真实行为管道 (今日 see-it / 每日对话 / weekly-review / buddyState 累计),
 *     详情底部一行 app 内明示 "周期内守护为你留下的钱" (challengeMoneyLeft, 无数据不渲染, 不造假)。
 *     完成态展示守护徽记 (ALL_BADGES 只读展示) + 称号。
 *  2. 此刻的诱惑 (原 "I want to buy X for $Y. Challenge me!" 表单) — 行为零变化。
 *
 * batch6-a: 顶部新增"本周守护主题"轮换位 (pickWeeklyFeatureChallenge 纯函数, 同周全端一致);
 *          库分组轴 周期 → tier (starter/regular/hard), 周期降级为卡片小徽章;
 *          hard 区对新手 (challengesCompleted === 0) 默认折叠, 文案荣誉非羞辱。
 *
 * 从 buddy-tab.tsx 抽出 (C3 拆分)。父组件控制 open state + onSubmit 回调。
 * 🔧 需求五: 金额输入实时触发 Freedom 预览 (0.5s debounce)
 *    预览基于用户 Profile 时薪 + 复利 + Dream Fund 进度实时计算
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, ChevronUp, Share2, Shield, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from '@/hooks/use-hourly-rate';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { moneyToFreedomLabel } from '@/lib/freedom-time';
import { FreedomPreview } from './freedom-preview';
import { ShareModal } from '@/components/share/share-modal';
import {
  GUARDIAN_CHALLENGES,
  CHALLENGE_PERIOD_ORDER,
  CHALLENGE_PERIOD_CHIP_KEYS,
  CHALLENGE_TIER_ORDER,
  CHALLENGE_TIER_LABEL_KEYS,
  CHALLENGE_MONEY_KEYS,
  calcChallengeProgress,
  challengeMoneyLeft,
  pickWeeklyFeatureChallenge,
  type GuardianChallenge,
  type ChallengeProgressInputs,
  type WeeklyGuardianSummary,
} from './challenge-definitions';
import { BADGE_INFO } from './constants';
import type { BuddyState, DreamFund } from '@/types/buddy-state';
import { SymyAvatar } from './symy-avatar';

export interface ChallengeModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调（用户点 X 或 backdrop） */
  onClose: () => void;
  /** 提交回调 — itemName/amount 已校验（此刻的诱惑视图） */
  onSubmit: (itemName: string, amount: number) => void;
  /** 🔧 需求五: Dream Funds (用于 FreedomPreview 第 3 维度基金进度) */
  dreamFunds?: DreamFund[];
  /** 🔧 需求五: 是否 demo 模式 (不 fetch 时薪 / weekly-review) */
  isDemo?: boolean;
  /** batch4-b: 累计进度管道 (challengesCompleted/totalSaved/streak/dreamFunds) */
  buddyState?: BuddyState | null;
  /** batch4-b: 今日 see-it 次数 (/api/challenge/limit count; 降级/未加载 = undefined) */
  todaySeeItCount?: number;
  /** batch4-b: 今日已和小象对话 (dailyTasks.chatted) */
  chattedToday?: boolean;
}

// 🔧 需求五: 金额输入停止 0.5s 后触发预览
const PREVIEW_DEBOUNCE_MS = 500;

export function ChallengeModal({ open, onClose, onSubmit, dreamFunds, isDemo, buddyState, todaySeeItCount, chattedToday }: ChallengeModalProps) {
  const { t } = useI18n();
  // hourlyRate no longer needed here (avatar swap removed money preview) — see git history
  // batch4-b: 视图 — 默认守护挑战库; 打开时重置
  const [view, setView] = useState<'library' | 'custom'>('library');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // batch6-a: hard 区折叠 — null = 跟随默认 (新手收起/老用户展开), 点开关后尊重用户选择
  const [hardOpenOverride, setHardOpenOverride] = useState<boolean | null>(null);
  // batch4-b: 周度守护数据 (真实管道: /api/buddy/weekly-review)
  const [week, setWeek] = useState<WeeklyGuardianSummary | null>(null);

  const [challengeItemName, setChallengeItemName] = useState('');
  const [challengeAmount, setChallengeAmount] = useState('');
  // batch5-a: 完成挑战的晒入口 — 非空时渲染 ShareModal (challenge 模板, 面子-only);
  // moneyLeft 只喂 app 内私密提示行与自由小时换算, 永不进分享图
  const [shareWin, setShareWin] = useState<{ def: GuardianChallenge; moneyLeft: number | null } | null>(null);
  // 🔧 PM-NEW-77 fix: 用 ref 读 input.validity.valid, 防 JS 直接设 input.value 绕过
  const amountInputRef = useRef<HTMLInputElement>(null);
  // 🔧 PM-NEW-77 fix: 用 state 触发 re-render (validity 可能被 JS 改了但 React 不知道)
  const [amountValid, setAmountValid] = useState(true);

  // 🔧 需求五: debounced amount for FreedomPreview
  //    用户停止输入 0.5s 后才更新 previewAmount, 避免每次按键都重算
  const [previewAmount, setPreviewAmount] = useState<number | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // batch4-b: 周度守护数据 — 打开时拉一次; 挑战完成/创建事件触发刷新 (与 useChallengeLimit 同款事件)
  useEffect(() => {
    if (!open || isDemo) return;
    const controller = new AbortController();
    // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- open-triggered read; weekly-review has no useQuery wrapper yet
    apiFetch<WeeklyGuardianSummary>('/api/buddy/weekly-review', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setWeek(data); })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 周度数据拉不到 → 钱行与周挑战进度诚实显示 "—" (不造假), 不阻塞弹窗
        logger.warn('[ChallengeModal] weekly-review fetch failed:', err instanceof Error ? err.message : String(err));
      });
    const refresh = () => {
      // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- event-driven refresh (challenge completed/created)
      apiFetch<WeeklyGuardianSummary>('/api/buddy/weekly-review')
        .then((data) => setWeek(data))
        .catch(() => { /* 保持上次数据, 下次打开重拉 */ });
    };
    window.addEventListener('symy:challenge-completed', refresh);
    window.addEventListener('symy:challenge-created', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('symy:challenge-completed', refresh);
      window.removeEventListener('symy:challenge-created', refresh);
    };
  }, [open, isDemo]);

  // 🔧 需求五: debounce 金额输入, 0.5s 后触发预览
  useEffect(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const parsed = parseFloat(challengeAmount);
    // 仅当金额有效 (>= 10) 时才触发预览
    if (!isNaN(parsed) && parsed >= 10 && parsed <= 1000000) {
      previewTimerRef.current = setTimeout(() => {
        setPreviewAmount(parsed);
        previewTimerRef.current = null;
      }, PREVIEW_DEBOUNCE_MS);
    } else {
      // 无效金额 — 立即隐藏预览
      setPreviewAmount(null);
    }
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [challengeAmount]);

  // 🔧 需求五: 弹窗关闭时清空 previewAmount; batch4-b: 重置视图与展开态; batch6-a: 重置 hard 折叠
  useEffect(() => {
    if (!open) {
      setPreviewAmount(null);
      setView('library');
      setExpandedId(null);
      setHardOpenOverride(null);
    }
  }, [open]);

  // 🔧 Bug 8 fix: Escape 键关闭模态框 (a11y 标准 — 所有模态框都应支持 Escape)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // batch5-a: 晒卡弹层打开时 Escape 归 ShareModal 管 — 不连带关掉挑战弹窗
      if (shareWin) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shareWin]);

  if (!open) return null;

  function close() {
    onClose();
    setChallengeItemName('');
    setChallengeAmount('');
    setPreviewAmount(null);
  }

  function submit() {
    const amount = parseFloat(challengeAmount);
    // 🔧 PM-NEW-77 fix: 加 amount > 0 检查, 防负数绕过 (JS 直接设 input.value)
    if (challengeItemName.trim() && !isNaN(amount) && amount >= 10 && amount <= 1000000 && amount > 0) {
      onSubmit(challengeItemName, amount);
      setChallengeItemName('');
      setChallengeAmount('');
      setPreviewAmount(null);
    }
  }

  // batch4-b: 守护挑战进度输入 — 只装配真实管道数据
  const progressInputs: ChallengeProgressInputs = {
    todaySeeItCount,
    chattedToday,
    week,
    buddyState,
  };

  // batch6-a: 每周主推 — 确定性周轮换 (同周全端同一条), 从下方分组移出、全库单实例
  const featureDef = pickWeeklyFeatureChallenge();
  // batch6-a: 新手 (0 次完成) 默认收起 hard 区; buddyState 异步到达时默认随真实数据切换
  const isNewUser = (buddyState?.challengesCompleted ?? 0) === 0;
  const hardOpen = hardOpenOverride ?? !isNewUser;

  // 🔧 弹窗 Portal fix: 用 createPortal 渲染到 document.body, 避免 animate-tab-in transform 影响
  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative w-[calc(100%-2rem)] max-w-[380px] max-h-[90vh] overflow-y-auto bg-surface-1 border border-emerald-500/20 rounded-2xl px-5 pt-5 pb-6 animate-in slide-in-from-bottom duration-300 shadow-2xl shadow-emerald-500/10 custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            {view === 'library'
              ? t('buddy.challengeLib.title', { defaultValue: 'Guardian Challenges' })
              : t('buddy.challengeMode')}
          </h3>
          <button onClick={close} aria-label={t('common.close')} className="p-1 rounded-lg hover:bg-glass-hover text-text-secondary transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* batch4-b: 视图切换 — 守护挑战 / 此刻的诱惑 */}
        <div className="flex gap-1.5 mb-3 p-1 rounded-xl bg-glass-fill" role="tablist" aria-label={t('buddy.challengeLib.title', { defaultValue: 'Guardian Challenges' })}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'library'}
            data-testid="challenge-tab-library"
            onClick={() => setView('library')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${view === 'library' ? 'bg-emerald-500/20 text-emerald-300' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {t('buddy.challengeLib.tabGuardian', { defaultValue: 'Guardian Challenges' })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'custom'}
            data-testid="challenge-tab-custom"
            onClick={() => setView('custom')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${view === 'custom' ? 'bg-cyan-500/20 text-cyan-300' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {t('buddy.challengeLib.tabCustom', { defaultValue: 'This moment' })}
          </button>
        </div>

        {/* ====== batch4-b: 守护挑战库 ====== */}
        {view === 'library' && (
          <div data-testid="challenge-view-library">
            <p className="text-xs text-text-secondary mb-3 leading-relaxed">
              {t('buddy.challengeLib.subtitle', { defaultValue: 'Every guard stays on the books — Symy counts only what really happened.' })}
            </p>

            {/* batch6-a: 每周守护主题 — pickWeeklyFeatureChallenge 确定性轮换, 同周全端同一条 */}
            <section
              data-testid="weekly-feature"
              aria-label={t('buddy.challengeLib.weeklyFeature.label')}
              className="mb-3"
            >
              <h4 className="text-[10px] font-semibold text-emerald-300 tracking-wider mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                {t('buddy.challengeLib.weeklyFeature.label')}
              </h4>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-1">
                <GuardianChallengeCard
                  def={featureDef}
                  inputs={progressInputs}
                  expanded={expandedId === featureDef.id}
                  onToggle={() => setExpandedId(expandedId === featureDef.id ? null : featureDef.id)}
                  onShare={(d, moneyLeft) => setShareWin({ def: d, moneyLeft })}
                />
              </div>
            </section>

            {/* batch6-a: tier 分组 (起步 → 常态 → 进阶); 周期信息降级为卡片小徽章。
                主推条已从分组移出; hard 区对新手默认折叠 (荣誉非羞辱, 收起文案仍是邀请语气) */}
            {CHALLENGE_TIER_ORDER.map((tier) => {
              const groupChallenges = GUARDIAN_CHALLENGES
                .filter((c) => c.tier === tier && c.id !== featureDef.id)
                .slice()
                .sort((a, b) => CHALLENGE_PERIOD_ORDER.indexOf(a.period) - CHALLENGE_PERIOD_ORDER.indexOf(b.period));
              if (groupChallenges.length === 0) return null;
              const isHard = tier === 'hard';
              return (
                <section
                  key={tier}
                  data-testid={`challenge-tier-${tier}`}
                  aria-label={t(CHALLENGE_TIER_LABEL_KEYS[tier])}
                  className="mb-3"
                >
                  {isHard ? (
                    <button
                      type="button"
                      data-testid="hard-tier-toggle"
                      aria-expanded={hardOpen}
                      onClick={() => setHardOpenOverride(!hardOpen)}
                      className="w-full flex items-center gap-1 text-[10px] font-semibold text-text-tertiary tracking-wider mb-1.5 hover:text-text-secondary transition-colors cursor-pointer"
                    >
                      {t(CHALLENGE_TIER_LABEL_KEYS[tier])}
                      <span className="font-normal">({groupChallenges.length})</span>
                      {hardOpen
                        ? <ChevronUp className="w-3 h-3" aria-hidden="true" />
                        : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                    </button>
                  ) : (
                    <h4 className="text-[10px] font-semibold text-text-tertiary tracking-wider mb-1.5">
                      {t(CHALLENGE_TIER_LABEL_KEYS[tier])}
                    </h4>
                  )}
                  {(!isHard || hardOpen) && (
                    <div className="space-y-1.5">
                      {groupChallenges.map((def) => (
                        <GuardianChallengeCard
                          key={def.id}
                          def={def}
                          inputs={progressInputs}
                          expanded={expandedId === def.id}
                          onToggle={() => setExpandedId(expandedId === def.id ? null : def.id)}
                          onShare={(d, moneyLeft) => setShareWin({ def: d, moneyLeft })}
                        />
                      ))}
                    </div>
                  )}
                  {isHard && !hardOpen && (
                    <p className="text-[10px] text-text-tertiary/70 leading-relaxed">
                      {t('buddy.challengeLib.hardGroup.hint')}
                    </p>
                  )}
                </section>
              );
            })}

            {/* 诚实 doctrine — 进度只来自真实行为记录 */}
            <p className="text-[10px] text-text-tertiary/70 text-center leading-relaxed mt-1 mb-3">
              <span className="inline-flex w-4 h-4 align-middle mr-0.5"><SymyAvatar growthStage="young" animate={false} /></span> {t('buddy.challengeLib.honestyNote', { defaultValue: 'Progress counts only what really happened.' })}
            </p>

            {/* 此刻有具体诱惑 → 原挑战表单 (行为零变化) */}
            <button
              type="button"
              data-testid="challenge-custom-entry"
              onClick={() => setView('custom')}
              className="w-full py-2.5 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-300 text-sm font-semibold hover:from-cyan-500/20 hover:to-blue-500/20 active:scale-[0.98] transition-all cursor-pointer select-none"
            >
              {t('buddy.challengeLib.customEntry', { defaultValue: 'Something pulling at you right now?' })}
              <span className="block text-[10px] font-normal text-text-tertiary mt-0.5">
                {t('buddy.challengeLib.customEntryHint', { defaultValue: 'Let Symy hold it at the green gate with you' })}
              </span>
            </button>
          </div>
        )}

        {/* ====== 此刻的诱惑 — 原挑战表单 (行为零变化) ====== */}
        {view === 'custom' && (
          <div data-testid="challenge-view-custom">
          <p className="text-xs text-text-secondary mb-4 leading-relaxed">
            {t('buddy.challengeDescription')}
          </p>
          {/* 🔧 PM-P1-7 fix: 示例 chips — 点击填入, 帮新用户快速开始 */}
          {/* 🔧 V3-3 fix: 加 relative z-10 确保快捷按钮可点击 (避免被 modal 标题遮挡) */}
          <div className="flex flex-wrap gap-1.5 mb-3 relative z-10">
            {[
              { name: 'iPhone 17 Pro', amount: '1099' },
              { name: 'Nike Air Max', amount: '159' },
              { name: 'Coffee machine', amount: '89' },
            ].map((ex) => (
              <button
                key={ex.name}
                type="button"
                onClick={() => { setChallengeItemName(ex.name); setChallengeAmount(ex.amount); }}
                className="text-[10px] px-2 py-1 rounded-full bg-glass-fill border border-glass-border text-text-secondary hover:border-cyan-500/50 hover:text-cyan-400 transition-colors cursor-pointer relative z-10"
              >
                {ex.name} ${ex.amount}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              {/* 🔧 PM-#23 fix: 移除 uppercase (表单 label 用 Sentence case) */}
              <label htmlFor="challenge-item-name" className="text-[10px] text-text-tertiary tracking-wider font-medium mb-1 block">{t('buddy.whatDoYouWantToBuy')}</label>
              <input
                id="challenge-item-name"
                type="text"
                value={challengeItemName}
                // 🔧 Bug 13 fix: maxLength 200 → 50 — 200 字符物品名撑爆 Health Log UI
                //   50 字符已覆盖绝大多数商品名 (Amazon 标题平均 60 字符, 但前 50 字符已含核心品名)
                // 🔧 PM-NEW-73 fix: 清除 HTML 标签 (防 XSS payload 显示为文本)
                onChange={(e) => setChallengeItemName(e.target.value.slice(0, 50).replace(/<[^>]*>/g, ''))}
                placeholder={t('buddy.challengeItemPlaceholder')}
                maxLength={50}
                className="w-full px-3 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && challengeItemName.trim() && challengeAmount.trim()) {
                    const amount = parseFloat(challengeAmount);
                    if (!isNaN(amount) && amount >= 10 && amount <= 1000000) {
                      submit();
                    }
                  }
                }}
              />
              {challengeItemName.length > 40 && (
                <p className="text-[10px] text-text-tertiary -mt-1">{challengeItemName.length}/50</p>
              )}
            </div>
            <div>
              <label htmlFor="challenge-amount" className="text-[10px] text-text-tertiary tracking-wider font-medium mb-1 block">{t('buddy.howMuchDoesItCost')}</label>
              <input
                id="challenge-amount"
                ref={amountInputRef}
                type="number"
                inputMode="decimal"
                min="10"
                max="1000000"
                step="0.01"
                value={challengeAmount}
                onChange={(e) => {
                  // 🔧 PM-NEW-11 fix: 改用 type=number 后, e.target.value 已被浏览器过滤
                  // 但仍需清理 (防 'e'/'+'/'-' 等数字输入允许的特殊字符) + 限制 2 位小数
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  const cleaned = parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : val;
                  setChallengeAmount(cleaned);
                  // 🔧 PM-NEW-77 fix: 同步更新 amountValid
                  setAmountValid(e.target.validity.valid);
                }}
                // 🔧 PM-NEW-77 fix: onInput 捕获 JS 直接设 input.value 的场景
                onInput={(e) => {
                  setAmountValid((e.target as HTMLInputElement).validity.valid);
                }}
                placeholder={t('buddy.challengeAmountPlaceholder')}
                className="w-full px-3 py-2.5 rounded-xl bg-glass-fill border border-glass-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && challengeItemName.trim() && challengeAmount.trim()) {
                    const amount = parseFloat(challengeAmount);
                    // 🔧 Bug L fix: 最低 $10 才有意义做挑战
                    if (!isNaN(amount) && amount >= 10) {
                      submit();
                    }
                  }
                }}
              />
            </div>
            {/* 🔧 BUG-fix (轻微2): 价格校验提示 */}
            {!challengeAmount.trim() && challengeItemName.trim() && (
              <p className="text-[10px] text-text-tertiary -mt-1">{t('buddy.challengeAmountHint', { defaultValue: 'Enter a price to see the real cost' })}</p>
            )}
            {challengeAmount && !isNaN(parseFloat(challengeAmount)) && parseFloat(challengeAmount) < 10 && (
              <p className="text-[10px] text-yellow-500 -mt-1">{t('buddy.challengeAmountMinError', { defaultValue: 'Minimum $10 to start a challenge' })}</p>
            )}
            {challengeAmount && !isNaN(parseFloat(challengeAmount)) && parseFloat(challengeAmount) > 1000000 && (
              <p className="text-[10px] text-red-500 -mt-1">{t('buddy.challengeAmountMaxError', { defaultValue: 'Maximum $1,000,000' })}</p>
            )}

            {/* 🔧 需求五: 实时 Freedom 预览 — 金额有效且 0.5s debounce 后显示 */}
            {previewAmount !== null && (
              <FreedomPreview
                amount={previewAmount}
                itemName={challengeItemName}
                dreamFunds={dreamFunds}
                isDemo={isDemo}
              />
            )}

            <button
              type="button"
              disabled={!challengeItemName.trim() || !challengeAmount.trim() || isNaN(parseFloat(challengeAmount)) || parseFloat(challengeAmount) < 10 || parseFloat(challengeAmount) > 1000000 || parseFloat(challengeAmount) <= 0 || !amountValid}
              onClick={submit}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:from-cyan-400 hover:to-blue-400 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none btn-shimmer"
            >
              {t('buddy.startChallenge')}
            </button>

            {/* 🔧 需求五: 主按钮下方 — "很多冲动在这一刻就消散了" */}
            <p className="text-[10px] text-text-tertiary/80 text-center leading-relaxed pt-0.5">
              💡 {t('buddy.challengeImpulseFadesHint', { defaultValue: 'Many induced moments dissolve in this moment.' })}
            </p>
          </div>
          </div>
        )}
      </div>
    </div>

    {/* batch5-a: 挑战晒卡弹层 — challenge 模板直接选中; medal 由现有管道合成
        (savedCents = 该挑战周期内真实留下的钱, 只喂 app 内私密提示行与自由小时换算, 永不进分享图)。
        z-[300]: 盖过挑战弹窗 (z-[110]) */}
    {shareWin && (
      <ShareModal
        key={shareWin.def.id}
        open
        onClose={() => setShareWin(null)}
        zIndexClass="z-[300]"
        initialTemplate="challenge"
        challengeCard={{ challenge: shareWin.def }}
        medal={{
          itemTitle: '',
          savedCents:
            shareWin.moneyLeft != null && shareWin.moneyLeft > 0 ? Math.round(shareWin.moneyLeft * 100) : 0,
          date: new Date().toISOString(),
        }}
        streakDays={buddyState?.streak ?? 0}
        interceptCount={buddyState?.challengesCompleted}
      />
    )}
    </>,
    document.body
  );
}

/**
 * batch4-b: 守护挑战卡 — 进度来自真实管道 (calcChallengeProgress), 未知显示 "—";
 * 点击展开详情: 守护叙事 + 奖励徽记展示 (ALL_BADGES 只读) + 周期内留下的钱 (无数据不渲染)。
 */
function GuardianChallengeCard({
  def,
  inputs,
  expanded,
  onToggle,
  onShare,
}: {
  def: GuardianChallenge;
  inputs: ChallengeProgressInputs;
  expanded: boolean;
  onToggle: () => void;
  /** batch5-a: 完成态晒入口回调 — 只对已完成挑战传入 (荣誉非羞辱, 进行中/未开始不出口) */
  onShare?: (def: GuardianChallenge, moneyLeft: number | null) => void;
}) {
  const { hourlyRate } = useHourlyRate();
  const { t, locale } = useI18n();
  const progress = calcChallengeProgress(def, inputs);
  const moneyLeft = challengeMoneyLeft(def, inputs);
  const done = progress !== null && progress >= def.target;
  const progressPct = progress === null ? 0 : Math.min(100, Math.round((progress / def.target) * 100));
  const badgeInfo = BADGE_INFO[def.rewardBadgeId];
  const badgeName = t(`buddy.badgeNames.${def.rewardBadgeId}`, { defaultValue: def.rewardBadgeId });

  return (
    <div
      className={`rounded-xl border transition-colors ${
        done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-glass-fill border-glass-border'
      }`}
      data-testid={`guardian-challenge-${def.id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-3 py-2.5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-base flex-shrink-0" aria-hidden="true">{badgeInfo?.emoji ?? '🌿'}</span>
          <span className={`flex-1 min-w-0 text-xs font-semibold truncate ${done ? 'text-emerald-300' : 'text-text-primary'}`}>
            {t(def.titleKey)}
          </span>
          {/* batch6-a: 周期小徽章 — 分组轴换 tier 后, daily/weekly/all_time 信息仍要一眼可见 */}
          <span
            className="flex-shrink-0 text-[9px] leading-none px-1.5 py-0.5 rounded-full bg-glass-fill-strong text-text-tertiary"
            data-testid={`challenge-period-chip-${def.id}`}
          >
            {t(CHALLENGE_PERIOD_CHIP_KEYS[def.period])}
          </span>
          {done ? (
            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-medium text-emerald-300">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              {t(def.doneTitleKey)}
            </span>
          ) : (
            <span
              className="flex-shrink-0 text-[10px] text-text-tertiary font-mono"
              data-testid={`guardian-challenge-progress-${def.id}`}
            >
              {progress === null ? '—' : Math.min(progress, def.target)}/{def.target}
            </span>
          )}
        </div>
        {/* 进度条 — 未知 (null) 时不渲染, 不显示假 0 */}
        {progress !== null && def.target > 1 && (
          <div className="h-1 mt-2 bg-glass-fill-strong rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-400' : 'bg-cyan-500/60'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </button>

      {/* batch5-a: 「晒」入口 — 只对已完成者出现; 荣誉非羞辱, 进行中看到的是进度与正面鼓励。
          moneyLeft 传给 ShareModal 只走 app 内私密行, 分享图严格面子 */}
      {done && onShare && (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            data-testid={`challenge-share-${def.id}`}
            onClick={() => onShare(def, moneyLeft)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/20 cursor-pointer select-none"
          >
            <Share2 className="h-3 w-3" aria-hidden="true" />
            {t('share.challengeCard.shareEntry', { defaultValue: 'Share this win' })}
          </button>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pt-0.5">
          <p className="text-[11px] text-text-secondary leading-relaxed">{t(def.descKey)}</p>
          {/* 完成奖励 — 指向已有 BadgeDef 的展示 (不新增发放; 进度达标勋章自然点亮) */}
          <p className="text-[10px] text-text-tertiary mt-2 flex items-center gap-1">
            <span aria-hidden="true">{badgeInfo?.emoji ?? '🌿'}</span>
            {t('buddy.challengeLib.towardBadge', { defaultValue: 'Toward: {badge}', badge: badgeName })}
          </p>
          {/* 里子 — 周期内守护真实留下的钱 (challengeMoneyLeft 直读真实管道; null/0 不渲染, 不造假) */}
          {moneyLeft !== null && moneyLeft > 0 && (
            <p
              className="text-[10px] text-emerald-300/90 mt-1"
              data-testid={`guardian-challenge-money-${def.id}`}
            >
              🪙 {t(CHALLENGE_MONEY_KEYS[def.period], {
                defaultValue: 'Your guards won you back {amount}',
                amount: moneyToFreedomLabel(moneyLeft, locale, hourlyRate),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
