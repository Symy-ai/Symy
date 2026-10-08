// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { MonitorTab } from '../monitor-tab';
import type { EmailConnection, EmailReceipt } from '@/lib/supabase';

const state = vi.hoisted(() => ({
  emailConnections: [] as EmailConnection[],
  emailReceipts: [] as EmailReceipt[],
  scanResult: null as { scanned: number; newReceipts: number } | null,
}));

const mocks = vi.hoisted(() => ({
  calculateImpulseScore: vi.fn(),
  connectGmail: vi.fn(),
  connectIMAP: vi.fn(),
  disconnectGmail: vi.fn(),
  scanEmails: vi.fn(),
  toggleAutoSync: vi.fn(),
  receiptsIgnore: vi.fn(),
  receiptsRefund: vi.fn(),
  markRefunded: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'monitor.autoSyncNext') return `next:${values?.n ?? ''}`;
      return key;
    },
  }),
}));

vi.mock('@/lib/impulse-detector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/impulse-detector')>()),
  calculateImpulseScore: mocks.calculateImpulseScore,
}));

vi.mock('@/lib/demo-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/demo-data')>()),
  generateRandomNotification: () => ({
    id: `receipt-${Math.random()}`,
    platform: 'TikTok Shop',
    item: 'Mock notification',
    amount: 42,
    category: 'Home',
    timestamp: new Date('2026-10-01T10:00:00Z'),
    thumbnail: '🐘',
    isLivestream: false,
    isFlashSale: true,
  }),
}));

vi.mock('../notification-card', () => ({
  NotificationCard: ({ notification, impulseScore, isNew }: {
    notification: { id: string; item: string };
    impulseScore: number;
    isNew: boolean;
  }) => (
    <div
      data-testid="notification-card"
      data-id={notification.id}
      data-item={notification.item}
      data-score={impulseScore}
      data-is-new={isNew}
    />
  ),
}));

vi.mock('../monitor/email-connection-card', () => ({
  EmailConnectionCard: ({
    connections,
    isConnecting,
    isLoadingEmail,
    onConnectGmail,
    onConnectIMAP,
    onDisconnect,
    onScan,
    isScanning,
    scanResult,
    actionableCount,
    autoSyncEnabled,
    nextSyncIn,
    onToggleAutoSync,
  }: {
    connections: EmailConnection[];
    isConnecting: boolean;
    isLoadingEmail: boolean;
    onConnectGmail: () => void;
    onConnectIMAP: (email: string, authCode: string) => void;
    onDisconnect: (id: string) => void;
    onScan: () => void;
    isScanning: boolean;
    scanResult: { scanned: number; newReceipts: number } | null;
    actionableCount: number;
    autoSyncEnabled: boolean;
    nextSyncIn: number;
    onToggleAutoSync: () => void;
  }) => (
    <div
      data-testid="email-connection-card"
      data-connections={connections.map((connection) => connection.id).join(',')}
      data-is-connecting={isConnecting}
      data-is-loading-email={isLoadingEmail}
      data-is-scanning={isScanning}
      data-scan-result={scanResult ? `${scanResult.scanned}/${scanResult.newReceipts}` : ''}
      data-actionable-count={actionableCount}
      data-auto-sync-enabled={autoSyncEnabled}
      data-next-sync-in={nextSyncIn}
    >
      <button type="button" onClick={onConnectGmail}>mock gmail</button>
      <button type="button" onClick={() => onConnectIMAP('imap@example.com', 'code')}>mock imap</button>
      <button type="button" onClick={() => onDisconnect('connection-1')}>mock disconnect</button>
      <button type="button" onClick={onScan}>mock scan</button>
      <button type="button" onClick={onToggleAutoSync}>mock sync</button>
    </div>
  ),
}));

vi.mock('../monitor/email-receipts-list', () => ({
  EmailReceiptsList: ({ receipts, onTalkToAI, onIgnore, onRefund, onMarkRefunded, isDemoMode }: {
    receipts: EmailReceipt[];
    onTalkToAI: (context: { platform: string; amount: number; reasons: string[]; time: string }) => void;
    onIgnore: (id: string) => void;
    onRefund: (id: string) => void;
    onMarkRefunded?: (id: string) => void;
    isDemoMode?: boolean;
  }) => (
    <div
      data-testid="email-receipts-list"
      data-receipts={receipts.map((receipt) => receipt.id).join(',')}
      data-is-demo-mode={isDemoMode}
    >
      <button type="button" onClick={() => onTalkToAI({ platform: 'amazon', amount: 42, reasons: ['high amount'], time: '10:00' })}>mock talk</button>
      <button type="button" onClick={() => onIgnore('receipt-1')}>mock ignore</button>
      <button type="button" onClick={() => onRefund('receipt-1')}>mock refund</button>
      {onMarkRefunded && <button type="button" onClick={() => onMarkRefunded('receipt-1')}>mock refunded</button>}
    </div>
  ),
}));

vi.mock('../monitor/toast-notification', () => ({
  ToastNotification: ({ toast, onDismiss }: {
    toast: { message: string; type: 'success' | 'info' };
    onDismiss: () => void;
  }) => (
    <div data-testid="toast-notification" data-type={toast.type}>
      {toast.message}
      <button type="button" onClick={onDismiss}>mock dismiss</button>
    </div>
  ),
}));

vi.mock('../monitor/hooks/use-email-monitor', () => ({
  useEmailMonitor: (_setToast: (toast: { message: string; type: 'success' | 'info' } | null) => void, isDemoRef: RefObject<boolean>) => ({
    emailConnections: state.emailConnections,
    emailReceipts: state.emailReceipts,
    setEmailReceipts: vi.fn(),
    emailReceiptsRef: { current: state.emailReceipts },
    isLoadingEmail: !isDemoRef.current,
    isConnecting: false,
    isScanning: false,
    scanResult: state.scanResult,
    autoSyncEnabled: state.emailConnections.some((connection) => connection.status === 'active'),
    nextSyncIn: 120,
    hasActiveEmail: state.emailConnections.some((connection) => connection.status === 'active'),
    handleConnectGmail: mocks.connectGmail,
    handleConnectIMAP: mocks.connectIMAP,
    handleDisconnectGmail: mocks.disconnectGmail,
    handleScanEmails: mocks.scanEmails,
    handleToggleAutoSync: mocks.toggleAutoSync,
    pendingIgnoresRef: { current: new Set<string>() },
  }),
}));

vi.mock('../monitor/hooks/use-receipt-actions', () => ({
  useReceiptActions: () => ({
    handleReceiptsIgnore: mocks.receiptsIgnore,
    handleReceiptsRefund: mocks.receiptsRefund,
    handleMarkRefunded: mocks.markRefunded,
  }),
}));

function connection(id = 'connection-1', status = 'active' as never): EmailConnection {
  return {
    id,
    user_id: 'user-1',
    email_address: 'user@example.com',
    provider: 'gmail',
    access_token: 'token',
    token_expiry: '',
    scopes: [],
    status,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function receipt(id = 'receipt-1', overrides: Partial<EmailReceipt> = {}): EmailReceipt {
  return {
    id,
    user_id: 'user-1',
    connection_id: 'connection-1',
    message_id: `message-${id}`,
    from_address: 'orders@example.com',
    subject: 'Your order',
    snippet: '',
    platform: 'amazon',
    item_name: 'Espresso machine',
    amount: 42,
    currency: 'USD',
    received_at: '2026-10-01T10:00:00Z',
    impulse_score: 88,
    refund_eligible: true,
    status: 'actionable',
    created_at: '2026-10-01T10:01:00Z',
    ...overrides,
  };
}


function setupScore(score: number) {
  mocks.calculateImpulseScore.mockReturnValue({ score, reasons: ['mock reason'] });
}

function props(overrides = {}) {
  return {
    onTalkToAI: vi.fn(),
    onImpulseAlert: vi.fn(),
    isDemo: false,
    onAuthPrompt: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  state.emailConnections = [];
  state.emailReceipts = [];
  state.scanResult = null;
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MonitorTab — 装配', () => {
  it('未连接邮箱时渲染暂停状态、连接卡、收据视图与空态', () => {
    render(<MonitorTab {...props()} />);

    expect(screen.getByText('monitor.connectEmailToMonitor')).toBeTruthy();
    expect(screen.getByText('monitor.statusLabels.paused')).toBeTruthy();
    expect(screen.getByTestId('email-connection-card')).toBeTruthy();
    expect(screen.getByTestId('email-receipts-list').getAttribute('data-receipts')).toBe('');
    expect(screen.queryByText('monitor.latestImpulseScore')).toBeNull();
    expect(screen.queryByTestId('notification-card')).toBeNull();
  });

  it('未连接时可启动内部 Demo Mode 并进入通知视图', () => {
    setupScore(30);
    render(<MonitorTab {...props()} />);
    fireEvent.click(screen.getByText('monitor.demoModeOff'));
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText('monitor.demoModeOn')).toBeTruthy();
    expect(screen.getByText('monitor.statusLabels.demoMode')).toBeTruthy();
    // demo 开启不自动切视图 — 手动切到通知视图后显示空态
    fireEvent.click(screen.getByText('monitor.notifications'));
    expect(screen.getByText('monitor.noNotificationsTitle')).toBeTruthy();
  });

  it('页级 Demo 不挂载连接卡，显示注册引导并进入通知视图', () => {
    render(<MonitorTab {...props({ isDemo: true })} />);

    expect(screen.queryByTestId('email-connection-card')).toBeNull();
    expect(screen.getByText('monitor.emailMonitor')).toBeTruthy();
    expect(screen.getByText('monitor.signUpToConnect')).toBeTruthy();
    expect(screen.getByText('monitor.privacyNote')).toBeTruthy();
    expect(screen.queryByText('monitor.noNotificationsTitle')).toBeTruthy();
  });

  it('页级 Demo 的邮箱注册引导走 onAuthPrompt("connect_email")', () => {
    const onAuthPrompt = vi.fn();
    render(<MonitorTab {...props({ isDemo: true, onAuthPrompt })} />);
    fireEvent.click(screen.getByText('monitor.signUpToConnect'));

    expect(onAuthPrompt).toHaveBeenCalledWith('connect_email');
  });

  it('页级 Demo 首条通知生成事件、通知卡与分数条', () => {
    setupScore(65);
    const demoProps = props({ isDemo: true });
    render(<MonitorTab {...demoProps} />);
    // 真实时序: 首条通知由 6s interval 产生 — render 时空, 推进 6s 后有卡
    act(() => {
      vi.advanceTimersByTime(6100);
    });

    const card = screen.getByTestId('notification-card');
    expect(card.getAttribute('data-score')).toBe('65');
    expect(card.getAttribute('data-is-new')).toBe('true');
    expect(screen.getByText('monitor.latestImpulseScore')).toBeTruthy();
    expect(screen.getByText('monitor.talkToAI')).toBeTruthy();
    expect(screen.getByText('monitor.refund')).toBeTruthy();

    // 页级 demo guard: handleAlertRefund 检 isDemoRef → onAuthPrompt('refund') 直接返回, 不打退款 API
    fireEvent.click(screen.getByText('monitor.refund'));
    expect(demoProps.onAuthPrompt).toHaveBeenCalledWith('refund');

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getAllByTestId('notification-card')).toHaveLength(2);
  });

  it('页级 Demo 高分通知不触发真实 onImpulseAlert', () => {
    setupScore(90);
    const onImpulseAlert = vi.fn();
    render(<MonitorTab {...props({ isDemo: true, onImpulseAlert })} />);

    expect(onImpulseAlert).not.toHaveBeenCalled();
  });

  it('有活跃连接时同步状态、连接卡映射与最新收据事件', async () => {
    state.emailConnections = [connection()];
    state.emailReceipts = [receipt()];
    state.scanResult = { scanned: 12, newReceipts: 3 };
    render(<MonitorTab {...props()} />);
    await act(async () => {});

    expect(screen.getByText('next:2:00')).toBeTruthy();
    expect(screen.getByText('monitor.statusLabels.emailActive')).toBeTruthy();
    const card = screen.getByTestId('email-connection-card');
    expect(card.getAttribute('data-connections')).toBe('connection-1');
    expect(card.getAttribute('data-actionable-count')).toBe('1');
    expect(card.getAttribute('data-scan-result')).toBe('12/3');
    expect(card.getAttribute('data-auto-sync-enabled')).toBe('true');
    expect(screen.getByText('monitor.latestImpulseScore')).toBeTruthy();
    // latestScore 是 demo 通知驱动的 state (初始 0) — 收据 impulse_score 不直接上屏
  });

  it('连接卡动作回调逐项接线', () => {
    state.emailConnections = [connection()];
    render(<MonitorTab {...props()} />);
    fireEvent.click(screen.getByText('mock gmail'));
    fireEvent.click(screen.getByText('mock imap'));
    fireEvent.click(screen.getByText('mock disconnect'));
    fireEvent.click(screen.getByText('mock scan'));
    fireEvent.click(screen.getByText('mock sync'));

    expect(mocks.connectGmail).toHaveBeenCalledTimes(1);
    expect(mocks.connectIMAP).toHaveBeenCalledWith('imap@example.com', 'code');
    expect(mocks.disconnectGmail).toHaveBeenCalledWith('connection-1');
    expect(mocks.scanEmails).toHaveBeenCalledTimes(1);
    expect(mocks.toggleAutoSync).toHaveBeenCalledTimes(1);
  });

  it('活跃邮箱下通知空态显示 all clear，且不提供启动 Demo 按钮', () => {
    state.emailConnections = [connection()];
    render(<MonitorTab {...props()} />);
    fireEvent.click(screen.getByText('monitor.notifications'));

    expect(screen.getByText('monitor.allClearTitle')).toBeTruthy();
    expect(screen.queryByText('monitor.startDemoMode')).toBeNull();
  });

  it('收据列表接收状态与操作回调', () => {
    state.emailReceipts = [receipt('receipt-1'), receipt('receipt-2')];
    const onTalkToAI = vi.fn();
    const { rerender } = render(<MonitorTab {...props({ onTalkToAI })} />);
    const list = screen.getByTestId('email-receipts-list');
    expect(list.getAttribute('data-receipts')).toBe('receipt-1,receipt-2');
    expect(list.getAttribute('data-is-demo-mode')).toBe('false');
    fireEvent.click(screen.getByText('mock talk'));
    expect(onTalkToAI).toHaveBeenCalledWith({ platform: 'amazon', amount: 42, reasons: ['high amount'], time: '10:00' });
    fireEvent.click(screen.getByText('mock ignore'));
    fireEvent.click(screen.getByText('mock refund'));
    fireEvent.click(screen.getByText('mock refunded'));
    expect(mocks.receiptsIgnore).toHaveBeenCalledWith('receipt-1');
    expect(mocks.receiptsRefund).toHaveBeenCalledWith('receipt-1');
    expect(mocks.markRefunded).toHaveBeenCalledWith('receipt-1');
    expect(rerender).toBeTruthy();
  });

  it('低分 Demo 通知只显示分数条，不显示干预动作', () => {
    setupScore(45);
    render(<MonitorTab {...props({ isDemo: true })} />);
    act(() => {
      vi.advanceTimersByTime(6100);
    });

    expect(screen.getByText('monitor.latestImpulseScore')).toBeTruthy();
    expect(screen.queryByText('monitor.talkToAI')).toBeNull();
    expect(screen.queryByText('monitor.refund')).toBeNull();
  });

  it('活跃邮箱时页级 Demo 切回保持 Demo 状态而非邮箱视图', async () => {
    setupScore(30);
    state.emailConnections = [connection()];
    const { rerender } = render(<MonitorTab {...props()} />);
    await act(async () => {});
    fireEvent.click(screen.getByText('monitor.notifications'));
    rerender(<MonitorTab {...props({ isDemo: true })} />);
    await act(async () => {});
    // 切到页级 demo 后 6s interval 产生首条通知
    act(() => {
      vi.advanceTimersByTime(6100);
    });

    expect(screen.queryByTestId('email-connection-card')).toBeNull();
    expect(screen.queryByTestId('notification-card')).toBeTruthy();
  });
});
