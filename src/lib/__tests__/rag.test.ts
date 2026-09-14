/**
 * Tests for RAG (rag.ts)
 *
 * Covers:
 * - formatContextForPrompt: empty array, single context, multiple contexts, date formatting
 * - getUserEmbeddingCount: needs Supabase mock (returns null on error)
 */

import { describe, it, expect } from 'vitest';
import { formatContextForPrompt, type RetrievedContext } from '@/lib/rag';

describe('formatContextForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(formatContextForPrompt([])).toBe('');
  });

  it('formats single context with XML tags', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'User bought a $200 jacket',
        sourceType: 'impulse_event',
        similarity: 0.85,
        metadata: { created_at: '2026-01-15T10:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('<user_history>');
    expect(result).toContain('</user_history>');
    expect(result).toContain('User bought a $200 jacket');
  });

  it('formats multiple contexts with numbering', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'First event',
        sourceType: 'impulse_event',
        similarity: 0.9,
        metadata: { created_at: '2026-01-15T10:00:00Z' },
      },
      {
        content: 'Second event',
        sourceType: 'chat_message',
        similarity: 0.7,
        metadata: { created_at: '2026-02-20T15:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('[1]');
    expect(result).toContain('First event');
    expect(result).toContain('[2]');
    expect(result).toContain('Second event');
  });

  it('formats date correctly', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test event',
        sourceType: 'impulse_event',
        similarity: 0.8,
        metadata: { created_at: '2026-07-06T12:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('Jul'); // Date should be formatted
    expect(result).toContain('2026');
  });

  it('falls back to received_at when created_at is missing', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Email receipt',
        sourceType: 'email_receipt',
        similarity: 0.8,
        metadata: { received_at: '2026-03-10T08:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('Mar');
    expect(result).toContain('2026');
  });

  it('shows "unknown date" when neither created_at nor received_at', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'No date event',
        sourceType: 'impulse_event',
        similarity: 0.8,
        metadata: {},
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('unknown date');
  });

  it('shows similarity as percentage', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test',
        sourceType: 'impulse_event',
        similarity: 0.856,
        metadata: { created_at: '2026-01-01T00:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('86%'); // 0.856 * 100 = 85.6 → rounded to 86
  });

  it('replaces underscores in sourceType', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test',
        sourceType: 'impulse_event',
        similarity: 0.8,
        metadata: { created_at: '2026-01-01T00:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('impulse event'); // underscore replaced with space
  });

  it('includes instruction text', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test',
        sourceType: 'impulse_event',
        similarity: 0.8,
        metadata: { created_at: '2026-01-01T00:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('Use this context');
    expect(result).toContain('Do NOT mention');
  });

  it('handles 0 similarity', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test',
        sourceType: 'impulse_event',
        similarity: 0,
        metadata: { created_at: '2026-01-01T00:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('0%');
  });

  it('handles 1.0 similarity', () => {
    const contexts: RetrievedContext[] = [
      {
        content: 'Test',
        sourceType: 'impulse_event',
        similarity: 1.0,
        metadata: { created_at: '2026-01-01T00:00:00Z' },
      },
    ];
    const result = formatContextForPrompt(contexts);
    expect(result).toContain('100%');
  });
});
