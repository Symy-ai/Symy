/**
 * Component tests for BlindSpotMap
 *
 * 🔧 Round 80 F14: Test coverage for the BlindSpotMap component.
 *    Test matrix:
 *      - Shows loading state initially
 *      - Shows new-user empty state when total_challenges=0
 *      - Shows insufficient-data state when 0 visible spots
 *      - Renders visible blind spots with emoji/label/rate/description/insight
 *      - Shows empathy text at bottom
 *      - Shows Premium upsell section
 *      - Does not render when fetch fails (graceful null)
 *      - Localized title (English when locale='en')
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BlindSpotMap } from '../blind-spot-map';

// Mock apiFetch
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock useI18n
// 🔧 2026-07-15: Return actual English text for blindSpot keys (was pass-through)
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'blindSpot.title': '🗺️ Your Blind Spot Map',
        'blindSpot.emptyData': 'No blind spot data yet.\nComplete 3 challenges, and Symy will map your blind spots.',
        'blindSpot.insufficientData': 'You need more data to see your blind spots.\nKeep challenging, and Symy will map them.\n0/6 blind spots detected.',
        'blindSpot.symyWillFindYou': 'Symy will find you in your blind spot moments',
        'blindSpot.pushHint': "When you're in late night / livestream / emotional lows, Symy will push to help you see.",
      };
      let result = translations[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, v);
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

import { apiFetch } from '@/lib/api-client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    total_challenges: 10,
    blind_spots: [
      {
        type: 'night',
        label: '深夜盲区',
        emoji: '🌙',
        rate: 67,
        description: 'of "didn\'t see" happened after 10PM',
        insight: 'That\'s when you\'re most tired',
        // 🔧 ARCH fix (2026-07-18): bump sample_count from 6 → 12
        //    Component shows "Insufficient data" when sample_count < 10,
        //    which hides the rate. Test wants to verify rate rendering,
        //    so sample_count must be ≥ 10.
        sample_count: 12,
        show: true,
      },
      {
        type: 'livestream',
        label: '直播盲区',
        emoji: '📱',
        rate: null,
        description: null,
        insight: null,
        sample_count: 0,
        show: false,
      },
      {
        type: 'emotional',
        label: '情绪盲区',
        emoji: '💼',
        rate: null,
        description: null,
        insight: null,
        sample_count: 0,
        show: false,
      },
      {
        type: 'amount',
        label: '金额盲区',
        emoji: '💰',
        rate: 50,
        description: 'You have highest blind rate on $51-200 medium purchases (50%)',
        insight: 'You\'re more likely to convince yourself "I deserve it"',
        // 🔧 ARCH fix (2026-07-18): bump sample_count from 4 → 11 (same reason)
        sample_count: 11,
        show: true,
      },
      {
        type: 'impulse',
        label: '冲动盲区',
        emoji: '⚡',
        rate: null,
        description: null,
        insight: null,
        sample_count: 0,
        show: false,
      },
    ],
    completed_blind_spots: 2,
    total_blind_spots: 5,
    empathy_text: '',  // 🔧 PM-P1-13 fix: empathy_text moved to frontend i18n
    amount_tier: 'medium',
    emotional_type: 'weekday',
    ...overrides,
  };
}

describe('BlindSpotMap component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially (skeleton)', async () => {
    mockApiFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = render(<BlindSpotMap isActive={true} />);
    // Skeleton has animate-pulse
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });

  it('shows new-user empty state when total_challenges=0', async () => {
    mockApiFetch.mockResolvedValue(makeResponse({
      total_challenges: 0,
      blind_spots: [],
      completed_blind_spots: 0,
    }));
    render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      expect(screen.getByText(/No blind spot data yet/i)).toBeTruthy();
    });
  });

  it('renders visible blind spots with emoji, label, rate, description, insight', async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      // Title
      expect(screen.getByText(/Your Blind Spot Map/i)).toBeTruthy();
      // Night blind spot visible (emoji + label)
      expect(screen.getByText('🌙')).toBeTruthy();
      expect(screen.getByText(/Night Blind Spot/i)).toBeTruthy();
      // Night rate (67%)
      expect(screen.getByText('67%')).toBeTruthy();
      // Amount blind spot visible
      expect(screen.getByText('💰')).toBeTruthy();
      expect(screen.getByText(/Amount Blind Spot/i)).toBeTruthy();
      // Guardian-voice descriptions (the visible rate is rendered before the text)
      expect(screen.getByText(/late-night temptations arrived after 10 PM/i)).toBeTruthy();
      expect(screen.getByText(/guarded pauses landed on \$51-\$200 medium purchases/i)).toBeTruthy();
      // Guardian-voice insights
      expect(screen.getByText(/guardian watches the late-night cart/i)).toBeTruthy();
      expect(screen.getByText(/protects the moment you really want/i)).toBeTruthy();
    });
    // Hidden spots (livestream, emotional, impulse) should NOT show their labels
    expect(screen.queryByText(/Livestream Blind Spot/i)).toBeNull();
    expect(screen.queryByText(/Emotional Blind Spot/i)).toBeNull();
    expect(screen.queryByText(/Impulse Blind Spot/i)).toBeNull();
    // Empathy text (PM-P1-13 fix: now from frontend i18n, not backend)
    expect(screen.getByText(/This isn't your fault/i)).toBeTruthy();
  });

  it('shows empathy text at bottom', async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      // 🔧 PM-P1-13 fix: empathy text now from frontend i18n
      expect(screen.getByText(/These spending patterns took years/i)).toBeTruthy();
      expect(screen.getByText(/Seeing the blind spot/i)).toBeTruthy();
    });
  });

  it('keeps blind-spot descriptions and insights free of mirror-era language', async () => {
    mockApiFetch.mockResolvedValue(makeResponse({
      blind_spots: [
        { type: 'night', label: '深夜盲区', emoji: '🌙', rate: 67, description: '', insight: '', sample_count: 12, show: true },
        { type: 'livestream', label: '直播盲区', emoji: '📱', rate: 58, description: '', insight: '', sample_count: 12, show: true },
        { type: 'emotional', label: '情绪盲区', emoji: '💼', rate: 43, description: '', insight: '', sample_count: 12, show: true },
        { type: 'amount', label: '金额盲区', emoji: '💰', rate: 50, description: '', insight: '', sample_count: 12, show: true },
        { type: 'impulse', label: '冲动盲区', emoji: '⚡', rate: 52, description: '', insight: '', sample_count: 12, show: true },
      ],
    }));
    const { container } = render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      expect(screen.getByText(/quick decisions arrived in under 30 seconds/i)).toBeTruthy();
    });

    // Labels and dictionary-backed titles legitimately retain the product term
    // "Blind Spot"/"盲区". This red line covers only descriptions and insights.
    const guardedText = Array.from(container.querySelectorAll('.space-y-4 p'))
      .map(paragraph => paragraph.textContent || '')
      .join('\n');
    expect(screen.getByText('Livestream Blind Spot')).toBeTruthy();
    expect(screen.getByText('Emotional Blind Spot')).toBeTruthy();
    expect(screen.getByText('Induced Blind Spot')).toBeTruthy();
    expect(guardedText).not.toMatch(/\bblind(ed)?\b/i);
    expect(guardedText).not.toMatch(/\bunseen\b/i);
    expect(guardedText).not.toContain('没看见');
    expect(guardedText).not.toContain('镜子');
    expect(guardedText).not.toMatch(/\bmirror(ed)?\b/i);
  });

  it('shows Premium upsell section', async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Symy will find you in your blind spot moments/i)).toBeTruthy();
    });
  });

  it('does not render (returns null) when fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    const { container } = render(<BlindSpotMap isActive={true} />);
    // Wait for fetch to settle
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    // Wait a bit more for state to settle
    await new Promise(r => setTimeout(r, 100));
    // Component should return null (no blind spot map content)
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(screen.queryByText(/Your Blind Spot Map/i)).toBeNull();
    expect(screen.queryByText(/No blind spot data/i)).toBeNull();
  });

  it('does not fetch when isActive=false', async () => {
    mockApiFetch.mockResolvedValue(makeResponse());
    render(<BlindSpotMap isActive={false} />);
    await new Promise(r => setTimeout(r, 100));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows insufficient-data state when 0 visible spots but has challenges', async () => {
    mockApiFetch.mockResolvedValue(makeResponse({
      total_challenges: 5,
      blind_spots: [
        { type: 'night', label: '深夜盲区', emoji: '🌙', rate: null, description: null, insight: null, sample_count: 1, show: false },
        { type: 'livestream', label: '直播盲区', emoji: '📱', rate: null, description: null, insight: null, sample_count: 0, show: false },
        { type: 'emotional', label: '情绪盲区', emoji: '💼', rate: null, description: null, insight: null, sample_count: 0, show: false },
        { type: 'amount', label: '金额盲区', emoji: '💰', rate: null, description: null, insight: null, sample_count: 2, show: false },
        { type: 'impulse', label: '冲动盲区', emoji: '⚡', rate: null, description: null, insight: null, sample_count: 0, show: false },
      ],
      completed_blind_spots: 0,
    }));
    render(<BlindSpotMap isActive={true} />);
    await waitFor(() => {
      expect(screen.getByText(/You need more data to see your blind spots/i)).toBeTruthy();
    });
  });
});
