/**
 * Tests for embeddings.ts — pure utility functions
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74):
 *   旧: 0 tests for embeddings.ts (URL 规整 + text 构造函数无覆盖)
 *   修复: +N tests covering normalizeApiBase (URL 规整边界) +
 *         buildImpulseEventText / buildReceiptText / buildChatMessageText +
 *         EMBEDDING_DIMENSIONS 常量
 *
 * Tests ONLY pure functions — generateEmbedding / generateEmbeddingsBatch
 * require fetch mock (external API), 跳过 per task rules.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeApiBase,
  buildImpulseEventText,
  buildReceiptText,
  buildChatMessageText,
  isEmbeddingConfigured,
  EMBEDDING_DIMENSIONS,
} from '@/lib/embeddings';

// ============================================================
// normalizeApiBase — URL 规整
// ============================================================

describe('normalizeApiBase', () => {
  it('removes trailing slash', () => {
    expect(normalizeApiBase('https://api.example.com/v4/')).toBe('https://api.example.com/v4');
    // 🔧 Round 74 ARCH-DEEP-74 fix: /\/+$/ removes ALL trailing slashes (was /\/$/ which only removed one)
    expect(normalizeApiBase('https://api.example.com/v4///')).toBe('https://api.example.com/v4');
  });

  it('removes /embeddings suffix', () => {
    expect(normalizeApiBase('https://api.example.com/v4/embeddings')).toBe('https://api.example.com/v4');
  });

  it('removes both trailing slash and /embeddings suffix', () => {
    expect(normalizeApiBase('https://api.example.com/v4/embeddings/')).toBe('https://api.example.com/v4');
  });

  it('preserves URL without trailing slash or /embeddings suffix', () => {
    expect(normalizeApiBase('https://api.example.com/v4')).toBe('https://api.example.com/v4');
  });

  it('preserves URL with /embeddings in the middle (not suffix)', () => {
    // /embeddings/v4 — /embeddings is NOT at the end, so not removed
    expect(normalizeApiBase('https://api.example.com/embeddings/v4')).toBe('https://api.example.com/embeddings/v4');
  });

  it('handles URL with multiple path segments', () => {
    expect(normalizeApiBase('https://api.example.com/api/paas/v4/')).toBe('https://api.example.com/api/paas/v4');
    expect(normalizeApiBase('https://api.example.com/api/paas/v4/embeddings')).toBe('https://api.example.com/api/paas/v4');
  });

  it('handles default Zhipu API base', () => {
    const result = normalizeApiBase('https://open.bigmodel.cn/api/paas/v4');
    expect(result).toBe('https://open.bigmodel.cn/api/paas/v4');
  });

  it('handles default Zhipu API base with /embeddings suffix', () => {
    const result = normalizeApiBase('https://open.bigmodel.cn/api/paas/v4/embeddings');
    expect(result).toBe('https://open.bigmodel.cn/api/paas/v4');
  });

  it('handles empty string', () => {
    expect(normalizeApiBase('')).toBe('');
  });

  it('handles URL with port', () => {
    expect(normalizeApiBase('http://localhost:8080/v1/')).toBe('http://localhost:8080/v1');
    expect(normalizeApiBase('http://localhost:8080/v1/embeddings')).toBe('http://localhost:8080/v1');
  });

  it('does NOT remove /embeddings-like substrings (only exact suffix)', () => {
    // /embeddingsv2 is NOT /embeddings suffix
    expect(normalizeApiBase('https://api.example.com/embeddingsv2')).toBe('https://api.example.com/embeddingsv2');
  });

  it('removes ALL trailing slashes (Round 74 fix: /\/+$/ instead of /\/$/)', () => {
    // 🔧 Round 74 ARCH-DEEP-74 fix: 旧代码 /\/$/ 只移除一个斜杠, 新代码 /\/+$/ 移除全部
    expect(normalizeApiBase('https://api.example.com/v4//')).toBe('https://api.example.com/v4');
    expect(normalizeApiBase('https://api.example.com/v4///')).toBe('https://api.example.com/v4');
    expect(normalizeApiBase('https://api.example.com/v4////')).toBe('https://api.example.com/v4');
  });
});

// ============================================================
// buildImpulseEventText — impulse event → embeddable text
// ============================================================

describe('buildImpulseEventText', () => {
  it('builds text with all fields', () => {
    const result = buildImpulseEventText({
      platform: 'amazon',
      title: 'Wireless Headphones',
      amount: 89.99,
      category: 'Electronics',
      raw_text: 'Bose QuietComfort with noise cancellation',
      reasons: ['late_night', 'high_amount'],
    });
    expect(result).toContain('Platform: amazon');
    expect(result).toContain('Title: Wireless Headphones');
    expect(result).toContain('Amount: $89.99');
    expect(result).toContain('Category: Electronics');
    expect(result).toContain('Details: Bose QuietComfort with noise cancellation');
    expect(result).toContain('Impulse signals: late_night, high_amount');
    // All parts joined with ' | '
    expect(result).toContain(' | ');
  });

  it('omits undefined fields (no empty segments)', () => {
    const result = buildImpulseEventText({
      platform: 'amazon',
      amount: 50,
    });
    expect(result).toBe('Platform: amazon | Amount: $50');
    // No 'Title:', 'Category:', etc. for undefined fields
    expect(result).not.toContain('Title:');
    expect(result).not.toContain('Category:');
    expect(result).not.toContain('Details:');
    expect(result).not.toContain('Impulse signals:');
  });

  it('returns empty string when all fields undefined', () => {
    expect(buildImpulseEventText({})).toBe('');
  });

  it('handles empty reasons array (omitted)', () => {
    const result = buildImpulseEventText({
      platform: 'amazon',
      reasons: [],
    });
    expect(result).toBe('Platform: amazon');
    expect(result).not.toContain('Impulse signals');
  });

  it('handles amount = 0 (included, since 0 != null)', () => {
    const result = buildImpulseEventText({
      platform: 'amazon',
      amount: 0,
    });
    expect(result).toContain('Amount: $0');
  });

  it('handles negative amount', () => {
    const result = buildImpulseEventText({
      amount: -25.50,
    });
    expect(result).toContain('Amount: $-25.5');
  });

  it('handles single reason', () => {
    const result = buildImpulseEventText({
      reasons: ['late_night'],
    });
    expect(result).toBe('Impulse signals: late_night');
  });

  it('handles multiple reasons', () => {
    const result = buildImpulseEventText({
      reasons: ['late_night', 'high_amount', 'repeat_purchase'],
    });
    expect(result).toContain('Impulse signals: late_night, high_amount, repeat_purchase');
  });
});

// ============================================================
// buildReceiptText — email receipt → embeddable text
// ============================================================

describe('buildReceiptText', () => {
  it('builds text with all fields', () => {
    const result = buildReceiptText({
      platform: 'tiktok_shop',
      item_name: 'LED Strip Lights',
      amount: 24.99,
      subject: 'Your TikTok Shop order #12345',
      snippet: 'Thanks for your purchase!',
      from_address: 'orders@tiktokshop.com',
    });
    expect(result).toContain('Platform: tiktok_shop');
    expect(result).toContain('Item: LED Strip Lights');
    expect(result).toContain('Amount: $24.99');
    expect(result).toContain('Subject: Your TikTok Shop order #12345');
    expect(result).toContain('Snippet: Thanks for your purchase!');
    expect(result).toContain('From: orders@tiktokshop.com');
  });

  it('omits undefined fields', () => {
    const result = buildReceiptText({
      platform: 'amazon',
      amount: 100,
    });
    expect(result).toBe('Platform: amazon | Amount: $100');
    expect(result).not.toContain('Item:');
    expect(result).not.toContain('Subject:');
  });

  it('returns empty string when all fields undefined', () => {
    expect(buildReceiptText({})).toBe('');
  });

  it('handles amount = 0', () => {
    const result = buildReceiptText({ amount: 0 });
    expect(result).toContain('Amount: $0');
  });

  it('handles undefined amount (omitted, not $undefined)', () => {
    const result = buildReceiptText({ platform: 'amazon' });
    expect(result).not.toContain('Amount:');
    expect(result).not.toContain('undefined');
  });
});

// ============================================================
// buildChatMessageText — chat message → embeddable text
// ============================================================

describe('buildChatMessageText', () => {
  it('formats as [role]: content', () => {
    expect(buildChatMessageText({ role: 'user', content: 'Hello, AI!' })).toBe('[user]: Hello, AI!');
    expect(buildChatMessageText({ role: 'assistant', content: 'Hi there!' })).toBe('[assistant]: Hi there!');
  });

  it('handles empty content', () => {
    expect(buildChatMessageText({ role: 'user', content: '' })).toBe('[user]: ');
  });

  it('handles custom role names', () => {
    expect(buildChatMessageText({ role: 'system', content: 'You are a helpful assistant.' })).toBe('[system]: You are a helpful assistant.');
  });

  it('handles content with special characters', () => {
    expect(buildChatMessageText({ role: 'user', content: 'Price is $100 + tax (5%)' })).toBe('[user]: Price is $100 + tax (5%)');
  });

  it('handles multi-line content', () => {
    const result = buildChatMessageText({ role: 'user', content: 'Line 1\nLine 2\nLine 3' });
    expect(result).toBe('[user]: Line 1\nLine 2\nLine 3');
  });
});

// ============================================================
// EMBEDDING_DIMENSIONS — constant
// ============================================================

describe('EMBEDDING_DIMENSIONS', () => {
  it('is 1024 (HNSW-compatible, pgvector limit)', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1024);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(EMBEDDING_DIMENSIONS)).toBe(true);
    expect(EMBEDDING_DIMENSIONS).toBeGreaterThan(0);
  });
});

// ============================================================
// isEmbeddingConfigured — env-based check (pure, no API call)
// ============================================================

describe('isEmbeddingConfigured', () => {
  it('returns a boolean (env-dependent, just verify type)', () => {
    const result = isEmbeddingConfigured();
    expect(typeof result).toBe('boolean');
  });
});
