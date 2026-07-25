import { describe, it, expect, vi, beforeEach } from "vitest";
import { setCsrfToken, requireCsrfToken } from "./csrf";
import type { Request, Response } from "express";

describe("setCsrfToken", () => {
  it("sets a csrf-token cookie on the response", () => {
    const mockRes = {
      cookie: vi.fn(),
      locals: {},
    } as unknown as Response;
    setCsrfToken({} as any, mockRes);
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

  it("sets res.locals.csrfToken to the same token value", () => {
    const tokenHolder: Record<string, unknown> = {};
    const mockRes = {
      cookie: vi.fn(),
      locals: tokenHolder,
    } as unknown as Response;
    setCsrfToken({} as any, mockRes);
    expect(tokenHolder.csrfToken).toBeDefined();
    expect(typeof tokenHolder.csrfToken).toBe("string");
  });

  it("token is 64 hex characters (32 bytes as hex)", () => {
    const mockRes = {
      cookie: vi.fn(),
      locals: {},
    } as unknown as Response;
    setCsrfToken({} as any, mockRes);
    const token = mockRes.locals.csrfToken as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("requireCsrfToken", () => {
  let mockNext: ReturnType<typeof vi.fn>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockNext = vi.fn();
    mockRes = {
      status: vi.fn().mockReturnThis() as any,
      json: vi.fn() as any,
    };
  });

  it("calls next for GET requests without checking tokens", () => {
    const mockReq = { method: "GET", headers: {}, cookies: {} } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("calls next for HEAD requests without checking tokens", () => {
    const mockReq = { method: "HEAD", headers: {}, cookies: {} } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("calls next for OPTIONS requests without checking tokens", () => {
    const mockReq = { method: "OPTIONS", headers: {}, cookies: {} } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("calls next when x-api-key header is present (bypass)", () => {
    const mockReq = {
      method: "POST",
      headers: { "x-api-key": "some-key" },
      cookies: {},
    } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("returns 403 when cookie token is missing", () => {
    const mockReq = {
      method: "POST",
      headers: { "x-csrf-token": "abc123" },
      cookies: {},
    } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 403 when header token is missing", () => {
    const mockReq = {
      method: "POST",
      headers: {},
      cookies: { "csrf-token": "abc123" },
    } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 403 when tokens do not match", () => {
    const mockReq = {
      method: "POST",
      headers: { "x-csrf-token": "aaaabbbb" },
      cookies: { "csrf-token": "ccccdddd" },
    } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("mismatch") })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("calls next when cookie and header tokens match", () => {
    const token = "aaaabbbbccccddddeeeeffffgggghhhh";
    const mockReq = {
      method: "POST",
      headers: { "x-csrf-token": token },
      cookies: { "csrf-token": token },
    } as any;
    requireCsrfToken(mockReq, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
