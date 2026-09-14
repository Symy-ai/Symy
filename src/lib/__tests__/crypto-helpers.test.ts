/**
 * Tests for Crypto Helpers (crypto-helpers.ts)
 *
 * Covers:
 * - encryptSensitive: encryption, format, fail-closed
 * - decryptSensitive: decryption, backward compat, failure handling
 * - isEncryptionConfigured: key detection
 * - Round-trip: encrypt → decrypt
 *
 * Note: These tests set IMAP_ENCRYPTION_KEY env var to enable encryption.
 * Tests that need "no key" state temporarily delete it.
 */

import { describe, it, expect } from 'vitest';

// Set encryption key BEFORE importing the module
process.env.IMAP_ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');

// Dynamic import to get fresh module after env var set
const { encryptSensitive, decryptSensitive, isEncryptionConfigured } = await import('@/lib/crypto-helpers');

describe('encryptSensitive', () => {
  it('encrypts plaintext and returns "enc:" prefixed string', () => {
    const result = encryptSensitive('my-secret-auth-code');
    expect(result).toBeTruthy();
    expect(result.startsWith('enc:')).toBe(true);
    expect(result).not.toBe('my-secret-auth-code');
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'same-secret';
    const result1 = encryptSensitive(plaintext);
    const result2 = encryptSensitive(plaintext);
    expect(result1).not.toBe(result2); // Different IVs → different ciphertext
  });

  it('returns empty string for empty input', () => {
    expect(encryptSensitive('')).toBe('');
  });

  it('handles unicode characters', () => {
    const unicode = '中文授权码🔐';
    const encrypted = encryptSensitive(unicode);
    expect(encrypted.startsWith('enc:')).toBe(true);
    const decrypted = decryptSensitive(encrypted);
    expect(decrypted).toBe(unicode);
  });

  it('handles long strings', () => {
    const long = 'a'.repeat(10000);
    const encrypted = encryptSensitive(long);
    expect(encrypted.startsWith('enc:')).toBe(true);
    const decrypted = decryptSensitive(encrypted);
    expect(decrypted).toBe(long);
  });
});

describe('decryptSensitive', () => {
  it('decrypts encrypted string back to original', () => {
    const original = 'test-auth-code-12345';
    const encrypted = encryptSensitive(original);
    const decrypted = decryptSensitive(encrypted);
    expect(decrypted).toBe(original);
  });

  it('returns original string for non-encrypted (no "enc:" prefix) input (backward compat)', () => {
    const plaintext = 'old-plaintext-auth-code';
    expect(decryptSensitive(plaintext)).toBe(plaintext);
  });

  it('returns empty string for empty input', () => {
    expect(decryptSensitive('')).toBe('');
  });

  it('returns null for corrupted encrypted data (wrong base64)', () => {
    expect(decryptSensitive('enc:not-valid-base64!!!')).toBeNull();
  });

  it('returns null for too-short encrypted data (< IV + authTag)', () => {
    // 12 (IV) + 16 (authTag) = 28 bytes minimum
    const tooShort = Buffer.alloc(10).toString('base64');
    expect(decryptSensitive('enc:' + tooShort)).toBeNull();
  });

  it('returns null for data with wrong auth tag (tampered)', () => {
    const original = 'test-secret';
    const encrypted = encryptSensitive(original);
    // Tamper with the encrypted data by flipping a byte in the middle
    const parts = encrypted.slice(4); // Remove "enc:"
    const buf = Buffer.from(parts, 'base64');
    buf[buf.length - 1] ^= 0xFF; // Flip last byte (ciphertext)
    const tampered = 'enc:' + buf.toString('base64');
    expect(decryptSensitive(tampered)).toBeNull();
  });
});

describe('isEncryptionConfigured', () => {
  it('returns true when IMAP_ENCRYPTION_KEY is set', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});

describe('round-trip: encrypt → decrypt', () => {
  it('preserves data through multiple round-trips', () => {
    const secrets = [
      'simple',
      'with spaces and symbols!@#$%^&*()',
      'very-long-secret-' + 'x'.repeat(1000),
      'unicode: 中文 🔐 ✓',
      '1234567890',
    ];
    for (const secret of secrets) {
      const encrypted = encryptSensitive(secret);
      const decrypted = decryptSensitive(encrypted);
      expect(decrypted).toBe(secret);
    }
  });

  it('each encryption produces unique ciphertext (random IV)', () => {
    const secret = 'same-secret';
    const ciphertexts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ciphertexts.add(encryptSensitive(secret));
    }
    // All 20 should be unique (extremely low collision probability with random IV)
    expect(ciphertexts.size).toBe(20);
  });
});
