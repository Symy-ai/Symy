'use client';

import { DepositDialog } from '../deposit-dialog';
// 🛡️ batch6-b: 存入弹窗预选守护目标基金 (用户可在梦想基金换目标, 默认 Savings)
import { getGuardTargetFundId } from '@/lib/guard-ledger';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import type { DreamFund } from '@/types/buddy-state';

interface DepositDialogSectionProps {
  depositDialog: { challengeId: string; savedAmount: number };
  dreamFunds?: DreamFund[];
  onClose: () => void;
  onDeposited: () => void;
}

/**
 * 🔧 信任存入 fix (Round 106): 挑战通过后的存入弹窗
 * 🔧 P0 fix: 客户端预算目标基金 (与 deposit API 逻辑一致), 传给按钮显示 fundName
 * 🔧 PM-P0-1 fix: 传 fundId 给后端, 确保分配到前端显示的 fund (按拖动顺序从上到下第一个未满)
 * (原为 chat-tab.tsx 内联 JSX — File Split Wave 1 纯搬运, 行为零变化)
 * 由父组件条件渲染: {depositDialog && <DepositDialogSection .../>}
 */
export function DepositDialogSection({ depositDialog, dreamFunds, onClose, onDeposited }: DepositDialogSectionProps) {
  const funds = dreamFunds || [];
  // 🛡️ batch6-b: 预选用户守护目标基金 (默认 SAVINGS_FUND_ID); 目标已满/不存在时回退既有自动逻辑
  const guardTargetId = getGuardTargetFundId();
  const targetFund = funds.find(f => f.id === guardTargetId && (f.current || 0) < (f.target || 0))
    ?? funds.find(f => (f.current || 0) < (f.target || 0))
    ?? funds.find(f => f.id === SAVINGS_FUND_ID)
    ?? funds[0];
  return (
    <DepositDialog
      challengeId={depositDialog.challengeId}
      savedAmount={depositDialog.savedAmount}
      fundName={targetFund?.name}
      fundEmoji={targetFund?.emoji}
      fundId={targetFund?.id}
      onClose={onClose}
      onDeposited={onDeposited}
    />
  );
}
