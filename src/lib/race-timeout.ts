/**
 * raceWithTimeout — Promise.race + timeout helper
 *
 * 🔧 ARCH fix (Round 51 R51-Opt1 — Promise.race + timeout 模式重复 8 次):
 *    旧代码: 每个调用点手动写 Promise.race + setTimeout + clearTimeout, 容易忘记 .catch()
 *    (Round 49 修复了 5 处漏 .catch() 的 timer 泄漏)。
 *    根因修复: 提取共享 helper, 内置正确的 timer cleanup + rejection handling。
 *
 * 用法:
 *   // 超时后用 fallback 值 (不抛错):
 *   const result = await raceWithTimeoutFallback(
 *     fetchSlowData(),
 *     10_000,
 *     'fallback value'
 *   );
 *
 *   // 超时后抛错:
 *   const result = await raceWithTimeoutReject(
 *     fetchSlowData(),
 *     10_000,
 *     new Error('fetchSlowData timeout')
 *   );
 */

/**
 * Race a promise against a timeout. If the timeout fires first, return the fallback value.
 * If the promise rejects before the timeout, the rejection propagates (timer is cleared).
 * If the promise resolves before the timeout, the timer is cleared.
 *
 * @param promise The promise to race
 * @param timeoutMs Timeout in milliseconds
 * @param fallback Value to return if timeout fires first
 * @returns The promise result or fallback value
 */
export async function raceWithTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise.then(result => {
        if (timer) clearTimeout(timer);
        return result;
      }).catch(err => {
        if (timer) clearTimeout(timer);
        throw err;
      }),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    // promise rejected before timeout — timer already cleared by .catch()
    throw err;
  }
}

/**
 * Race a promise against a timeout. If the timeout fires first, reject with timeoutError.
 * If the promise rejects before the timeout, the rejection propagates (timer is cleared).
 * If the promise resolves before the timeout, the timer is cleared.
 *
 * @param promise The promise to race
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutError Error to reject with if timeout fires first
 * @returns The promise result
 * @throws timeoutError if timeout fires first, or the promise's rejection if it rejects first
 */
// 🔧 Round 120 audit fix: removed unnecessary `async` (no await used, returns Promise directly)
//    require-await rule was flagging this — async without await is a code smell
export function raceWithTimeoutReject<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    promise.then(result => {
      if (timer) clearTimeout(timer);
      return result;
    }).catch(err => {
      if (timer) clearTimeout(timer);
      throw err;
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(timeoutError);
      }, timeoutMs);
    }),
  ]);
}
