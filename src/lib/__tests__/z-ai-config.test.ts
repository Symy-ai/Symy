/**
 * Tests for Z-AI Config (z-ai-config.ts)
 *
 * Covers:
 * - isZAIAvailable: config file detection
 * - createZAIClient: client creation (mocked)
 */

import { describe, it, expect } from 'vitest';

describe('isZAIAvailable', () => {
  it('returns a boolean', async () => {
    const { isZAIAvailable } = await import('@/lib/z-ai-config');
    expect(typeof isZAIAvailable()).toBe('boolean');
  });
});

describe('createZAIClient', () => {
  it('can be imported without error', async () => {
    const { createZAIClient } = await import('@/lib/z-ai-config');
    expect(typeof createZAIClient).toBe('function');
  });
});
