import { ApiError } from "@/lib/errors/api-error";

export const NETWORK_ERROR_STATUS = 503;

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function normalizeChatApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const message = err instanceof Error ? err.message : String(err);
  return new ApiError(`Chat network error: ${message}`, NETWORK_ERROR_STATUS);
}
