/**
 * Tests for Gmail Config (email/gmail-config.ts)
 *
 * Covers:
 * - GMAIL_OAUTH_CONFIG: structure, default values
 * - isGmailConfigured: detection logic
 */

import { describe, it, expect } from 'vitest';
import { GMAIL_OAUTH_CONFIG, isGmailConfigured } from '@/lib/email/gmail-config';

describe('GMAIL_OAUTH_CONFIG', () => {
  it('has clientId property', () => {
    expect(typeof GMAIL_OAUTH_CONFIG.clientId).toBe('string');
  });

  it('has clientSecret property', () => {
    expect(typeof GMAIL_OAUTH_CONFIG.clientSecret).toBe('string');
  });

  it('has scopes array with gmail.readonly', () => {
    expect(GMAIL_OAUTH_CONFIG.scopes).toBeInstanceOf(Array);
    expect(GMAIL_OAUTH_CONFIG.scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
  });

  it('has redirectUri property', () => {
    expect(typeof GMAIL_OAUTH_CONFIG.redirectUri).toBe('string');
  });

  it('scopes only contains readonly (not compose/send)', () => {
    // Security: app should only READ emails, not send/modify
    for (const scope of GMAIL_OAUTH_CONFIG.scopes) {
      expect(scope).toContain('readonly');
    }
  });
});

describe('isGmailConfigured', () => {
  it('returns a boolean', () => {
    expect(typeof isGmailConfigured()).toBe('boolean');
  });

  it('returns false when both clientId and clientSecret are empty', () => {
    // In test env, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set
    // So this should return false
    // (unless env vars are set in CI)
    const result = isGmailConfigured();
    expect(result).toBe(false);
  });
});
