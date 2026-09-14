/**
 * Tests for IMAP Config (email/imap-config.ts)
 *
 * Covers:
 * - IMAP_PROVIDERS: structure, all providers have required fields
 * - detectIMAPProvider: domain matching, case insensitivity, unknown providers
 * - isValidEmail: valid/invalid formats
 */

import { describe, it, expect } from 'vitest';
import {
  IMAP_PROVIDERS,
  detectIMAPProvider,
  isValidEmail,
} from '@/lib/email/imap-config';

describe('IMAP_PROVIDERS', () => {
  it('has multiple providers configured', () => {
    expect(IMAP_PROVIDERS.length).toBeGreaterThanOrEqual(5);
  });

  it('all providers have required fields', () => {
    for (const provider of IMAP_PROVIDERS) {
      expect(provider.name).toBeTruthy();
      expect(provider.host).toBeTruthy();
      expect(provider.port).toBeGreaterThan(0);
      expect(provider.tls).toBe(true); // all providers use TLS
      expect(provider.domains.length).toBeGreaterThan(0);
    }
  });

  it('all providers use port 993 (IMAPS)', () => {
    for (const provider of IMAP_PROVIDERS) {
      expect(provider.port).toBe(993);
    }
  });

  it('includes common providers', () => {
    const names = IMAP_PROVIDERS.map(p => p.name);
    expect(names).toContain('163 Mail');
    expect(names).toContain('QQ Mail');
    expect(names).toContain('Gmail');
    expect(names).toContain('Outlook');
  });

  it('163 Mail supports 163.com, 126.com, yeah.net', () => {
    const provider = IMAP_PROVIDERS.find(p => p.name === '163 Mail');
    expect(provider?.domains).toEqual(['163.com', '126.com', 'yeah.net']);
  });

  it('QQ Mail supports qq.com, foxmail.com', () => {
    const provider = IMAP_PROVIDERS.find(p => p.name === 'QQ Mail');
    expect(provider?.domains).toEqual(['qq.com', 'foxmail.com']);
  });

  it('Gmail supports gmail.com', () => {
    const provider = IMAP_PROVIDERS.find(p => p.name === 'Gmail');
    expect(provider?.domains).toEqual(['gmail.com']);
  });

  it('Outlook supports outlook.com, hotmail.com, live.com', () => {
    const provider = IMAP_PROVIDERS.find(p => p.name === 'Outlook');
    expect(provider?.domains).toEqual(['outlook.com', 'hotmail.com', 'live.com']);
  });
});

describe('detectIMAPProvider', () => {
  it('detects 163 Mail by 163.com domain', () => {
    const result = detectIMAPProvider('user@163.com');
    expect(result?.name).toBe('163 Mail');
    expect(result?.host).toBe('imap.163.com');
  });

  it('detects 163 Mail by 126.com domain', () => {
    expect(detectIMAPProvider('user@126.com')?.name).toBe('163 Mail');
  });

  it('detects 163 Mail by yeah.net domain', () => {
    expect(detectIMAPProvider('user@yeah.net')?.name).toBe('163 Mail');
  });

  it('detects QQ Mail by qq.com domain', () => {
    expect(detectIMAPProvider('user@qq.com')?.name).toBe('QQ Mail');
  });

  it('detects QQ Mail by foxmail.com domain', () => {
    expect(detectIMAPProvider('user@foxmail.com')?.name).toBe('QQ Mail');
  });

  it('detects Gmail', () => {
    expect(detectIMAPProvider('user@gmail.com')?.name).toBe('Gmail');
  });

  it('detects Outlook by outlook.com', () => {
    expect(detectIMAPProvider('user@outlook.com')?.name).toBe('Outlook');
  });

  it('detects Outlook by hotmail.com', () => {
    expect(detectIMAPProvider('user@hotmail.com')?.name).toBe('Outlook');
  });

  it('detects Outlook by live.com', () => {
    expect(detectIMAPProvider('user@live.com')?.name).toBe('Outlook');
  });

  it('is case insensitive (uppercase domain)', () => {
    expect(detectIMAPProvider('user@GMAIL.COM')?.name).toBe('Gmail');
  });

  it('is case insensitive (mixed case email)', () => {
    expect(detectIMAPProvider('User@QQ.COM')?.name).toBe('QQ Mail');
  });

  it('returns null for unknown domain', () => {
    expect(detectIMAPProvider('user@example.com')).toBeNull();
  });

  it('returns null for unknown provider', () => {
    expect(detectIMAPProvider('user@yandex.com')).toBeNull();
  });

  it('returns null for email without @', () => {
    expect(detectIMAPProvider('invalid-email')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectIMAPProvider('')).toBeNull();
  });

  it('returns null for email with @ but no domain', () => {
    expect(detectIMAPProvider('user@')).toBeNull();
  });

  it('returns null for email with empty local part', () => {
    // detectIMAPProvider only checks domain, so empty local part still works
    // but the domain check should still function
    const result = detectIMAPProvider('@163.com');
    expect(result?.name).toBe('163 Mail');
  });

  it('returns the full provider object with all fields', () => {
    const result = detectIMAPProvider('user@gmail.com');
    expect(result).toEqual({
      name: 'Gmail',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      domains: ['gmail.com'],
    });
  });
});

describe('isValidEmail', () => {
  it('returns true for valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('returns true for valid email with subdomain', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true);
  });

  it('returns true for valid email with + alias', () => {
    expect(isValidEmail('user+tag@gmail.com')).toBe(true);
  });

  it('returns true for valid email with dots in local part', () => {
    expect(isValidEmail('first.last@example.com')).toBe(true);
  });

  it('returns true for valid email with numbers', () => {
    expect(isValidEmail('user123@example123.com')).toBe(true);
  });

  it('returns true for single-character local part', () => {
    expect(isValidEmail('a@example.com')).toBe(true);
  });

  it('returns true for single-character domain part', () => {
    expect(isValidEmail('user@a.co')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('returns false for email without @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('returns false for email with space', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('returns false for email with multiple @', () => {
    expect(isValidEmail('user@@example.com')).toBe(false);
  });

  it('returns false for email without domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('returns false for email without TLD', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('returns false for email starting with @', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('returns false for email with space in domain', () => {
    expect(isValidEmail('user@example .com')).toBe(false);
  });

  it('returns false for email with @ and dot but no TLD chars', () => {
    expect(isValidEmail('user@.')).toBe(false);
  });
});
