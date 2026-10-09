import { describe, expect, it } from 'vitest';

import { sanitizeImapError } from '../sanitize-error';

/**
 * sanitize-error.ts (50行) — IMAP 错误凭证脱敏 (Round 51 R51-Bug1 + Round 52 A-4/5)。
 *
 * 红线锁定:
 * - 五类凭证 (pass/password/authCode/access_token/refresh_token) → ***REDACTED***
 * - ImapFlow 结构化 auth 行整行脱敏
 * - word boundary: compass= 误匹配防御
 * - 非串输入兜底
 */
describe('sanitizeImapError 凭证脱敏', () => {
  it('五类凭证键值脱敏', () => {
    expect(sanitizeImapError('login failed pass=secret123')).toBe('login failed pass=***REDACTED***');
    expect(sanitizeImapError('password: mypwd')).toBe('password=***REDACTED***');
    expect(sanitizeImapError('authCode=abc123 authentication failed')).toBe('authCode=***REDACTED*** authentication failed');
    expect(sanitizeImapError('access_token=ya29.xxx invalid_grant')).toBe('access_token=***REDACTED*** invalid_grant');
    expect(sanitizeImapError('refresh_token=1//xyz expired')).toBe('refresh_token=***REDACTED*** expired');
  });

  it('ImapFlow 结构化 auth 行整行脱敏', () => {
    expect(sanitizeImapError('auth: user=foo, pass=bar')).toBe('auth: ***REDACTED***');
  });

  it('红线: 脱敏输出零凭证残留', () => {
    const nasty = 'auth: user=foo, pass=bar authCode=q1 access_token=ya29.a1 refresh_token=1//r password=pw';
    const out = sanitizeImapError(nasty);
    expect(out).not.toContain('bar');
    expect(out).not.toContain('q1');
    expect(out).not.toContain('ya29');
    expect(out).not.toContain('1//r');
    expect(out).not.toContain('=pw');
  });

  it('word boundary: compass/passport 不误伤', () => {
    expect(sanitizeImapError('compass=north passport=dk')).toBe('compass=north passport=dk');
  });

  it('空/非串兜底', () => {
    expect(sanitizeImapError('')).toBe('');
    expect(sanitizeImapError(undefined as never)).toBe('');
    expect(sanitizeImapError(null as never)).toBe('');
  });
});
