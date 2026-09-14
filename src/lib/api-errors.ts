/**
 * Standardized API Error Responses
 *
 * 🔧 ARCH fix (2026-07-21): Centralizes all API error response creation.
 *
 * Problem:
 *   The codebase had 9+ variants of the same error messages:
 *   - "Not authenticated" (19) vs "Unauthorized" (9) vs "Unauthorized — must be logged in" (3)
 *   - "Invalid JSON" (3) vs "Invalid JSON body" (3)
 *   - "Admin access required" (7) vs "Forbidden — admin access required" (3)
 *
 *   This inconsistency makes it hard for the frontend to handle errors consistently.
 *   The frontend has to check multiple message variants instead of just the status code.
 *
 * Solution:
 *   This module provides standardized error response functions that all API routes
 *   should use. Each function returns a NextResponse with:
 *   1. The correct HTTP status code
 *   2. A consistent JSON shape: { error: string, [details?: unknown] }
 *   3. A standardized error message
 *
 * Usage:
 *   import { apiErrors } from '@/lib/api-errors';
 *   return apiErrors.unauthorized();
 *   return apiErrors.badRequest('Invalid email format');
 *   return apiErrors.forbidden('Admin access required');
 */

import { NextResponse } from 'next/server';

/**
 * Standardized API error response helper.
 * All functions return NextResponse with consistent JSON shape.
 */
export const apiErrors = {
  /**
   * 400 Bad Request — client sent invalid data
   * @param message - specific error message (defaults to "Bad request")
   * @param details - optional validation details (e.g., zod error issues)
   */
  badRequest(message: string = 'Bad request', details?: unknown): NextResponse {
    const body: { error: string; details?: unknown } = { error: message };
    if (details !== undefined) body.details = details;
    return NextResponse.json(body, { status: 400 });
  },

  /**
   * 401 Unauthorized — user is not authenticated
   * Note: withAuth HOF already returns this for auth failures.
   * Use this only in routes that don't use withAuth.
   */
  unauthorized(message: string = 'Not authenticated'): NextResponse {
    return NextResponse.json({ error: message }, { status: 401 });
  },

  /**
   * 403 Forbidden — user is authenticated but lacks permission
   * @param message - specific error message (defaults to "Forbidden")
   */
  forbidden(message: string = 'Forbidden'): NextResponse {
    return NextResponse.json({ error: message }, { status: 403 });
  },

  /**
   * 404 Not Found — resource doesn't exist or user doesn't own it
   * @param message - specific error message (defaults to "Not found")
   */
  notFound(message: string = 'Not found'): NextResponse {
    return NextResponse.json({ error: message }, { status: 404 });
  },

  /**
   * 409 Conflict — resource already exists or was modified concurrently
   * @param message - specific error message
   * @param conflict - optional conflict details (e.g., { conflict: true })
   */
  conflict(message: string = 'Conflict', details?: Record<string, unknown>): NextResponse {
    const body: { error: string; [key: string]: unknown } = { error: message };
    if (details) Object.assign(body, details);
    return NextResponse.json(body, { status: 409 });
  },

  /**
   * 429 Too Many Requests — rate limit exceeded
   * @param message - specific error message
   * @param retryAfter - seconds until the user can retry
   */
  rateLimited(message: string = 'Rate limit exceeded', retryAfter?: number): NextResponse {
    const headers: Record<string, string> = {};
    if (retryAfter !== undefined) headers['Retry-After'] = String(retryAfter);
    return NextResponse.json({ error: message }, { status: 429, headers });
  },

  /**
   * 500 Internal Server Error — server-side failure
   * Note: withAuth HOF already returns this for unhandled errors.
   * Use this only for explicit error responses in route handlers.
   */
  internalError(message: string = 'Internal server error'): NextResponse {
    return NextResponse.json({ error: message }, { status: 500 });
  },

  /**
   * 503 Service Unavailable — external service is down (e.g., Letta AI, OpenAI)
   * @param message - specific error message
   */
  serviceUnavailable(message: string = 'Service temporarily unavailable'): NextResponse {
    return NextResponse.json({ error: message }, { status: 503 });
  },
} as const;
