/**
 * ApiError — 带 HTTP status 的自定义错误类
 *
 * 🔧 2026-07-20: 技术债清理 — 替代 (error as any).status 的 as any 用法
 *
 * 使用:
 *   throw new ApiError('Chat API error', 401);
 *   catch (err) {
 *     if (err instanceof ApiError && err.status === 401) { ... }
 *   }
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 从未知错误中提取 HTTP status (兼容 ApiError 和普通 Error)
 *
 * 使用:
 *   const status = getErrorStatus(err); // number | undefined
 */
export function getErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  // 兼容: 某些第三方库会在 Error 上附加 status 属性
  if (err instanceof Error && 'status' in err) {
    return (err as { status: unknown }).status as number | undefined;
  }
  return undefined;
}
