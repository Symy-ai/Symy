// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuardRuleCoverageSetting } from '../guard-rule-coverage-setting';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: (key: string) => key }),
}));
vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async (text: string) => { copiedText.current = text; }) }),
}));
const copiedText = { current: '' };

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  copiedText.current = '';
});

describe('GuardRuleCoverageSetting', () => {
  it('loads read-only events and exports an amount-free diagnosis', async () => {
    fetchMock.mockImplementation(async (url: URL | string) => ({
      ok: true,
      json: async () => ({
        events: new URL(String(url), 'http://localhost').searchParams.get('event_type') === 'manual_adjustment'
          ? [{ eventType: 'manual_adjustment', createdAt: new Date().toISOString(), metadata: { itemTitle: '演唱会门票', category: 'celebration' } }]
          : [],
      }),
    }));
    render(<GuardRuleCoverageSetting />);
    await waitFor(() => expect(screen.getByTestId('guard-rule-coverage-setting').dataset.status).toBe('partial'));
    fireEvent.click(screen.getByTestId('guard-rule-coverage-copy'));
    expect(copiedText.current).toContain('守护规则自检');
    expect(copiedText.current).toContain('演唱会门票');
    expect(copiedText.current).not.toMatch(/\$|¥|kg|CO2/i);
  });
});
