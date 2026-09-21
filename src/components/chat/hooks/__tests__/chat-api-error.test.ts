import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors/api-error";
import {
  isAbortError,
  NETWORK_ERROR_STATUS,
  normalizeChatApiError,
} from "../chat-api-error";

describe("chat API error normalization", () => {
  it("preserves HTTP error status", () => {
    const error = new ApiError("service unavailable", 503);

    expect(normalizeChatApiError(error)).toBe(error);
  });

  it("maps a network failure to a 503 ApiError", () => {
    const error = normalizeChatApiError(new TypeError("network dropped"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(NETWORK_ERROR_STATUS);
  });

  it("recognizes AbortError without normalizing it to an HTTP failure", () => {
    const error = new DOMException("aborted", "AbortError");

    expect(isAbortError(error)).toBe(true);
  });
});
