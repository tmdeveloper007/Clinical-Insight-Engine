import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock express-rate-limit before importing the middleware
// The mock bypasses real validation so batchLimiter (which uses req.ip without
// the ipKeyGenerator helper) can be instantiated and tested.
vi.mock("express-rate-limit", () => ({
  rateLimit: vi.fn((config) => {
    const middleware = (req, res, next) => { next(); };
    Object.assign(middleware, config);
    return middleware;
  }),
}));

beforeEach(() => {
  vi.resetModules();
});

describe("rateLimit middleware", () => {
  it("generalLimiter uses 60s window and 100 request limit", async () => {
    const { generalLimiter } = await import("./rateLimit");
    expect(generalLimiter.windowMs).toBe(60 * 1000);
    expect(generalLimiter.limit).toBe(100);
    expect(generalLimiter.standardHeaders).toBe(true);
    expect(generalLimiter.legacyHeaders).toBe(false);
    expect(generalLimiter.message).toEqual({
      message: "Too many requests, please try again later.",
    });
  });

  it("mlLimiter uses 60s window and 20 request limit", async () => {
    const { mlLimiter } = await import("./rateLimit");
    expect(mlLimiter.windowMs).toBe(60 * 1000);
    expect(mlLimiter.limit).toBe(20);
    expect(mlLimiter.message).toEqual({
      message: "Too many prediction requests, please try again later.",
    });
  });

  it("adminLimiter uses 60s window and 60 request limit", async () => {
    const { adminLimiter } = await import("./rateLimit");
    expect(adminLimiter.windowMs).toBe(60 * 1000);
    expect(adminLimiter.limit).toBe(60);
    expect(adminLimiter.message).toEqual({
      message: "Too many admin requests, please try again later.",
    });
  });

  it("exportLimiter uses 60s window and 10 request limit", async () => {
    const { exportLimiter } = await import("./rateLimit");
    expect(exportLimiter.windowMs).toBe(60 * 1000);
    expect(exportLimiter.limit).toBe(10);
    expect(exportLimiter.message).toEqual({
      message: "Too many export requests, please try again later.",
    });
  });

  it("assessmentLimiter uses 15min window and 5 request limit", async () => {
    const { assessmentLimiter } = await import("./rateLimit");
    expect(assessmentLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(assessmentLimiter.limit).toBe(5);
    expect(assessmentLimiter.message).toEqual({
      error: "Too many assessment requests, please try again later.",
    });
  });

  it("previewLimiter uses 15min window and 10 request limit", async () => {
    const { previewLimiter } = await import("./rateLimit");
    expect(previewLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(previewLimiter.limit).toBe(10);
    expect(previewLimiter.message).toEqual({
      error: "Too many preview requests, please try again later.",
    });
  });

  it("batchLimiter uses 60s window and 5 request limit", async () => {
    const { batchLimiter } = await import("./rateLimit");
    expect(batchLimiter.windowMs).toBe(60 * 1000);
    expect(batchLimiter.limit).toBe(5);
    expect(batchLimiter.validate).toEqual({ ip: false });
    expect(batchLimiter.message).toEqual({
      error: "Too many batch requests, please try again later.",
    });
  });

  it("batchLimiter keyGenerator returns session user id when available", async () => {
    const { batchLimiter } = await import("./rateLimit");
    const mockReq = {
      session: { user: { id: "user-42" } },
      ip: "192.168.1.1",
    } as any;
    expect(batchLimiter.keyGenerator(mockReq)).toBe("user-42");
  });

  it("batchLimiter keyGenerator falls back to IP when no session user", async () => {
    const { batchLimiter } = await import("./rateLimit");
    const mockReq = { session: {}, ip: "10.0.0.5" } as any;
    expect(batchLimiter.keyGenerator(mockReq)).toBe("10.0.0.5");
  });
});
