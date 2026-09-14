// @vitest-environment happy-dom
/**
 * GuardProfileExportSetting 设置区块测试 (batch58-b)
 *
 * 覆盖: 配置摘要随强度/范围/深夜时段各态正确渲染 / 完整版预览含金额 /
 * 样本不足降级 warm 提示 / 拉取失败降级 / 复制按钮反馈 (clipboard stub) /
 * 分享版 amount-free (组件渲染的 shareText 不进 UI, 由红线 lib 测试锁定,
 * 这里锁定预览面完整版含金额、复制回调拿到两版文本)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuardProfileExportSetting } from '../guard-profile-export-setting';

const mockIntensity = { guardIntensity: 'strict' };
const mockScope = { guardScope: { electronics: 'strict', clothing: 'guard', beauty: 'guard', home: 'guard', food: 'guard' } };
const mockNightWindow = { nightWindow: 'nightOwl' };
const mockHourlyRate = { hourlyRate: 25, rateIsDefault: false, setHourlyRate: vi.fn(), isLoading: false };

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'profile.guardProfileTitle': 'My Guard Profile',
        'profile.guardProfileDesc': 'desc',
        'profile.guardProfileCopyFull': 'Copy full version',
        'profile.guardProfileCopyShare': 'Copy share version',
        'profile.guardProfileCopied': 'Copied',
        'profile.guardProfileLoadFailed': 'load failed note',
        'profile.guardProfileShareNote': 'note',
      })[key] || key,
    locale: 'zh',
  }),
}));

vi.mock('@/hooks/use-guard-intensity', () => ({
  useGuardIntensity: () => mockIntensity,
}));
vi.mock('@/hooks/use-guard-scope', () => ({
  useGuardScope: () => mockScope,
}));
vi.mock('@/hooks/use-night-window', () => ({
  useNightWindow: () => mockNightWindow,
}));
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => mockHourlyRate,
}));

const fetchMock = vi.fn();
const buddyStateMock = vi.fn();
vi.mock('@/hooks/use-guard-style-profile', () => ({
  fetchGuardStyleEvents: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock('@/hooks/use-buddy-state-rq', () => ({
  useBuddyStateRQ: () => buddyStateMock(),
}));

const writeText = vi.fn().mockResolvedValue(undefined);

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0);
const FULL_EVENTS = [
  { eventType: 'challenge_completed', metadata: { savedAmount: 40 }, createdAt: d(1).toISOString() },
  { eventType: 'challenge_completed', metadata: { savedAmount: 60 }, createdAt: d(2).toISOString() },
  { eventType: 'challenge_completed', metadata: { savedAmount: 100 }, createdAt: d(2).toISOString() },
  { eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', estSaved: 25 }, createdAt: d(3).toISOString() },
  { eventType: 'mindful_recovery', metadata: { kind: 'reuse_adoption', estSaved: 50 }, createdAt: d(4).toISOString() },
];

describe('GuardProfileExportSetting', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    fetchMock.mockReset();
    buddyStateMock.mockReset().mockReturnValue({ data: { streak: 2, badges: ['impulse_shield'] } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders config summary across intensity/scope/night-window states with full stats (amount visible in full preview)', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardProfileExportSetting />);
    const preview = await waitFor(() => {
      const el = screen.getByTestId('guard-profile-full-preview');
      expect(el.textContent).toContain('$275');
      return el;
    });
    expect(preview.textContent).toContain('坚决');
    expect(preview.textContent).toContain('1 类加严 · 0 类豁免');
    expect(preview.textContent).toContain('夜猫型 00:00–05:00');
    expect(preview.textContent).toContain('$25/小时');
    expect(preview.textContent).toContain('拦截 3 次');

    // 换态: gentle + 全默认范围 + early → 摘要随之变化
    mockIntensity.guardIntensity = 'gentle' as never;
    mockScope.guardScope = { electronics: 'guard', clothing: 'guard', beauty: 'guard', home: 'guard', food: 'guard' } as never;
    mockNightWindow.nightWindow = 'early' as never;
    cleanup();
    render(<GuardProfileExportSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('温和');
    });
    expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('全品类守护');
    expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('早睡型 21:00–24:00');
  });

  it('insufficient (<5 events) → warm note, no savings amount in preview', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS.slice(0, 2));
    render(<GuardProfileExportSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('满 5 次');
    });
    expect(screen.getByTestId('guard-profile-full-preview').textContent).not.toContain('累计省钱估算');
  });

  it('fetch failure → load-failed note + settings-only export', async () => {
    fetchMock.mockRejectedValue(new Error('net'));
    render(<GuardProfileExportSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-load-failed').textContent).toContain('load failed note');
    });
    expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('我的配置');
  });

  it('copy full and share buttons give feedback and copy distinct texts', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardProfileExportSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-full-preview').textContent).toContain('$275');
    });

    fireEvent.click(screen.getByTestId('guard-profile-copy-full'));
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-copy-full').textContent).toBe('Copied');
    });
    expect(writeText.mock.calls[0][0]).toContain('$275');

    fireEvent.click(screen.getByTestId('guard-profile-copy-share'));
    await waitFor(() => {
      expect(screen.getByTestId('guard-profile-copy-share').textContent).toBe('Copied');
    });
    const shareText = writeText.mock.calls[1][0];
    expect(shareText).toContain('拦下了 3 次心动');
    // 分享版红线: 无货币符号/金额 (次数/小时/天数允许)
    expect(shareText).not.toMatch(/[$¥£€]|\d+\s*(元|美元|dollars?)/i);
  });

  it('exports a print-ready full guard archive when enough records exist', async () => {
    const openMock = vi.fn(() => ({
      document: { title: '', body: { innerHTML: '' }, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      opener: window,
    }));
    vi.stubGlobal('open', openMock);
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardProfileExportSetting />);
    const button = await waitFor(() => {
      const el = screen.getByTestId('guard-profile-export-pdf');
      expect(el.textContent).toBe('profile.guardProfileExport.button');
      return el;
    });

    fireEvent.click(button);
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    const archive = openMock.mock.results[0]?.value as ReturnType<typeof open>;
    if (!archive) throw new Error('print window was not opened');
    expect(archive.document.body.innerHTML).toContain('守护战绩总览');
    expect(archive.document.body.innerHTML).toContain('月度热力图摘要');
    expect(archive.document.body.innerHTML).not.toMatch(/\$275|\$25/);
    archive.opener = null;
    vi.unstubAllGlobals();
  });
});
