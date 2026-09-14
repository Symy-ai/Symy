/**
 * AuthExpiredError — 401/403 special error class for butterfly machine
 *
 * 🔧 ARCH fix (Round 60 — 避免 machine-guards ↔ machine-services 循环依赖):
 *    AuthExpiredError 被 machine-services 和 machine-guards 同时使用。
 *    提取到独立文件避免循环依赖。
 */

export class AuthExpiredError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Authentication expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}
