'use client';

/**
 * DreamFundEditor — Dream Fund 添加/编辑弹窗
 *
 * 从 buddy-tab.tsx 抽出（C3 拆分）。
 * 行为零变化：父组件控制 open state + editing target + onCreate/onUpdate 回调。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DreamFund } from '@/types/buddy-state';
import { useI18n } from '@/i18n/provider';
import { SAVINGS_FUND_ID, SAVINGS_FUND_TARGET } from '@/lib/buddy-defaults';

export interface DreamFundEditorProps {
  /** 是否显示 */
  open: boolean;
  /** 正在编辑的 dream fund；null 表示新建 */
  editingFund: DreamFund | null;
  /** 弹窗模式：'create' = 顶部 Add 按钮 / 'edit' = 编辑现有 / 'setNewGoal' = "Set a new goal →" 按钮 */
  mode?: 'create' | 'edit' | 'setNewGoal';
  /** 已存在的 dream funds（用于重名检测） */
  existingFunds: DreamFund[];
  /** 关闭回调 */
  onClose: () => void;
  /** 创建新 fund 回调 */
  onCreate: (fund: { name: string; target: number; current: 0; emoji: string }) => void;
  /** 更新已存在 fund 回调 */
  onUpdate: (fundId: string, patch: { name: string; target: number; emoji: string }) => void;
  /** Toast 通知回调（可选） */
  onToast?: (message: string, type?: 'success' | 'info') => void;
  /** 创建模式下预填的初始值（用于推荐目标引导） */
  initialValues?: { name: string; target: number; emoji: string } | null;
}

// 🔧 PM-NEW-4 fix: "Set a New Goal" 模式的目标建议
// 🐘 batch6-b: 名称全部走 i18n (buddy.dreamFund.suggestions.*) — 守护友好的温度话术,
//   只画梦想不标价 (金额由 target 字段承载), 不再硬编码英文句子
const SET_NEW_GOAL_SUGGESTIONS: { emoji: string; nameKey: string; target: number }[] = [
  { emoji: '🏠', nameKey: 'buddy.dreamFund.suggestions.home', target: 50000 },
  { emoji: '✈️', nameKey: 'buddy.dreamFund.suggestions.travel', target: 5000 },
  { emoji: '🚨', nameKey: 'buddy.dreamFund.suggestions.rainyDay', target: 10000 },
  { emoji: '💻', nameKey: 'buddy.dreamFund.suggestions.laptop', target: 2000 },
  { emoji: '🚗', nameKey: 'buddy.dreamFund.suggestions.car', target: 8000 },
  { emoji: '🎓', nameKey: 'buddy.dreamFund.suggestions.learning', target: 20000 },
];

// 🔧 P2-11 fix: 30 preset icon library for fund emoji picker
const PRESET_ICONS = [
  '🏠', '✈️', '🚨', '💻', '🚗', '🎓', '🏔️', '💍', '👶', '🐕',
  '🎯', '🏦', '💰', '💳', '📦', '🎁', '🌟', '🌙', '🏖️', '⛵',
  '🎸', '📚', '🏋️', '🍳', '🌿', '🔋', '👑', '💎', '🛡️', '🔓',
];

export function DreamFundEditor({
  open,
  editingFund,
  mode = 'create',
  existingFunds,
  onClose,
  onCreate,
  onUpdate,
  onToast,
  initialValues,
}: DreamFundEditorProps) {
  const { t } = useI18n();
  const [fundForm, setFundForm] = useState({ name: '', target: 1000, emoji: '🎯' });

  // 🔧 FIX-React19: 当 open 状态变化或 editingFund 变化时，重置表单
  // 注意: effect 内 setState 是 React 19 Compiler 不推荐的模式, 但这里
  // 是 "props 变化 → 同步 form state" 的合理用法 (受控表单初始化)
  // 替代方案 (lazy initializer) 不可行: open/editingFund 可能在组件生命周期中变化
  useEffect(() => {
    if (open) {
      if (editingFund) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 受控表单初始化 (props → state 同步)
        setFundForm({ name: editingFund.name, target: editingFund.target, emoji: editingFund.emoji });
      } else if (initialValues) {
        setFundForm({ name: initialValues.name, target: initialValues.target, emoji: initialValues.emoji });
      } else {
        setFundForm({ name: '', target: 1000, emoji: '🎯' });
      }
    }
  }, [open, editingFund, initialValues]);

  // 🔧 P3-6 fix: Escape 键关闭弹窗 (a11y 标准)
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // 🔧 PM-NEW-4 fix: 根据 mode + editingFund 计算弹窗标题
  //  - mode='setNewGoal' → "Set a New Goal" (不管 editingFund)
  //  - mode='edit' 或 editingFund 非空 → "Edit dream fund"
  //  - mode='create' (默认) → "Add dream fund"
  const editorTitle = mode === 'setNewGoal'
    ? t('buddy.setNewGoalTitle', { defaultValue: 'Set a New Goal' })
    : (editingFund ? t('buddy.dreamFundEdit') : t('buddy.dreamFundAdd'));
  const isSetNewGoalMode = mode === 'setNewGoal';

  if (!open) return null;

  const submit = () => {
    if (!fundForm.name.trim()) return;
    // 🔧 P0-2 fix: 最终防御性校验, 防止粘贴/键盘自动填充绕过 onChange
    //   (虽然 disabled 已拦截, 但稳健起见再检查一次)
    if (editingFund?.id !== SAVINGS_FUND_ID) {
      if (fundForm.target < 100 || fundForm.target <= 0) return;
      if (fundForm.target > SAVINGS_FUND_TARGET) {
        onToast?.(t('buddy.dreamFundMaxError', { defaultValue: `Maximum $${SAVINGS_FUND_TARGET.toLocaleString('en-US')} — please enter a smaller amount`, max: SAVINGS_FUND_TARGET.toLocaleString('en-US') }), 'info');
        return;
      }
    }
    // 🔧 NEW-T fix: emoji 为空时用默认 🎯
    const finalEmoji = fundForm.emoji.trim() || '🎯';
    // 🔧 N44 fix: 重名检测（编辑时排除自身）
    const isDuplicate = existingFunds.some(f =>
      f.name.trim().toLowerCase() === fundForm.name.trim().toLowerCase() &&
      (!editingFund || f.id !== editingFund.id)
    );
    if (isDuplicate) {
      onToast?.(t('buddy.dreamFundDuplicateName', { defaultValue: 'A fund with this name already exists' }), 'info');
      return;
    }
    if (editingFund) {
      onUpdate(editingFund.id, { name: fundForm.name, target: fundForm.target, emoji: finalEmoji });
      onToast?.(t('buddy.dreamFundUpdated'), 'success');
    } else {
      onCreate({ name: fundForm.name, target: fundForm.target, current: 0, emoji: finalEmoji });
      onToast?.(t('buddy.dreamFundCreated'), 'success');
    }
    onClose();
  };

  // 🔧 弹窗 Portal fix: 用 createPortal 渲染到 document.body,
  //   避免 Buddy tab 容器的 animate-tab-in (transform: translateY(0)) 创建包含块,
  //   导致 fixed 定位相对于 Buddy tab 而非视口, 滚动到底部时弹窗裁剪 + 取消按钮无法点击。
  return createPortal(
    // 🔧 CL2 fix: 降低背景透明度 (bg-black/60 → bg-black/80) + 加 backdrop-blur, 让弹窗更清晰
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      {/* 🔧 CL2 fix: 卡片用 solid bg-surface-2 替代 glass-card (glass-card 在 dark 模式半透明), 保证可读性 */}
      <div className="rounded-2xl p-5 w-[85%] max-w-xs max-h-[85vh] overflow-y-auto space-y-4 bg-surface-2 border border-glass-border shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text-primary">
          {editorTitle}
        </h3>
        {/* 🔧 PM-NEW-4 fix: Set New Goal 模式下显示目标建议 chips */}
        {(isSetNewGoalMode || (!editingFund && mode === 'create')) && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-text-tertiary">
              {t('buddy.setNewGoalHint', { defaultValue: '💡 Tap a suggestion to pre-fill, or type your own below' })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SET_NEW_GOAL_SUGGESTIONS.map((s) => {
                const name = t(s.nameKey);
                return (
                  <button
                    key={s.nameKey}
                    type="button"
                    onClick={() => setFundForm({ name, target: s.target, emoji: s.emoji })}
                    className="text-[10px] px-2 py-1 rounded-full bg-glass-fill border border-glass-border text-text-secondary hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
                  >
                    {s.emoji} {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="fund-emoji" className="text-[11px] text-text-tertiary mb-1.5 block">{t('buddy.dreamFundEmoji')}</label>
            {/* 🔧 P2-11 fix: 30 preset icon grid — tap to select, plus custom emoji input */}
            <div className="grid grid-cols-10 gap-0.5 mb-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFundForm(f => ({ ...f, emoji: icon }))}
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-sm transition-all ${
                    fundForm.emoji === icon
                      ? 'bg-cyan-500/30 border border-cyan-400 scale-110'
                      : 'bg-glass-fill border border-glass-border hover:border-cyan-500/40 hover:bg-glass-fill-strong'
                  }`}
                  aria-label={t('buddy.dreamFund.emojiPickerLabel', { defaultValue: 'Select an icon' })}
                  aria-pressed={fundForm.emoji === icon}
                >
                  {icon}
                </button>
              ))}
            </div>
            {/* Custom emoji input — for emojis not in the preset list */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-tertiary">{t('buddy.dreamFundCustomEmoji', { defaultValue: 'Or type your own:' })}</span>
              <input
                id="fund-emoji"
                type="text"
                value={fundForm.emoji}
                onChange={e => {
                  // 🔧 BUG-036 fix: 只接受 emoji 字符 (Unicode 范围)
                  const val = e.target.value;
                  // 🔧 ARCH fix (Round 34 MEDIUM-2 — emoji 验证 regex 用 .test() (contains) 而非全字符串匹配):
                  //    旧代码 /[\u{1F000}-\u{1FFFF}...]/u.test(val) 检查"包含", 非"全是"。
                  //    用户输入 "a🎯" 会通过验证 → 保存非 emoji 字符到 emoji 字段。
                  //    根因修复: 检查每个 code point 是否都是 emoji。
                  const codePoints = Array.from(val);
                  const isAllEmoji = codePoints.every(cp =>
                    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u.test(cp)
                  );
                  if (val === '' || isAllEmoji) {
                    // 🔧 ARCH fix (Round 19 BUG-R19D-M4 — substring(0, 4) 切坏多字节 emoji):
                    //    旧代码 val.substring(0, 4) 按 UTF-16 code units 切, 复合 emoji (e.g., 👨‍👩‍👧‍👦
                    //    11 code units) 被切成半截 → 渲染乱码。
                    //    根因修复: 用 Array.from(val) 按 code points 切, 取前 2 个 emoji。
                    //    ( maxLength={4} 是 UTF-16 code units, 此处用 2 code points 兼容 maxLength)
                    const emoji = codePoints.slice(0, 2).join('');
                    setFundForm(f => ({ ...f, emoji }));
                  }
                }}
                className="w-16 text-center text-xl bg-glass-fill border border-glass-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-cyan-500/50"
                maxLength={4}
                placeholder="🎯"
              />
            </div>
          </div>
          <div>
            <label htmlFor="fund-name" className="text-[11px] text-text-tertiary mb-1 block">{t('buddy.dreamFundName')}</label>
            <input
              id="fund-name"
              type="text"
              value={fundForm.name}
              onChange={e => setFundForm(f => ({ ...f, name: e.target.value.substring(0, 30) }))}
              placeholder={t('buddy.dreamFundNamePlaceholder')}
              className="w-full text-sm bg-glass-fill border border-glass-border rounded-lg px-3 py-2 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-cyan-500/50"
              maxLength={30}
            />
            {/* 🔧 N43 fix: 名称长度提示 */}
            {fundForm.name.length > 25 && (
              <p className="text-[10px] text-text-tertiary mt-1">{fundForm.name.length}/30</p>
            )}
          </div>
          <div>
            <label htmlFor="fund-target" className="text-[11px] text-text-tertiary mb-1 block">{t('buddy.dreamFundTarget')}</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-text-secondary">$</span>
              {/* 🔧 CL4 fix: Savings 基金无上限 — 编辑时禁用 target 输入, 显示 ∞ */}
              {editingFund?.id === SAVINGS_FUND_ID ? (
                <input
                  type="text"
                  value="∞"
                  disabled
                  className="flex-1 text-sm bg-glass-fill/50 border border-glass-border rounded-lg px-3 py-2 text-text-tertiary cursor-not-allowed"
                />
              ) : (
                <input
                  type="number"
                  value={fundForm.target}
                  // 🔧 P0-2 fix: 不再用 Math.min 静默截断, 保留用户原始输入,
                  //   让超限值显示明确错误提示 (Maximum $X) + Create 按钮 disabled.
                  //   旧代码 Math.min(SAVINGS_FUND_TARGET, ...) 把 9999999999 静默截断为 2147483647,
                  //   用户看不到任何提示, 提交后看到 2147483647 困惑.
                  onChange={e => {
                    const raw = e.target.value;
                    const parsed = raw === '' ? 0 : Number(raw);
                    if (!isNaN(parsed)) {
                      setFundForm(f => ({ ...f, target: parsed }));
                    }
                  }}
                  className="flex-1 text-sm bg-glass-fill border border-glass-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-cyan-500/50"
                  min={100}
                  max={SAVINGS_FUND_TARGET}
                  placeholder="1000"
                />
              )}
            </div>
            {/* 🔧 CL4 fix: Savings 基金显示无上限提示, 普通基金显示 Min/Max 提示 */}
            {editingFund?.id === SAVINGS_FUND_ID ? (
              <p className="text-[10px] text-cyan-400/70 mt-1">
                {t('buddy.dreamFundSavingsNoLimit', { defaultValue: 'No limit — this fund accumulates savings indefinitely' })}
              </p>
            ) : (
              <>
                {/* 🔧 BUG-037 fix: 始终显示 Min/Max 提示, 让用户在按钮 disabled 时知道原因 */}
                <p className="text-[10px] text-text-tertiary mt-1">
                  {t('buddy.dreamFundTargetHint', { defaultValue: 'Min $100' })}
                </p>
                {/* 🔧 N51 fix: 编辑时目标 < 已存金额提示 (NEW-OO fix: 优先显示, 不与 min $100 重叠) */}
                {editingFund && fundForm.target < editingFund.current ? (
                  <p className="text-[10px] text-red-500">
                    {t('buddy.dreamFundTargetTooLow', { defaultValue: `Target cannot be below saved amount ($${editingFund.current})`, saved: editingFund.current })}
                  </p>
                ) : (
                  /* 🔧 BUG-019 fix: Dream Fund 金额验证提示 */
                  fundForm.target > 0 && fundForm.target < 100 && (
                    <p className="text-[10px] text-yellow-500">{t('buddy.dreamFundMinError', { defaultValue: 'Minimum $100' })}</p>
                  )
                )}
                {fundForm.target > SAVINGS_FUND_TARGET && (
                  <p className="text-[10px] text-red-500 font-medium">
                    {t('buddy.dreamFundMaxError', { defaultValue: `Maximum $${SAVINGS_FUND_TARGET.toLocaleString('en-US')} — please enter a smaller amount`, max: SAVINGS_FUND_TARGET.toLocaleString('en-US') })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 text-xs py-2 rounded-lg border border-glass-border text-text-secondary hover:bg-glass-fill transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={
              !fundForm.name.trim() ||
              /* 🔧 CL4 fix: Savings 基金无上限, 跳过 target ≥ 100 验证 (target 字段被禁用) */
              /* 🔧 PM-NEW-77 fix: 也检查 target > 0 防负数 */
              (editingFund?.id !== SAVINGS_FUND_ID && (fundForm.target < 100 || fundForm.target <= 0)) ||
              /* 🔧 P0-2 fix: 检查 target > SAVINGS_FUND_TARGET, 超限时禁用 Create 按钮
                 (旧代码 Math.min 静默截断, 现在保留原值让用户看到错误提示) */
              (editingFund?.id !== SAVINGS_FUND_ID && fundForm.target > SAVINGS_FUND_TARGET) ||
              (!!editingFund && editingFund.id !== SAVINGS_FUND_ID && fundForm.target < editingFund.current)
            }
            className="flex-1 text-xs py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {editingFund ? t('buddy.dreamFundSave') : t('buddy.dreamFundCreate')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
