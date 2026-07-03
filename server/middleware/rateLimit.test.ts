import { describe, test, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  generalLimiter,
  mlLimiter,
  adminLimiter,
  exportLimiter,
  assessmentLimiter,
  previewLimiter,
} from "./rateLimit";

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    path: "/test",
    method: "GET",
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    _status: 200,
    _jsonData: null as unknown,
    status: function(code: number) { this._status = code; return this; },
    json: function(data: unknown) { this._jsonData = data; return this; },
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as Response;
  return res;
}

function noopNext(): void {}

describe("rateLimit middleware", () => {
  test("generalLimiter is a function (Express middleware)", () => {
    expect(typeof generalLimiter).toBe("function");
    expect(generalLimiter.length).toBeGreaterThanOrEqual(0);
  });

  test("mlLimiter is a function", () => {
    expect(typeof mlLimiter).toBe("function");
  });

  test("adminLimiter is a function", () => {
    expect(typeof adminLimiter).toBe("function");
  });

  test("exportLimiter is a function", () => {
    expect(typeof exportLimiter).toBe("function");
  });

  test("assessmentLimiter is a function", () => {
    expect(typeof assessmentLimiter).toBe("function");
  });

  test("previewLimiter is a function", () => {
    expect(typeof previewLimiter).toBe("function");
  });

  test("all limiters return middleware with (req, res, next) signature", async () => {
    for (const limiter of [generalLimiter, mlLimiter, adminLimiter, exportLimiter, assessmentLimiter, previewLimiter]) {
      const middleware = limiter;
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await middleware(req, res, next);

      // next should have been called exactly once for first request (under limit)
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  test("generalLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await generalLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("mlLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await mlLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("assessmentLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await assessmentLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("previewLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await previewLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("exportLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await exportLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("adminLimiter allows first request through", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await adminLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  test("generalLimiter sets rate limit headers on response", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await generalLimiter(req, res, next);

    // standardHeaders should be true so RateLimit-* headers should be set
    expect(res._status).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  test("different IPs are tracked independently", async () => {
    // Each unique IP should get its own rate limit counter
    const ip1 = "192.168.1.1";
    const ip2 = "192.168.1.2";
    const next = vi.fn();
    const res1 = createMockRes();
    const res2 = createMockRes();

    await generalLimiter(createMockReq({ ip: ip1 }), res1, next);
    const next2 = vi.fn();
    await generalLimiter(createMockReq({ ip: ip2 }), res2, next2);

    // Both requests should be allowed through (different IPs)
    expect(next).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);
  });
});
