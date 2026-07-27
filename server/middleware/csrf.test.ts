import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { setCsrfToken, requireCsrfToken } from "./csrf";

function makeMocks() {
  const mockRes = {
    cookie: vi.fn(),
    locals: {},
    status: vi.fn(function () { return this; }),
    json: vi.fn(function () { return this; }),
  };
  const mockNext = vi.fn();
  return { mockRes, mockNext };
}

describe("setCsrfToken", () => {
  it("sets a csrf-token cookie on the response", () => {
    const { mockRes } = makeMocks();
    const mockReq = {} as any;
    setCsrfToken(mockReq, mockRes);
    expect(mockRes.cookie).toHaveBeenCalledOnce;
    const [name, token, options] = mockRes.cookie.mock.calls[0];
    expect(name).toBe("csrf-token");
    expect(typeof token).toBe("string");
    expect(token.length).toBe(64); // 32 bytes hex = 64 chars
    expect(options.httpOnly).toBe(false);
    expect(options.sameSite).toBe("strict");
    expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
  });

  it("stores the token in res.locals.csrfToken", () => {
    const { mockRes } = makeMocks();
    const mockReq = {} as any;
    setCsrfToken(mockReq, mockRes);
    expect(typeof mockRes.locals.csrfToken).toBe("string");
    expect(mockRes.locals.csrfToken.length).toBe(64);
  });

  it("sets secure cookie in production", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { mockRes } = makeMocks();
    const mockReq = {} as any;
    setCsrfToken(mockReq, mockRes);
    const [, , options] = mockRes.cookie.mock.calls[0];
    expect(options.secure).toBe(true);
    process.env.NODE_ENV = original;
  });

  it("sets non-secure cookie in non-production", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const { mockRes } = makeMocks();
    const mockReq = {} as any;
    setCsrfToken(mockReq, mockRes);
    const [, , options] = mockRes.cookie.mock.calls[0];
    expect(options.secure).toBe(false);
    process.env.NODE_ENV = original;
  });
});

describe("requireCsrfToken", () => {
  it("calls next() for GET requests without any token checks", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = { method: "GET" } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce;
    expect(mockRes.status).not.toHaveBeenCalled;
  });

  it("calls next() for HEAD requests", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = { method: "HEAD" } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce;
  });

  it("calls next() for OPTIONS requests", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = { method: "OPTIONS" } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce;
  });

  it("calls next() when x-api-key header is present", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = {
      method: "POST",
      headers: { "x-api-key": "my-secret-key" },
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce;
    expect(mockRes.status).not.toHaveBeenCalled;
  });

  it("returns 403 when cookie token is missing", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = {
      method: "POST",
      cookies: {},
      headers: { "x-csrf-token": "sometoken" },
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(mockNext).not.toHaveBeenCalled;
  });

  it("returns 403 when header token is missing", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = {
      method: "POST",
      cookies: { "csrf-token": "sometoken" },
      headers: {},
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled;
  });

  it("returns 403 when both tokens are missing", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = {
      method: "POST",
      cookies: {},
      headers: {},
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled;
  });

  it("returns 403 when tokens do not match", () => {
    const { mockRes, mockNext } = makeMocks();
    const mockReq = {
      method: "POST",
      cookies: { "csrf-token": "a".repeat(64) },
      headers: { "x-csrf-token": "b".repeat(64) },
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("mismatch") })
    );
    expect(mockNext).not.toHaveBeenCalled;
  });

  it("calls next() when cookie and header tokens match", () => {
    const { mockRes, mockNext } = makeMocks();
    const token = crypto.randomBytes(32).toString("hex");
    const mockReq = {
      method: "POST",
      cookies: { "csrf-token": token },
      headers: { "x-csrf-token": token },
    } as any;
    requireCsrfToken(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledOnce;
    expect(mockRes.status).not.toHaveBeenCalled;
  });
});
