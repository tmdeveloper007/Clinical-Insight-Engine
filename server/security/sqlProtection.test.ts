import { describe, expect, it, vi, beforeEach } from "vitest";
import { sanitizeDatabaseError, logSecurityEvent, analyzeSearchInput } from "./sqlProtection";
import { logger } from "../logger";
import { detectSqlInjectionPattern } from "../validation/searchValidation";
import type { Request } from "express";

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../validation/searchValidation", () => ({
  detectSqlInjectionPattern: vi.fn(),
}));

/**
 * Locks down the public mapping contract of `sanitizeDatabaseError`.
 *
 * The function maps internal PostgreSQL error codes to safe HTTP responses.
 * Any accidental swap of a code or status must be caught here.
 */
describe("sanitizeDatabaseError", () => {
  describe("PostgreSQL error code mapping", () => {
    it("maps 23505 (unique_violation) to 409 with a user-friendly message", () => {
      const result = sanitizeDatabaseError({ code: "23505", message: "duplicate key" });
      expect(result).toEqual({
        statusCode: 409,
        message: "A record with this information already exists.",
      });
    });

    it("maps 23503 (foreign_key_violation) to 400", () => {
      const result = sanitizeDatabaseError({ code: "23503", message: "fk violation" });
      expect(result).toEqual({
        statusCode: 400,
        message: "Invalid reference in the submitted data.",
      });
    });

    it("maps 23502 (not_null_violation) to 400", () => {
      const result = sanitizeDatabaseError({ code: "23502", message: "null value" });
      expect(result).toEqual({
        statusCode: 400,
        message: "A required field is missing.",
      });
    });

    it("maps 22P02 (invalid_text_representation) to 400", () => {
      const result = sanitizeDatabaseError({ code: "22P02", message: "invalid input syntax" });
      expect(result).toEqual({
        statusCode: 400,
        message: "Invalid data format.",
      });
    });

    it("maps 42P01 (undefined_table) to a generic 500", () => {
      const result = sanitizeDatabaseError({ code: "42P01", message: "relation does not exist" });
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("maps 42703 (undefined_column) to a generic 500", () => {
      const result = sanitizeDatabaseError({ code: "42703", message: "column does not exist" });
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("maps 42601 (syntax_error) to a generic 500", () => {
      const result = sanitizeDatabaseError({ code: "42601", message: "syntax error" });
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("maps unrecognized PG codes to a generic 500", () => {
      const result = sanitizeDatabaseError({ code: "42XXX", message: "weird code" });
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });
  });

  describe("non-PG error inputs", () => {
    it("returns generic 500 for a plain Error (no .code)", () => {
      const err = new Error("boom");
      const result = sanitizeDatabaseError(err);
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("returns generic 500 for a plain object without .code", () => {
      const result = sanitizeDatabaseError({ message: "no code field" });
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("returns generic 500 for null", () => {
      const result = sanitizeDatabaseError(null);
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("returns generic 500 for undefined", () => {
      const result = sanitizeDatabaseError(undefined);
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("returns generic 500 for a primitive (string)", () => {
      const result = sanitizeDatabaseError("something went wrong");
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });

    it("returns generic 500 for a primitive (number)", () => {
      const result = sanitizeDatabaseError(42);
      expect(result).toEqual({
        statusCode: 500,
        message: "An unexpected error occurred.",
      });
    });
  });
});

describe("logSecurityEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockReq(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      ip: "127.0.0.1",
      path: "/api/test",
      method: "GET",
      ...overrides,
    } as unknown as Request;
  }

  it("creates a structured SecurityEvent with required fields", () => {
    const req = makeMockReq();
    logSecurityEvent("MALFORMED_SEARCH_QUERY", "test detail", req);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
    const [logObj, logMsg] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent).toBeDefined();
    expect(logObj.securityEvent.type).toBe("MALFORMED_SEARCH_QUERY");
    expect(logObj.securityEvent.detail).toBe("test detail");
    expect(logObj.securityEvent.path).toBe("/api/test");
    expect(logObj.securityEvent.method).toBe("GET");
    expect(logMsg).toBe("Security Event");
  });

  it("extracts IP from x-forwarded-for header when present", () => {
    const req = makeMockReq({ headers: { "x-forwarded-for": "1.2.3.4" } });
    logSecurityEvent("RATE_LIMIT_EXCEEDED", "rate limit hit", req);
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.ip).toBe("1.2.3.4");
  });

  it("falls back to req.ip when x-forwarded-for is absent", () => {
    const req = makeMockReq();
    logSecurityEvent("SQL_INJECTION_ATTEMPT", "possible injection", req);
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.ip).toBe("127.0.0.1");
  });

  it("extracts userAgent from headers", () => {
    const req = makeMockReq({ headers: { "user-agent": "TestBrowser/1.0" } });
    logSecurityEvent("UNAUTHORIZED_SEARCH_ACCESS", "unauthorized", req);
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.userAgent).toBe("TestBrowser/1.0");
  });

  it("defaults userAgent to unknown when not provided", () => {
    const req = makeMockReq();
    logSecurityEvent("SUSPICIOUS_SEARCH_PATTERN", "suspicious", req);
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.userAgent).toBe("unknown");
  });

  it("includes matchedPattern in event when provided", () => {
    const req = makeMockReq();
    logSecurityEvent(
      "SQL_INJECTION_ATTEMPT",
      "injection detected",
      req,
      { matchedPattern: "UNION SELECT pattern" }
    );
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.matchedPattern).toBe("UNION SELECT pattern");
  });

  it("includes userId in event when provided", () => {
    const req = makeMockReq();
    logSecurityEvent(
      "UNAUTHORIZED_SEARCH_ACCESS",
      "unauthorized access",
      req,
      { userId: "user-abc-123" }
    );
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.userId).toBe("user-abc-123");
  });

  it("includes timestamp in ISO format", () => {
    const req = makeMockReq();
    logSecurityEvent("MALFORMED_SEARCH_QUERY", "test", req);
    const [logObj] = vi.mocked(logger.warn).mock.calls[0];
    expect(logObj.securityEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("analyzeSearchInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns safe: true when detectSqlInjectionPattern returns null', () => {
    vi.mocked(detectSqlInjectionPattern).mockReturnValue(null);
    const result = analyzeSearchInput("normal patient query");
    expect(result).toEqual({ safe: true });
  });

  it('returns safe: false with pattern when detectSqlInjectionPattern returns a string', () => {
    vi.mocked(detectSqlInjectionPattern).mockReturnValue("UNION-based injection detected");
    const result = analyzeSearchInput("test' OR 1=1 --");
    expect(result).toEqual({ safe: false, pattern: "UNION-based injection detected" });
  });

  it("passes input string to detectSqlInjectionPattern", () => {
    vi.mocked(detectSqlInjectionPattern).mockReturnValue(null);
    analyzeSearchInput("diabetes patient lookup");
    expect(vi.mocked(detectSqlInjectionPattern)).toHaveBeenCalledWith("diabetes patient lookup");
  });

  it("passes empty string to detectSqlInjectionPattern", () => {
    vi.mocked(detectSqlInjectionPattern).mockReturnValue(null);
    analyzeSearchInput("");
    expect(vi.mocked(detectSqlInjectionPattern)).toHaveBeenCalledWith("");
  });
});
