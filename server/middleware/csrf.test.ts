import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock crypto.randomBytes
vi.spyOn(crypto, "randomBytes");

// Mock res.cookie and res.locals
function mockResponse() {
  const cookies: Array<{ name: string; value: string; opts: any }> = [];
  return {
    cookie: vi.fn((name, value, opts) => {
      cookies.push({ name, value, opts });
    }),
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    cookies,
  };
}

function mockRequest(overrides: Record<string, any> = {}) {
  return {
    method: "POST",
    headers: {},
    cookies: {},
    ...overrides,
  } as any;
}

function mockNext() {
  return vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Make randomBytes return predictable token
  (crypto.randomBytes as any).mockReturnValue(Buffer.from("a".repeat(32)));
});

describe("setCsrfToken", () => {
  it("sets a csrf cookie on the response", () => {
    // Dynamic import to avoid hoisting issues
    return import("./csrf").then(({ setCsrfToken }) => {
      const req = mockRequest({ method: "GET" });
      const res = mockResponse();
      setCsrfToken(req, res);
      expect(res.cookie).toHaveBeenCalledWith(
        "csrf-token",
        expect.any(String),
        expect.objectContaining({ httpOnly: false, sameSite: "strict" })
      );
    });
  });

  it("stores the token in res.locals", async () => {
    const { setCsrfToken } = await import("./csrf");
    const req = mockRequest({ method: "GET" });
    const res = mockResponse();
    setCsrfToken(req, res);
    expect(res.locals.csrfToken).toBeTruthy();
    expect(res.locals.csrfToken.length).toBeGreaterThan(0);
  });

  it("generates a 64-character hex token (32 bytes)", async () => {
    const { setCsrfToken } = await import("./csrf");
    const req = mockRequest({ method: "GET" });
    const res = mockResponse();
    setCsrfToken(req, res);
    expect(res.locals.csrfToken).toHaveLength(64);
  });
});

describe("requireCsrfToken", () => {
  it("allows GET requests through without checking tokens", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({ method: "GET" });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows HEAD requests through without checking tokens", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({ method: "HEAD" });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows OPTIONS requests through without checking tokens", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({ method: "OPTIONS" });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows requests with x-api-key header through", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({
      method: "POST",
      headers: { "x-api-key": "secret-key" },
    });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when cookie token is missing", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({
      method: "POST",
      headers: {},
      cookies: {},
    });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when header token is missing", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({
      method: "POST",
      headers: {},
      cookies: { "csrf-token": "some-token" },
    });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when tokens do not match", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const req = mockRequest({
      method: "POST",
      headers: { "x-csrf-token": "token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      cookies: { "csrf-token": "token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("mismatch") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when both tokens match", async () => {
    const { requireCsrfToken } = await import("./csrf");
    const token = "a".repeat(64);
    const req = mockRequest({
      method: "POST",
      headers: { "x-csrf-token": token },
      cookies: { "csrf-token": token },
    });
    const res = mockResponse();
    const next = mockNext();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
