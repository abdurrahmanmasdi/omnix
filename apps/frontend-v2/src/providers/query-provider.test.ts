import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./query-provider";

const http = (status: number) => ({ response: { status } });

describe("shouldRetryQuery", () => {
  it("does not retry client errors that cannot change", () => {
    for (const status of [400, 401, 403, 404, 422])
      expect(shouldRetryQuery(0, http(status))).toBe(false);
  });

  it("retries timeouts, rate limits, server and network errors up to 3 times", () => {
    for (const error of [
      http(408),
      http(429),
      http(503),
      new Error("Network Error"),
    ]) {
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
      expect(shouldRetryQuery(3, error)).toBe(false);
    }
  });
});
