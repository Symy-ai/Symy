/**
 * Tests for sanitize-error.ts — sanitizeImapError
 *
 * 🔧 ARCH fix (Round 58): 测试基础设施 — vitest + 5 个核心 helper 测试
 */

import { describe, it, expect } from 'vitest';
import { sanitizeImapError } from '@/lib/email/sanitize-error';

describe('sanitizeImapError', () => {
  it('redacts pass= pattern', () => {
    expect(sanitizeImapError('auth failed: pass=secret123')).toBe(
      'auth failed: pass=***REDACTED***'
    );
  });

  it('redacts password= pattern', () => {
    expect(sanitizeImapError('error: password=mypassword')).toBe(
      'error: password=***REDACTED***'
    );
  });

  it('redacts authCode= pattern', () => {
    expect(sanitizeImapError('auth error: authCode=abc123')).toBe(
      'auth error: authCode=***REDACTED***'
    );
  });

  it('redacts access_token= pattern', () => {
    expect(sanitizeImapError('OAuth error: access_token=ya29.xxx')).toBe(
      'OAuth error: access_token=***REDACTED***'
    );
  });

  it('redacts refresh_token= pattern', () => {
    expect(sanitizeImapError('refresh failed: refresh_token=rt123')).toBe(
      'refresh failed: refresh_token=***REDACTED***'
    );
  });

  it('redacts ImapFlow auth: format', () => {
    expect(sanitizeImapError('auth: user=foo, pass=bar')).toBe(
      'auth: ***REDACTED***'
    );
  });

  it('does NOT redact compass= (word boundary)', () => {
    expect(sanitizeImapError('compass=north')).toBe('compass=north');
  });

  it('does NOT redact passport= (word boundary)', () => {
    expect(sanitizeImapError('passport=ABC123')).toBe('passport=ABC123');
  });

  it('redacts multiple credentials in one message', () => {
    const input = 'pass=secret1 and access_token=token2';
    const result = sanitizeImapError(input);
    expect(result).not.toContain('secret1');
    expect(result).not.toContain('token2');
    expect(result).toContain('***REDACTED***');
  });

  it('handles case-insensitive matching', () => {
    expect(sanitizeImapError('PASS=secret')).toContain('***REDACTED***');
    expect(sanitizeImapError('Password=secret')).toContain('***REDACTED***');
  });

  it('handles non-string input', () => {
    // sanitizeImapError returns '' for null/undefined (via String(errorMsg || ''))
    expect(sanitizeImapError(null as unknown as string)).toBe('');
    expect(sanitizeImapError(undefined as unknown as string)).toBe('');
  });

  it('preserves non-credential text', () => {
    const input = 'Connection refused: auth: user=foo, pass=bar at host imap.gmail.com:993';
    const result = sanitizeImapError(input);
    expect(result).toContain('Connection refused');
    expect(result).toContain('imap.gmail.com:993');
    expect(result).not.toContain('bar');
  });
});
