/**
 * apiFetch — 统一的客户端 API 调用工具
 *
 * 封装 fetch 的通用模式:
 * 1. JSON Content-Type (默认)
 * 2. res.ok 检查 + JSON 解析
 * 3. 类型安全的返回值 (泛型 T)
 * 4. 可选 AbortController signal
 * 5. 统一错误处理 (抛出 ApiError)
 *
 * 用法:
 *   // GET
 *   const data = await apiFetch<{ sessions: ButterflySession[] }>('/api/butterfly/sessions');
 *
 *   // POST
 *   const result = await apiFetch<{ challengeId: string }>('/api/challenge/create', {
 *     method: 'POST',
 *     body: { itemName: 'Drone', amount: 299 },
 *   });
 *
 *   // 带 AbortController
 *   const controller = new AbortController();
 *   const data = await apiFetch<DataType>('/api/data', { signal: controller.signal });
 *
 * 不适用场景 (直接用 fetch):
 *   - SSE 流式 (需要 reader.read() 循环)
 *   - 文件上传 (FormData)
 *   - keepalive 请求 (beforeunload)
 */

'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** 请求体 (自动 JSON.stringify) */
  body?: unknown;
  /** AbortController signal (透传给 fetch; 若同时设 timeoutMs, 两者任一触发都会 abort) */
  signal?: AbortSignal;
  /**
   * 请求超时 (毫秒), 默认 30s。
   * 🔧 ARCH fix (Round 11 M5): 旧 apiFetch 无超时 — 慢/卡住的服务端会让 UI 永久 loading。
   * 0 表示禁用 (用于流式 / 长 RPC, 但应优先用 SSE 端点而非长 RPC)。
   */
  timeoutMs?: number;
  /**
   * 🔧 P1-12 fix: 是否启用 GET 请求去重 (默认 true).
   *   旧代码: 多个组件独立调用同一 GET API (如 /api/challenge/active), 浪费带宽与服务端资源.
   *   修复: 对 GET 请求, 同一 URL + 同一时刻的 in-flight promise 共享, 第一个完成后所有等待者一起收到结果.
   *   设 dedupe=false 可禁用 (如需要 fresh data, 或调用方有自己的缓存逻辑).
   */
  dedupe?: boolean;
}

// 🔧 P1-12 fix: GET 请求 in-flight promise cache (模块级, 同一 URL 同时只发一次)
//   key: url, value: Promise<T>
//   请求完成后从 cache 移除, 下次调用重新发起.
//   注意: 仅对 method=GET (或 undefined, 默认 GET) 生效; POST/PUT/DELETE 不去重.
const inflightGetRequests = new Map<string, Promise<unknown>>();

/**
 * 发起 API 请求, 返回解析后的 JSON 数据
 *
 * @throws ApiError 当 HTTP 状态码非 2xx 时
 * @throws TypeError 当网络错误时
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, signal: callerSignal, timeoutMs = 30_000, dedupe = true, ...rest } = options;

  // 🔧 P1-12 fix: GET 请求去重 — 同一 URL 同时只发一次, 多个调用方共享 promise.
  //   注意: dedupe=true (默认) 且 method 是 GET (或 undefined) 且无 body 才去重.
  //   POST/PUT/DELETE 不去重 (可能不幂等).
  //   调用方传 dedupe=false 可禁用 (如需要 fresh data).
  const method = (rest.method as string | undefined)?.toUpperCase() || 'GET';
  const isDedupableGet = dedupe && method === 'GET' && body === undefined;
  if (isDedupableGet) {
    const existing = inflightGetRequests.get(url);
    if (existing) {
      // 共享 in-flight promise, 不发新请求
      // 🔧 2026-07-15 (ARCH-11 #29 修复): 不把 callerSignal 传给共享 promise
      //    旧代码: 第一个 caller 的 signal 绑定到 doFetch, A abort → 整个请求 abort → B 也被 reject
      //    修复: 共享 promise 不受任何 caller 的 signal 影响 (用内部 timeout signal 即可)
      //    若 caller 需要取消, 应设 dedupe=false 发独立请求
      return existing as Promise<T>;
    }
    // 没有在飞的, 创建新 promise 并存入 cache
    // 🔧 2026-07-15 (ARCH-11 #29): dedupe 请求不传 callerSignal (避免 A abort 影响 B)
    const promise = doFetch<T>(url, body, customHeaders, undefined, timeoutMs, rest);
    inflightGetRequests.set(url, promise);
    try {
      const result = await promise;
      return result;
    } finally {
      // 完成后从 cache 移除 (无论成功/失败), 让下次调用重新发起
      inflightGetRequests.delete(url);
    }
  }

  return doFetch<T>(url, body, customHeaders, callerSignal, timeoutMs, rest);
}

/**
 * doFetch — 实际发起 fetch 请求的内部函数 (P1-12 fix: 从 apiFetch 抽出, 支持 dedupe 复用)
 */
async function doFetch<T>(
  url: string,
  body: unknown,
  customHeaders: HeadersInit | undefined,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  rest: Omit<RequestInit, 'headers' | 'body' | 'signal'>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  // 🔧 Round 11 M5: 默认 30s 超时, 防 UI 永久 loading
  // 🔧 ARCH fix (Round 17 audit M6 — setTimeout 在 fetch 完成后不清除, 30s 内泄漏):
  //    旧代码: createTimeoutSignal 的 timer 只在 abort 时清, 正常完成时 30s 内泄漏。
  //    根因修复: 内联创建 controller + timer, 用 try/catch 确保 timer 立即清除。
  const controller = new AbortController();
  const tid = timeoutMs > 0 ? setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs) : null;
  // 🔧 ARCH fix (Round 25 R25-9 — callerSignal abort listener 从不移除 → 内存泄漏):
  const onCallerAbort = () => controller.abort(callerSignal!.reason);
  if (callerSignal) {
    if (callerSignal.aborted) {
      if (tid) clearTimeout(tid);
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // 🔧 ARCH fix (Round 21 BUG-3): 显式 credentials: 'include' 确保跨子域 cookie 发送
      credentials: 'include',
    });
    if (tid) clearTimeout(tid);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        try {
          errorBody = await response.text();
        } catch {
          errorBody = undefined;
      }
    }
    const message =
      (errorBody && typeof errorBody === 'object' && 'error' in errorBody
        ? String((errorBody as { error: unknown }).error)
        : `HTTP ${response.status}`) || `HTTP ${response.status}`;
    throw new ApiError(response.status, message, errorBody);
  }

  // 空响应 (204 No Content)
  if (response.status === 204) {
    return undefined as T;
  }

  // 🔧 ARCH fix (Round 28 H4 — response.json() parse error 不被 catch 捕获):
  //    旧代码: return response.json() — promise rejection 不经过 try/catch (return 不 await)。
  //    根因修复: 用 await 让 parse error 被 catch 包裹为 ApiError。
  return await response.json() as T;
  } catch (err) {
    if (tid) clearTimeout(tid);
    throw err;
  } finally {
    // 🔧 Round 25 R25-9: 移除 callerSignal listener 防 memory leak
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * 发起 API 请求, 不解析响应体 (用于 DELETE 等无返回值操作)
 *
 * @throws ApiError 当 HTTP 状态码非 2xx 时
 */
export async function apiFetchVoid(
  url: string,
  options: ApiFetchOptions = {},
): Promise<void> {
  const { body, headers: customHeaders, signal: callerSignal, timeoutMs = 30_000, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  // 🔧 Round 11 M5: 默认 30s 超时, 防 UI 永久 loading
  // 🔧 Round 17 audit M6: 用 try/finally 清 timer (同 apiFetch)
  const controller = new AbortController();
  const tid = timeoutMs > 0 ? setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs) : null;
  // 🔧 ARCH fix (Round 25 R25-9): 同 apiFetch, 移除 listener 防 memory leak
  const onCallerAbort = () => controller.abort(callerSignal!.reason);
  if (callerSignal) {
    if (callerSignal.aborted) {
      if (tid) clearTimeout(tid);
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort);
    }
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // 🔧 ARCH fix (Round 21 BUG-3): 显式 credentials: 'include' 确保跨子域 cookie 发送
      credentials: 'include',
    });
    if (tid) clearTimeout(tid);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        // 🔧 ARCH fix (Round 6 M7): 加 response.text() fallback (与 apiFetch 一致)
        // 旧代码直接 undefined → 非 JSON 错误 (如 502 HTML) 信息丢失
        try {
          errorBody = await response.text();
        } catch {
          errorBody = undefined;
        }
      }
      const message =
        (errorBody && typeof errorBody === 'object' && 'error' in errorBody
          ? String((errorBody as { error: unknown }).error)
          : typeof errorBody === 'string' && errorBody
            ? errorBody
            : `HTTP ${response.status}`) || `HTTP ${response.status}`;
      throw new ApiError(response.status, message, errorBody);
    }
  } catch (err) {
    if (tid) clearTimeout(tid);
    throw err;
  } finally {
    // 🔧 Round 25 R25-9: 移除 callerSignal listener 防 memory leak
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}
