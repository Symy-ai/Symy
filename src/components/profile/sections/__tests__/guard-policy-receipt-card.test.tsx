// @vitest-environment happy-dom
/**
 * GuardPolicyReceiptCard 直测 (batch78-a)
 *
 * 策略回执卡是纯展示组件: changes 里的 label/before/after/effect 全部是
 * BilingualText, 按 locale 取词后拼 "label: before → after. effect"。
 * 时薪类变更文案走 guard-policy-diff valueText ("25 per hour"/"每小时 25"),
 * 设计上无货币符号 — 本文件顺带锁该零金额红线。
 * 锁: 空数组降级、双语取词、四状态 (saved/incomplete/restored/restore-failed)、
 * isRestoring 禁用、按钮回调。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardPolicyReceiptCard, type GuardPolicyReceiptStatus } from '../guard-policy-receipt-card';
import type { GuardPolicyChange } from '@/lib/guard-policy-diff';

const TRANSLATIONS: Record<string, string> = {
  'profile.guardPolicyReceiptApplied': '{count} changes applied',
  'profile.guardPolicyReceiptTitle': 'Policy receipt',
  'profile.guardPolicyIncompleteWarning': 'Some channels failed to sync',
  'profile.guardPolicyRestoreFailedWarning': 'Restore failed',
  'profile.guardPolicyRestoring': 'Restoring…',
  'profile.guardPolicyRestorePrevious': 'Restore previous',
  'profile.guardPolicyReceiptDone': 'Done',
};
const t = (key: string) => TRANSLATIONS[key] ?? key;

function change(overrides: Partial<GuardPolicyChange> = {}): GuardPolicyChange {
  return {
    field: 'intensity',
    label: { zh: '守护强度', en: 'Guard intensity' },
    before: { zh: '均衡', en: 'Balanced' },
    after: { zh: '严格', en: 'Strict' },
    effect: { zh: '触发更严格', en: 'Stricter nudges' },
    ...overrides,
  };
}

const HOURLY_CHANGE: GuardPolicyChange = {
  field: 'hourlyRate',
  label: { zh: '时薪', en: 'Hourly rate' },
  before: { zh: '每小时 25', en: '25 per hour' },
  after: { zh: '每小时 40', en: '40 per hour' },
  effect: { zh: '时间换算更新', en: 'Time math updated' },
};

function renderCard(props: {
  changes?: readonly GuardPolicyChange[];
  status?: GuardPolicyReceiptStatus;
  isRestoring?: boolean;
  locale?: 'zh' | 'en';
  onRestore?: () => void;
  onClose?: () => void;
}) {
  return render(
    <GuardPolicyReceiptCard
      changes={props.changes ?? [change()]}
      status={props.status ?? 'saved'}
      isRestoring={props.isRestoring ?? false}
      locale={props.locale ?? 'en'}
      t={t}
      onRestore={props.onRestore ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />
  );
}

afterEach(cleanup);

describe('GuardPolicyReceiptCard 空数据降级', () => {
  it('空 changes 数组: 正常渲染, 标题计数为 0, 行区为空, 无 NaN/undefined', () => {
    const { container } = renderCard({ changes: [] });
    expect(screen.getByTestId('guard-policy-receipt').getAttribute('data-status')).toBe('saved');
    expect(screen.getByTestId('guard-policy-receipt-title').textContent).toBe('0 changes applied');
    expect(screen.getByTestId('guard-policy-receipt-rows').children.length).toBe(0);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('空数组 + 非 saved 状态: 警示行照常出现', () => {
    renderCard({ changes: [], status: 'incomplete' });
    expect(screen.getByTestId('guard-policy-incomplete-warning').textContent).toBe(
      'Some channels failed to sync'
    );
    expect(screen.getByTestId('guard-policy-receipt-title').textContent).toBe('Policy receipt');
  });
});

describe('GuardPolicyReceiptCard 行渲染与双语', () => {
  it('en: 行文案 === "label: before → after. effect"', () => {
    renderCard({ changes: [change(), HOURLY_CHANGE] });
    const rows = screen.getByTestId('guard-policy-receipt-rows').children;
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toBe('Guard intensity: Balanced → Strict. Stricter nudges');
    expect(rows[1].textContent).toBe('Hourly rate: 25 per hour → 40 per hour. Time math updated');
  });

  it('zh: 取中文词, 拼接结构不变', () => {
    renderCard({ changes: [change()], locale: 'zh' });
    const row = screen.getByTestId('guard-policy-receipt-intensity');
    expect(row.textContent).toBe('守护强度: 均衡 → 严格. 触发更严格');
  });

  it('每行有 field 级 testid', () => {
    renderCard({ changes: [change(), HOURLY_CHANGE] });
    expect(screen.getByTestId('guard-policy-receipt-intensity')).toBeTruthy();
    expect(screen.getByTestId('guard-policy-receipt-hourlyRate')).toBeTruthy();
  });

  it('行文案零货币符号 (时薪走 "N per hour" 约定, 不走 $)', () => {
    const { container } = renderCard({ changes: [HOURLY_CHANGE] });
    expect(container.textContent).not.toMatch(/[$¥€]/);
  });
});

describe('GuardPolicyReceiptCard 状态与交互', () => {
  it('saved 无警示; incomplete 显示未同步警示; restore-failed 显示恢复失败警示', () => {
    const { rerender } = renderCard({ status: 'saved' });
    expect(screen.queryByTestId('guard-policy-incomplete-warning')).toBeNull();
    expect(screen.queryByTestId('guard-policy-restore-warning')).toBeNull();

    rerender(
      <GuardPolicyReceiptCard
        changes={[change()]}
        status="incomplete"
        isRestoring={false}
        locale="en"
        t={t}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('guard-policy-incomplete-warning')).toBeTruthy();

    rerender(
      <GuardPolicyReceiptCard
        changes={[change()]}
        status="restore-failed"
        isRestoring={false}
        locale="en"
        t={t}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('guard-policy-restore-warning')).toBeTruthy();
  });

  it('restored 状态: 标题用普通标题, 无警示', () => {
    renderCard({ changes: [], status: 'restored' });
    expect(screen.getByTestId('guard-policy-receipt-title').textContent).toBe('Policy receipt');
    expect(screen.queryByTestId('guard-policy-incomplete-warning')).toBeNull();
    expect(screen.queryByTestId('guard-policy-restore-warning')).toBeNull();
  });

  it('isRestoring: 按钮禁用且显示 Restoring, 点击不触发 onRestore', () => {
    const onRestore = vi.fn();
    renderCard({ isRestoring: true, onRestore });
    const restoreBtn = screen.getByTestId('guard-policy-restore') as HTMLButtonElement;
    expect(restoreBtn.hasAttribute('disabled')).toBe(true);
    expect(restoreBtn.textContent).toBe('Restoring…');
    fireEvent.click(restoreBtn);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('非 restoring: 点击回调 onRestore/onClose', () => {
    const onRestore = vi.fn();
    const onClose = vi.fn();
    renderCard({ onRestore, onClose });
    fireEvent.click(screen.getByTestId('guard-policy-restore'));
    expect(onRestore).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('guard-policy-receipt-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
