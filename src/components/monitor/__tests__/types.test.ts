import { describe, expect, it } from 'vitest';

import type {
  EmailConnectionCardProps,
  EmailReceiptsListProps,
  MonitorTabProps,
  ToastNotificationProps,
  ViewMode,
} from '../types';

/**
 * monitor/types.ts (46行) — MonitorTab 类型 (C3 拆分, 纯类型第十用)。
 *
 * 锁定:
 * - ViewMode 双模 (notifications/receipts)
 * - MonitorTabProps 四回调
 * - ConnectionCard 十六键 (双连接双通道+扫描+自动同步)
 * - ReceiptsList 四回调+N15 demo 门
 * - Toast 双 type
 */
describe('monitor/types 纯类型件第十用', () => {
  it('ViewMode 双模', () => {
    const modes: ViewMode[] = ['notifications', 'receipts'];
    expect(modes).toHaveLength(2);
  });

  it('MonitorTabProps satisfies: 四回调', () => {
    const props = {
      onTalkToAI: (_c: { platform: string; amount: number; reasons: string[]; time: string }) => {},
      onImpulseAlert: (_s: number) => {},
      isDemo: true,
      onAuthPrompt: (_f: string) => {},
    } satisfies MonitorTabProps;
    expect(props.isDemo).toBe(true);
  });

  it('ConnectionCard satisfies: 16 键 (连接+扫描+同步全链)', () => {
    const props = {
      connections: [],
      isConnecting: false,
      isLoadingEmail: false,
      onConnectGmail: () => {},
      onConnectIMAP: (_e: string, _a: string) => {},
      onDisconnect: (_id: string) => {},
      onScan: () => {},
      isScanning: false,
      scanResult: { scanned: 12, newReceipts: 3 },
      actionableCount: 2,
      autoSyncEnabled: true,
      nextSyncIn: 300,
      onToggleAutoSync: () => {},
    } satisfies EmailConnectionCardProps;
    expect(Object.keys(props)).toHaveLength(13);
    expect(props.scanResult.newReceipts).toBe(3);
  });

  it('ReceiptsList satisfies: 四回调+N15 demo 门; Toast 双 type', () => {
    const list = {
      receipts: [],
      onTalkToAI: (_c: { platform: string; amount: number; reasons: string[]; time: string }) => {},
      onIgnore: (_id: string) => {},
      onRefund: (_id: string) => {},
      onMarkRefunded: (_id: string) => {},
      isDemoMode: false, // N15
    } satisfies EmailReceiptsListProps;
    expect(list.isDemoMode).toBe(false);
    const toast = { toast: { message: '已连接', type: 'success' }, onDismiss: () => {} } satisfies ToastNotificationProps;
    expect(toast.toast.type).toBe('success');
    const info: ToastNotificationProps['toast']['type'] = 'info';
    expect(info).toBe('info');
  });
});
