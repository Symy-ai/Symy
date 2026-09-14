/**
 * Error utility helpers — reduce boilerplate for error handling.
 *
 * 🔧 ARCH fix (Round 54 R54-Bug4 — getErrorMessage 重复 90 次):
 *    旧代码: `err instanceof Error ? err.message : String(err)` 散布在 48 个文件 90 处。
 *    根因修复: 提取共享 helper, 统一错误消息提取逻辑。
 *
 * 复杂度转移: 业务代码不再需要手动判断 Error 类型, 架构层统一处理。
 */

/**
 * Extract a human-readable error message from any thrown value.
 *
 * Handles:
 * - Error instances → err.message
 * - string → the string itself
 * - { message: string } → the message property
 * - null/undefined → fallback
 * - everything else → String(value)
 *
 * @param err - The thrown value (unknown)
 * @param fallback - Message to return if err is null/undefined (default: 'Unknown error')
 * @returns A string error message
 *
 * @example
 * ```ts
 * try {
 *   await riskyOp();
 * } catch (err) {
 *   logger.warn('Failed:', getErrorMessage(err));
 *   return { error: getErrorMessage(err, 'Operation failed') };
 * }
 * ```
 */
export function getErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err === null || err === undefined) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    // 🔧 ARCH fix (Round 55 REVIEW-A-3): 处理非 string message (e.g. { message: 123 })
    if (typeof msg === 'string') return msg;
    if (msg !== null && msg !== undefined) return String(msg);
  }
  // 🔧 ARCH fix (Round 55 REVIEW-A-3): 用 JSON.stringify 替代 String() 避免 "[object Object]"
  try {
    return JSON.stringify(err);
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return String(err);
  }
}

/**
 * Safely get an error's stack trace if available.
 *
 * @param err - The thrown value
 * @returns Stack trace string or undefined
 */
export function getErrorStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack;
  return undefined;
}

/**
 * Check if an error is an AbortError (from AbortController).
 *
 * 🔧 ARCH fix (Round 55 REVIEW-A-2): 用 'abort' 而非 'aborted' (与 letta.ts / illustration-engine.ts 一致)
 *
 * @param err - The thrown value
 * @returns true if the error is an AbortError
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.message.toLowerCase().includes('abort');
  }
  // Also handle DOMException (AbortController throws DOMException in some browsers)
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  return false;
}
