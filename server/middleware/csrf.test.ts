import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock Express types
interface MockResponse {
  cookie: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  locals: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
}

interface MockRequest {
  method: string;
  headers: Record<string, string | undefined>;
  cookies: Record<string, string | undefined>;
}

describe("CSRF Middleware", () => {
  let mockReq: MockRequest;
  let mockRes: MockResponse;
  let nextFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = {
      method: "POST",
      headers: {},
      cookies: {},
    };
    mockRes = {
      cookie: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      locals: {},
      on: vi.fn(),
    };
    nextFn = vi.fn();
  });

  describe("setCsrfToken", () => {
    it("sets a csrf-token cookie with httpOnly false", async () => {
      const { setCsrfToken } = await import("./csrf");
      setCsrfToken(mockReq as any, mockRes as any);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        "csrf-token",
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
        })
      );
    });

    it("stores the token in res.locals.csrfToken", async () => {
      const { setCsrfToken } = await import("./csrf");
      setCsrfToken(mockReq as any, mockRes as any);
      expect(mockRes.locals.csrfToken).toBeDefined();
      expect(typeof mockRes.locals.csrfToken).toBe("string");
      expect((mockRes.locals.csrfToken as string).length).toBe(64); // 32 bytes hex = 64 chars
    });

    it("generates a cryptographically random token", async () => {
      const { setCsrfToken } = await import("./csrf");
      setCsrfToken(mockReq as any, mockRes as any);
      const token1 = mockRes.locals.csrfToken as string;
      setCsrfToken(mockReq as any, mockRes as any);
      const token2 = mockRes.locals.csrfToken as string;
      expect(token1).not.toBe(token2);
    });
  });

  describe("requireCsrfToken", () => {
    it("bypasses token check for GET requests", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "GET";
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("bypasses token check for HEAD requests", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "HEAD";
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it("bypasses token check for OPTIONS requests", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "OPTIONS";
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it("bypasses token check when x-api-key header is present", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "POST";
      mockReq.headers["x-api-key"] = "my-api-key";
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it("returns 403 when cookie token is missing", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "POST";
      mockReq.headers["x-csrf-token"] = "sometoken";
      // no cookies set
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("missing") })
      );
    });

    it("returns 403 when header token is missing", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "POST";
      mockReq.cookies = { "csrf-token": "sometoken" };
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("missing") })
      );
    });

    it("returns 403 when tokens do not match", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "POST";
      mockReq.cookies = { "csrf-token": "a".repeat(64) };
      mockReq.headers["x-csrf-token"] = "b".repeat(64);
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("mismatch") })
      );
    });

    it("calls next when cookie and header tokens match", async () => {
      const { requireCsrfToken } = await import("./csrf");
      mockReq.method = "POST";
      const token = crypto.randomBytes(32).toString("hex");
      mockReq.cookies = { "csrf-token": token };
      mockReq.headers["x-csrf-token"] = token;
      requireCsrfToken(mockReq as any, mockRes as any, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
