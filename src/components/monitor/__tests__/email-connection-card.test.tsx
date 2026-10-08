// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmailConnectionCard } from '../email-connection-card';
import type { EmailConnection } from '@/lib/supabase';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      ({
        'monitor.gmailConnected': 'Gmail connected',
        'monitor.imapConnected': 'IMAP connected',
        'monitor.disconnect': 'Disconnect',
        'monitor.reSync': 'Re-sync',
        'monitor.syncing': 'Syncing',
        'monitor.autoSyncOn': 'Auto-sync on',
        'monitor.autoEvery5m': 'Auto every 5m',
        'monitor.scannedEmails': 'Scanned {n}, new {m}',
        'monitor.purchasesNeedAttention': '{n} purchases need attention',
        'monitor.gmailTokenExpired': 'Gmail token expired',
        'monitor.reAuthorizeGmail': 'Re-authorize Gmail',
        'monitor.connectYourEmail': 'Connect your email',
        'monitor.connectGmail': 'Connect Gmail',
        'monitor.connectIMAP': 'Connect IMAP',
        'monitor.emailAddress': 'Email address',
        'monitor.authorizationCode': 'Authorization code',
        'monitor.connect': 'Connect',
        'common.cancel': 'Cancel',
      })[key]?.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? '')) ?? key,
    locale: 'en',
  }),
}));

function connection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: 'connection-1',
    user_id: 'user-1',
    email_address: 'user@example.com',
    provider: 'gmail',
    access_token: 'token',
    token_expiry: '2026-11-01T00:00:00Z',
    scopes: [],
    status: 'active',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(overrides: Partial<Parameters<typeof EmailConnectionCard>[0]> = {}) {
  const props = {
    connections: [connection()],
    isConnecting: false,
    isLoadingEmail: false,
    onConnectGmail: vi.fn(),
    onConnectIMAP: vi.fn(),
    onDisconnect: vi.fn(),
    onScan: vi.fn(),
    isScanning: false,
    scanResult: null,
    actionableCount: 0,
    autoSyncEnabled: false,
    nextSyncIn: 0,
    onToggleAutoSync: vi.fn(),
    ...overrides,
  };
  render(<EmailConnectionCard {...props} />);
  return props;
}

afterEach(cleanup);

describe('EmailConnectionCard', () => {
  it('renders the loading skeleton before actions', () => {
    renderCard({ isLoadingEmail: true, connections: [] });
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the first active connection and disconnects by id', () => {
    const props = renderCard({
      connections: [connection({ status: 'expired', email_address: 'expired@example.com' }), connection({ id: 'active-1' })],
    });
    expect(screen.getByText('Gmail connected')).toBeTruthy();
    expect(screen.getByText('user@example.com')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Disconnect'));
    expect(props.onDisconnect).toHaveBeenCalledWith('active-1');
  });

  it('labels IMAP active connections', () => {
    renderCard({ connections: [connection({ provider: 'imap_qq' })] });
    expect(screen.getByText('IMAP connected')).toBeTruthy();
  });

  it('supports scanning state and actions', () => {
    const props = renderCard({ isScanning: true, autoSyncEnabled: true, nextSyncIn: 65 });
    const resync = screen.getByRole('button', { name: /syncing/i });
    expect((resync as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByText('Auto every 5m')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Auto-sync on'));
    expect(props.onScan).not.toHaveBeenCalled();
    expect(props.onToggleAutoSync).toHaveBeenCalledTimes(1);
  });

  it('runs scan, toggle, and shows scan results when idle', () => {
    const props = renderCard({ scanResult: { scanned: 12, newReceipts: 3 }, actionableCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: /re-sync/i }));
    expect(props.onScan).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Scanned 12, new 3')).toBeTruthy();
    expect(screen.getByText('2 purchases need attention')).toBeTruthy();
  });

  it('shows expired state and re-authorizes through Gmail', () => {
    const props = renderCard({ connections: [connection({ status: 'expired' })], isConnecting: true });
    expect(screen.getByText('Gmail token expired')).toBeTruthy();
    const button = screen.getByRole('button', { name: /re-authorize gmail/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(props.onConnectGmail).not.toHaveBeenCalled();
  });

  it('opens IMAP form, submits credentials, and waits for callback resolution', async () => {
    const onConnectIMAP = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    renderCard({ connections: [], onConnectIMAP });
    fireEvent.click(screen.getByRole('button', { name: /connect imap/i }));
    fireEvent.change(screen.getByPlaceholderText('monitor.imapPlaceholder'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('monitor.imapAuthPlaceholder'), { target: { value: 'auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: /connect$/i }));
    await screen.findByText('Connect your email');
    expect(onConnectIMAP).toHaveBeenCalledWith('user@example.com', 'auth-code');
  });

  it('keeps IMAP inputs and the form open when connection fails', async () => {
    const onConnectIMAP = vi.fn(() => Promise.reject(new Error('rejected')));
    renderCard({ connections: [], onConnectIMAP });
    fireEvent.click(screen.getByRole('button', { name: /connect imap/i }));
    const email = screen.getByPlaceholderText('monitor.imapPlaceholder');
    const code = screen.getByPlaceholderText('monitor.imapAuthPlaceholder');
    fireEvent.change(email, { target: { value: 'retry@example.com' } });
    fireEvent.change(code, { target: { value: 'bad-code' } });
    fireEvent.click(screen.getByRole('button', { name: /connect$/i }));
    await Promise.resolve();
    expect((email as HTMLInputElement).value).toBe('retry@example.com');
    expect((code as HTMLInputElement).value).toBe('bad-code');
    expect(screen.getByPlaceholderText('monitor.imapPlaceholder')).toBeTruthy();
  });

  it('cancels IMAP form and clears entered credentials', () => {
    renderCard({ connections: [] });
    fireEvent.click(screen.getByRole('button', { name: /connect imap/i }));
    fireEvent.change(screen.getByPlaceholderText('monitor.imapPlaceholder'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('monitor.imapAuthPlaceholder'), { target: { value: 'auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /connect gmail/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /connect imap/i }));
    expect((screen.getByPlaceholderText('monitor.imapPlaceholder') as HTMLInputElement).value).toBe('');
  });
});
