/**
 * Tests for apiErrors — standardized API error response helper
 *
 * 🔧 ARCH fix (2026-07-21): Centralizes all API error responses
 */

import { describe, it, expect } from 'vitest';
import { apiErrors } from '@/lib/api-errors';

describe('apiErrors', () => {
  describe('badRequest', () => {
    it('returns 400 with default message', () => {
      const res = apiErrors.badRequest();
      expect(res.status).toBe(400);
      return res.json().then((body) => {
        expect(body.error).toBe('Bad request');
      });
    });

    it('returns 400 with custom message', () => {
      const res = apiErrors.badRequest('Invalid email');
      expect(res.status).toBe(400);
      return res.json().then((body) => {
        expect(body.error).toBe('Invalid email');
      });
    });

    it('returns 400 with details', () => {
      const res = apiErrors.badRequest('Validation failed', [{ path: 'email', message: 'required' }]);
      expect(res.status).toBe(400);
      return res.json().then((body) => {
        expect(body.error).toBe('Validation failed');
        expect(body.details).toEqual([{ path: 'email', message: 'required' }]);
      });
    });
  });

  describe('unauthorized', () => {
    it('returns 401 with default message', () => {
      const res = apiErrors.unauthorized();
      expect(res.status).toBe(401);
      return res.json().then((body) => {
        expect(body.error).toBe('Not authenticated');
      });
    });
  });

  describe('forbidden', () => {
    it('returns 403 with default message', () => {
      const res = apiErrors.forbidden();
      expect(res.status).toBe(403);
      return res.json().then((body) => {
        expect(body.error).toBe('Forbidden');
      });
    });

    it('returns 403 with custom message', () => {
      const res = apiErrors.forbidden('Admin access required');
      expect(res.status).toBe(403);
      return res.json().then((body) => {
        expect(body.error).toBe('Admin access required');
      });
    });
  });

  describe('notFound', () => {
    it('returns 404 with default message', () => {
      const res = apiErrors.notFound();
      expect(res.status).toBe(404);
      return res.json().then((body) => {
        expect(body.error).toBe('Not found');
      });
    });
  });

  describe('conflict', () => {
    it('returns 409 with message', () => {
      const res = apiErrors.conflict('Session was modified');
      expect(res.status).toBe(409);
      return res.json().then((body) => {
        expect(body.error).toBe('Session was modified');
      });
    });

    it('returns 409 with conflict details', () => {
      const res = apiErrors.conflict('Version mismatch', { conflict: true, serverVersion: 5 });
      expect(res.status).toBe(409);
      return res.json().then((body) => {
        expect(body.error).toBe('Version mismatch');
        expect(body.conflict).toBe(true);
        expect(body.serverVersion).toBe(5);
      });
    });
  });

  describe('rateLimited', () => {
    it('returns 429 with message', () => {
      const res = apiErrors.rateLimited('Too many requests');
      expect(res.status).toBe(429);
      return res.json().then((body) => {
        expect(body.error).toBe('Too many requests');
      });
    });

    it('returns 429 with Retry-After header', () => {
      const res = apiErrors.rateLimited('Rate limit exceeded', 60);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('60');
    });
  });

  describe('internalError', () => {
    it('returns 500 with default message', () => {
      const res = apiErrors.internalError();
      expect(res.status).toBe(500);
      return res.json().then((body) => {
        expect(body.error).toBe('Internal server error');
      });
    });
  });

  describe('serviceUnavailable', () => {
    it('returns 503 with default message', () => {
      const res = apiErrors.serviceUnavailable();
      expect(res.status).toBe(503);
      return res.json().then((body) => {
        expect(body.error).toBe('Service temporarily unavailable');
      });
    });
  });
});
