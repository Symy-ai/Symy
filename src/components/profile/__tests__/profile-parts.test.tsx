// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AboutModal, EmailConnectionSetting, FeaturePreviewCard } from '../profile-parts';
import type { EmailConnection } from '@/lib/supabase';

const i18nMock = vi.hoisted(() => ({
  t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
    const dict: Record<string, string> = {
      'profile.emailConnected': 'Email Connected',
      'profile.emailExpired': 'Email Expired',
      'profile.emailMonitor': '📧 Guard your orders',
      'profile.tapToConnectEmail': 'Let Symy guard your spending',
      'profile.emailMonitorVIP': '📧 Let Symy watch my orders',
      'profile.emailMonitorVIPDesc': 'Join the waitlist, and Symy will notify you when it’s ready',
      'common.disconnect': 'Disconnect',
      'about.title': 'Symy AI',
      'about.tagline': 'You already know.',
      'about.visitSite': 'Visit symy.ai →',
    };
    let text = dict[key] ?? values?.defaultValue ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      if (name !== 'defaultValue') text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  },
}));
const openMock = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: i18nMock.t, locale: 'en' }),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

function makeConnection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: 'conn-1',
    user_id: 'user-1',
    email_address: 'spark@example.com',
    provider: 'gmail',
    access_token: 'token',
    token_expiry: '2026-01-01T00:00:00Z',
    scopes: [],
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('open', openMock);
});

afterEach(() => {
  cleanup();
  openMock.mockReset();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EmailConnectionSetting', () => {
  it('活跃连接优先于过期连接，展示邮箱并支持点击跳转', () => {
    const onNavigateMonitor = vi.fn();
    render(
      <EmailConnectionSetting
        connections={[
          makeConnection({ status: 'expired', email_address: 'expired@example.com' }),
          makeConnection({ id: 'active-1' }),
        ]}
        onDisconnect={vi.fn()}
        onNavigateMonitor={onNavigateMonitor}
      />,
    );

    fireEvent.click(screen.getByText('Email Connected'));
    expect(screen.getByText('spark@example.com')).toBeTruthy();
    expect(screen.queryByText('Email Expired')).toBeNull();
    expect(onNavigateMonitor).toHaveBeenCalledTimes(1);
  });

  it('活跃连接的 Enter 与 Space 均触发跳转，Disconnect 阻断冒泡并回调 id', () => {
    const onDisconnect = vi.fn();
    const onNavigateMonitor = vi.fn();
    render(
      <EmailConnectionSetting
        connections={[makeConnection()]}
        onDisconnect={onDisconnect}
        onNavigateMonitor={onNavigateMonitor}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: /Email Connected/ }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: /Email Connected/ }), { key: ' ' });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(onNavigateMonitor).toHaveBeenCalledTimes(2);
    expect(onDisconnect).toHaveBeenCalledWith('conn-1');
  });

  it('无活跃连接时展示过期邮箱并支持跳转', () => {
    const onNavigateMonitor = vi.fn();
    render(
      <EmailConnectionSetting
        connections={[makeConnection({ status: 'expired' })]}
        onDisconnect={vi.fn()}
        onNavigateMonitor={onNavigateMonitor}
      />,
    );

    fireEvent.click(screen.getByText('Email Expired'));
    expect(screen.getByText('spark@example.com')).toBeTruthy();
    expect(onNavigateMonitor).toHaveBeenCalledTimes(1);
  });

  it('非 VIP 且无连接时展示 VIP 内测入口与候补表单', () => {
    render(
      <EmailConnectionSetting
        connections={[]}
        onDisconnect={vi.fn()}
        isVIPEnabled={false}
      />,
    );

    expect(screen.getByText('📧 Let Symy watch my orders')).toBeTruthy();
    expect(screen.getByText('Join the waitlist, and Symy will notify you when it’s ready')).toBeTruthy();
    expect(screen.getByText('VIP')).toBeTruthy();
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
  });

  it('VIP 且无连接时展示连接入口，点击与 Enter 均跳转', () => {
    const onNavigateMonitor = vi.fn();
    render(
      <EmailConnectionSetting
        connections={[]}
        onDisconnect={vi.fn()}
        onNavigateMonitor={onNavigateMonitor}
        isVIPEnabled
      />,
    );

    const entry = screen.getByRole('button', { name: /📧 Guard your orders/ });
    fireEvent.click(entry);
    fireEvent.keyDown(entry, { key: 'Enter' });

    expect(onNavigateMonitor).toHaveBeenCalledTimes(2);
  });
});

describe('FeaturePreviewCard', () => {
  it('渲染图标、标题与描述', () => {
    render(<FeaturePreviewCard icon={<span>icon-x</span>} title="Impulse Protection" description="Pause before checkout." />);

    expect(screen.getByText('icon-x')).toBeTruthy();
    expect(screen.getByText('Impulse Protection')).toBeTruthy();
    expect(screen.getByText('Pause before checkout.')).toBeTruthy();
  });
});

describe('AboutModal', () => {
  it('渲染关于内容、访问当前环境首页并关闭', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Symy AI' })).toBeTruthy();
    fireEvent.click(screen.getByText('Visit symy.ai →'));
    expect(window.open).toHaveBeenCalledWith(window.location.origin, '_blank', 'noopener,noreferrer');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩关闭，点击内容区不关闭', () => {
    const onClose = vi.fn();
    const { container } = render(<AboutModal onClose={onClose} />);
    fireEvent.click(screen.getByText('Why Symy?'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.ownerDocument.querySelector('.fixed.inset-0')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
