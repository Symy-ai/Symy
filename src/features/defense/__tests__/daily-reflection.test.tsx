/**
 * Component tests for DailyReflection
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DailyReflection } from '@/features/defense/components/daily-reflection';
import { apiFetch } from '@/lib/api-client';

let testLocale: 'en' | 'zh' = 'en';

const createMockUseI18n = () => ({
  t: (key: string, values?: Record<string, string>) => {
    const map: Record<string, string> = {
      'inward.dailyReflectionTitle': 'Reflection',
      'inward.dailyReflectionSubtitle': 'Observe',
      'inward.dailyReflectionPrompt1': 'Prompt 1',
      'inward.dailyReflectionPlaceholder': 'Share...',
      'inward.dailyReflectionSubmit': 'Share',
      'inward.dailyReflectionReactions': 'Resonates',
      'inward.dailyReflectionEmpty': 'No reflections yet.',
      'inward.dailyReflectionAuthPrompt': 'Sign up to share',
      'inward.dailyReflectionSubmitError': 'Submit failed — try again.',
    };
    let text = map[key] || key;
    if (values) {
      Object.entries(values).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  },
  locale: testLocale,
  setLocale: () => {},
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => createMockUseI18n(),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  testLocale = 'en';
  vi.clearAllMocks();
});

describe('DailyReflection', () => {
  it('renders seeded demo reflections without calling API', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ reflections: [] } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={true} />
      </Wrapper>,
    );

    expect(await screen.findByText(/I realized I was buying things/)).toBeTruthy();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it('renders zh seed reflections when locale is zh', async () => {
    testLocale = 'zh';
    vi.mocked(apiFetch).mockResolvedValue({ reflections: [] } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={true} />
      </Wrapper>,
    );

    expect(await screen.findByText('我意识到自己买东西是为了找回掌控感。现在我改写日记了。')).toBeTruthy();
    expect(await screen.findByText('一件 200 美元的夹克，差点忘了自己曾想要它。幸好等了等。')).toBeTruthy();
    expect(await screen.findByText('不买之后的平静，比买了的兴奋更响亮。')).toBeTruthy();
  });

  it('renders dailyReflectionEmpty when API returns an empty list', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ reflections: [] } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    expect(await screen.findByText(/No reflections yet/)).toBeTruthy();
  });

  it('preserves input and shows inline error when submit fails', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ reflections: [] } as never)
      .mockRejectedValueOnce(new Error('network'));

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Share/), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));

    await waitFor(() => expect(screen.getByPlaceholderText(/Share/)).toBeDefined());
    await waitFor(() => expect(screen.getByText(/Submit failed — try again/)).toBeTruthy());
  });

  it('does not double-increment resonate when server reports already voted', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        reflections: [
          { id: 'r1', avatar: '🌊', text: 'Reflection', resonates: 3, is_seed: false, created_at: new Date().toISOString() },
        ],
      } as never)
      .mockResolvedValueOnce({ ok: true, created: false } as never)
      .mockResolvedValueOnce({
        reflections: [
          { id: 'r1', avatar: '🌊', text: 'Reflection', resonates: 3, is_seed: false, created_at: new Date().toISOString() },
        ],
      } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Resonates/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Resonates/i }));

    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/reflections/resonate', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(args => args[0] === '/api/reflections/resonate').length).toBe(2));
  });

  it('loads reflections from API when logged in', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      reflections: [
        { id: 'r1', avatar: '🌊', text: 'Server reflection', resonates: 10, is_seed: false, created_at: new Date().toISOString() },
      ],
    } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    expect(await screen.findByText('Server reflection')).toBeTruthy();
  });

  it('submits a reflection and refreshes data', async () => {
    const created = { id: 'new', avatar: '🌙', text: 'New note', resonates: 0, is_seed: false, created_at: new Date().toISOString() };
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ reflections: [] } as never) // initial GET
      .mockResolvedValueOnce({ reflection: created } as never) // POST
      .mockResolvedValueOnce({ reflections: [created] } as never); // refetch GET

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Share/), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: /Share/i }));

    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/reflections', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/reflections', expect.anything()));
  });

  it('calls resonate API for logged-in users', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        reflections: [
          { id: 'r1', avatar: '🌊', text: 'Reflection', resonates: 3, is_seed: false, created_at: new Date().toISOString() },
        ],
      } as never)
      .mockResolvedValueOnce({ ok: true } as never);

    render(
      <Wrapper>
        <DailyReflection isDemo={false} />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Resonates/i }));

    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/reflections/resonate', expect.objectContaining({ method: 'POST' })));
  });
});
