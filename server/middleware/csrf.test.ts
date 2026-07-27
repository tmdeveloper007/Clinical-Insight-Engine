import { describe, it, expect, vi, beforeEach } from "vitest";
import { setCsrfToken, requireCsrfToken } from "./csrf";
import type { Request, Response, NextFunction } from "express";

describe("setCsrfToken", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { method: "GET" } as any;
    mockRes = {
      cookie: vi.fn(),
      locals: {},
    } as any;
    mockNext = vi.fn();
  });

  it("sets a csrf-token cookie on the response", () => {
    setCsrfToken(mockReq as Request, mockRes as Response);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      "csrf-token",
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
    );
  });

  it("sets a 64-character hex token (32 bytes)", () => {
    setCsrfToken(mockReq as Request, mockRes as Response);
    const cookieCall = (mockRes.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    const token = cookieCall[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores the token in res.locals.csrfToken", () => {
    mockRes.locals = {};
    setCsrfToken(mockReq as Request, mockRes as Response);
    expect((mockRes.locals as any).csrfToken).toBeDefined();
    const cookieCall = (mockRes.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((mockRes.locals as any).csrfToken).toBe(cookieCall[1]);
  });
});

describe("requireCsrfToken", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { method: "POST", headers: {}, cookies: {} } as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    mockNext = vi.fn();
  });

  it("bypasses token check for GET requests", () => {
    mockReq.method = "GET";
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect((mockRes.status as any).mock.calls.length).toBe(0);
  });

  it("bypasses token check for HEAD requests", () => {
    mockReq.method = "HEAD";
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("bypasses token check for OPTIONS requests", () => {
    mockReq.method = "OPTIONS";
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("bypasses token check when x-api-key header is present", () => {
    mockReq.method = "POST";
    mockReq.headers = { "x-api-key": "my-api-key" };
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when cookie token is missing", () => {
    mockReq.headers = { "x-csrf-token": "abcd" + "abcd".repeat(15) };
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
  });

  it("returns 403 when header token is missing", () => {
    mockReq.cookies = { "csrf-token": "abcd" + "abcd".repeat(15) };
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
  });

  it("returns 403 when tokens do not match", () => {
    mockReq.cookies = { "csrf-token": "a".repeat(64) };
    mockReq.headers = { "x-csrf-token": "b".repeat(64) };
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("mismatch") })
    );
  });

  it("calls next when cookie and header tokens match", () => {
    const token = "a".repeat(64);
    mockReq.cookies = { "csrf-token": token };
    mockReq.headers = { "x-csrf-token": token };
    requireCsrfToken(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
