import { describe, expect, test, vi, beforeEach } from "vitest";
import { setCsrfToken, requireCsrfToken } from "../server/middleware/csrf";

// Minimal mock for Express Request and Response
function mockRes() {
  const cookies: Record<string, string> = {};
  const res: any = {
    cookie: vi.fn((name, value, opts) => {
      cookies[name] = value;
    }),
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  (res as any)._cookies = cookies;
  return res;
}

function mockReq(overrides: any = {}): any {
  return {
    method: "POST",
    headers: {},
    cookies: {},
    ...overrides,
  };
}

describe("setCsrfToken", () => {
  test("sets a CSRF token cookie on the response", () => {
    const req = mockReq();
    const res = mockRes();
    setCsrfToken(req, res);
    expect(res.cookie).toHaveBeenCalledWith(
      "csrf-token",
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
    );
  });

  test("sets a 64-character hex token (32 bytes)", () => {
    const req = mockReq();
    const res = mockRes();
    setCsrfToken(req, res);
    const token = (res as any)._cookies["csrf-token"];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  test("stores the token in res.locals", () => {
    const req = mockReq();
    const res = mockRes();
    setCsrfToken(req, res);
    expect(res.locals.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(res.locals.csrfToken).toBe((res as any)._cookies["csrf-token"]);
  });
});

describe("requireCsrfToken", () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  test("GET requests bypass CSRF check and call next immediately", () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("HEAD requests bypass CSRF check and call next immediately", () => {
    const req = mockReq({ method: "HEAD" });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("OPTIONS requests bypass CSRF check and call next immediately", () => {
    const req = mockReq({ method: "OPTIONS" });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("requests with x-api-key header bypass CSRF check", () => {
    const req = mockReq({
      method: "POST",
      headers: { "x-api-key": "secret-key-123" },
    });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("returns 403 when cookie token is missing", () => {
    const req = mockReq({
      method: "POST",
      headers: { "x-csrf-token": "some-token" },
      cookies: {},
    });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 403 when header token is missing", () => {
    const req = mockReq({
      method: "POST",
      headers: {},
      cookies: { "csrf-token": "some-cookie-token" },
    });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("missing") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 403 when both cookie and header tokens are missing", () => {
    const req = mockReq({ method: "POST", headers: {}, cookies: {} });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 403 when tokens do not match", () => {
    // Use same-length tokens so timingSafeEqual does not throw
    const req = mockReq({
      method: "POST",
      headers: { "x-csrf-token": "a".repeat(64) },
      cookies: { "csrf-token": "b".repeat(64) },
    });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("mismatch") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when valid cookie and header tokens match", () => {
    const token = "a".repeat(64); // 32 bytes as 64 hex chars
    const req = mockReq({
      method: "POST",
      headers: { "x-csrf-token": token },
      cookies: { "csrf-token": token },
    });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("POST without x-api-key and without any CSRF tokens returns 403", () => {
    const req = mockReq({ method: "POST", headers: {}, cookies: {} });
    const res = mockRes();
    requireCsrfToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
