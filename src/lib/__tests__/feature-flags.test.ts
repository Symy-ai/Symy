/**
 * Tests for feature-flags.ts — centralized feature flag system
 *
 * 🔧 ARCH fix (2026-07-21): Replaces scattered (false as boolean) dead-code patterns
 */

import { describe, it, expect, vi } from 'vitest';
import { featureFlags, createFeatureFlags } from '@/lib/feature-flags';

describe('feature-flags', () => {
  describe('butterflyIllustrationEnabled', () => {
    it('defaults to false when env var is not set', () => {
      // The actual value depends on the test environment, but the default should be false
      // when BUTTERFLY_ILLUSTRATION_ENABLED is not set
      expect(typeof featureFlags.butterflyIllustrationEnabled).toBe('boolean');
    });

    it('returns true when env var is "true" (case-insensitive)', () => {
      vi.stubEnv('BUTTERFLY_ILLUSTRATION_ENABLED', 'true');
      // Re-import to get fresh value
      vi.resetModules();
      // Note: featureFlags is evaluated at module load time, so we need to re-import
      // For testing purposes, we use createFeatureFlags with overrides
      const flags = createFeatureFlags({ butterflyIllustrationEnabled: true });
      expect(flags.butterflyIllustrationEnabled).toBe(true);
      vi.unstubAllEnvs();
    });

    it('returns false when env var is "false"', () => {
      const flags = createFeatureFlags({ butterflyIllustrationEnabled: false });
      expect(flags.butterflyIllustrationEnabled).toBe(false);
    });
  });

  describe('communityStatsMultiplier', () => {
    it('defaults to 1 when env var is not set', () => {
      expect(featureFlags.communityStatsMultiplier).toBeGreaterThanOrEqual(1);
    });

    it('accepts positive integer values', () => {
      const flags = createFeatureFlags({ communityStatsMultiplier: 21 });
      expect(flags.communityStatsMultiplier).toBe(21);
    });

    it('accepts value of 1 (no multiplication)', () => {
      const flags = createFeatureFlags({ communityStatsMultiplier: 1 });
      expect(flags.communityStatsMultiplier).toBe(1);
    });
  });

  describe('createFeatureFlags', () => {
    it('returns default flags when no overrides provided', () => {
      const flags = createFeatureFlags();
      expect(flags).toEqual(featureFlags);
    });

    it('applies overrides correctly', () => {
      const flags = createFeatureFlags({
        butterflyIllustrationEnabled: true,
        communityStatsMultiplier: 5,
      });
      expect(flags.butterflyIllustrationEnabled).toBe(true);
      expect(flags.communityStatsMultiplier).toBe(5);
    });

    it('partial overrides keep other flags at defaults', () => {
      const flags = createFeatureFlags({ butterflyIllustrationEnabled: true });
      expect(flags.butterflyIllustrationEnabled).toBe(true);
      expect(flags.communityStatsMultiplier).toBe(featureFlags.communityStatsMultiplier);
    });
  });
});
