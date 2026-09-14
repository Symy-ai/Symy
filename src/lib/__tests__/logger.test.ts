/**
 * Tests for Logger (logger.ts)
 *
 * Covers:
 * - All log levels (debug, info, warn, error, critical)
 * - Environment-based filtering (dev vs production)
 * - Message formatting (timestamp + prefix + message)
 * - Multiple arguments
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to dynamically import logger after setting NODE_ENV
// vi.resetModules + dynamic import pattern

describe('logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv!;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('in development mode', () => {
    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = 'development';
    });

    it('logger.debug writes to console.log', async () => {
      const { logger } = await import('@/lib/logger');
      logger.debug('test message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.info writes to console.log', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.warn writes to console.warn', async () => {
      const { logger } = await import('@/lib/logger');
      logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.error writes to console.error', async () => {
      const { logger } = await import('@/lib/logger');
      logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.critical writes to console.log', async () => {
      const { logger } = await import('@/lib/logger');
      logger.critical('test message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('formats message with timestamp and prefix', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('hello world');
      const call = consoleLogSpy.mock.calls[0];
      const formattedMessage = call[0] as string;
      // Format: HH:mm:ss.SSS PREFIX message
      expect(formattedMessage).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} INFO  hello world$/);
    });

    it('logger.debug uses DEBUG prefix', async () => {
      const { logger } = await import('@/lib/logger');
      logger.debug('test');
      expect((consoleLogSpy.mock.calls[0][0] as string)).toContain('DEBUG');
    });

    it('logger.info uses INFO  prefix (with trailing space for alignment)', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('test');
      expect((consoleLogSpy.mock.calls[0][0] as string)).toContain('INFO ');
    });

    it('logger.warn uses WARN  prefix', async () => {
      const { logger } = await import('@/lib/logger');
      logger.warn('test');
      expect((consoleWarnSpy.mock.calls[0][0] as string)).toContain('WARN ');
    });

    it('logger.error uses ERROR prefix', async () => {
      const { logger } = await import('@/lib/logger');
      logger.error('test');
      expect((consoleErrorSpy.mock.calls[0][0] as string)).toContain('ERROR');
    });

    it('logger.critical uses CRIT  prefix', async () => {
      const { logger } = await import('@/lib/logger');
      logger.critical('test');
      expect((consoleLogSpy.mock.calls[0][0] as string)).toContain('CRIT ');
    });

    it('passes additional arguments to console', async () => {
      const { logger } = await import('@/lib/logger');
      const extra1 = { key: 'value' };
      const extra2 = new Error('test error');
      logger.info('message', extra1, extra2);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), extra1, extra2);
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = 'production';
    });

    it('logger.debug does NOT write to console.log', async () => {
      const { logger } = await import('@/lib/logger');
      logger.debug('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logger.info does NOT write to console.log', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logger.warn STILL writes to console.warn in production', async () => {
      const { logger } = await import('@/lib/logger');
      logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.error STILL writes to console.error in production', async () => {
      const { logger } = await import('@/lib/logger');
      logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('logger.critical STILL writes to console.log in production', async () => {
      const { logger } = await import('@/lib/logger');
      logger.critical('test message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('message formatting', () => {
    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = 'development';
    });

    it('timestamp has format HH:mm:ss.SSS', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('test');
      const msg = consoleLogSpy.mock.calls[0][0] as string;
      // Match HH:mm:ss.SSS (12:34:56.789)
      expect(msg).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    it('preserves original message text', async () => {
      const { logger } = await import('@/lib/logger');
      const testMsg = 'This is a test message with special chars: !@#$%^&*()';
      logger.info(testMsg);
      expect((consoleLogSpy.mock.calls[0][0] as string)).toContain(testMsg);
    });

    it('handles empty message', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      // Should still have timestamp + prefix
      expect((consoleLogSpy.mock.calls[0][0] as string)).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} INFO  $/);
    });
  });

  describe('multiple arguments', () => {
    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = 'development';
    });

    it('passes single extra argument', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('msg', 42);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), 42);
    });

    it('passes object argument', async () => {
      const { logger } = await import('@/lib/logger');
      const obj = { a: 1, b: 'two' };
      logger.info('msg', obj);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), obj);
    });

    it('passes multiple arguments of different types', async () => {
      const { logger } = await import('@/lib/logger');
      logger.info('msg', 1, 'string', true, null, undefined, { key: 'val' });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), 1, 'string', true, null, undefined, { key: 'val' });
    });

    it('handles Error objects as arguments', async () => {
      const { logger } = await import('@/lib/logger');
      const err = new Error('test');
      logger.error('failed', err);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), err);
    });
  });
});
