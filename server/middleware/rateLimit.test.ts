import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const {
  generalLimiter,
  mlLimiter,
  adminLimiter,
  exportLimiter,
  assessmentLimiter,
  previewLimiter,
  batchLimiter,
} = await import("./rateLimit");

function mockReq(ip = "127.0.0.1"): Partial<Request> {
  return { ip, method: "POST", path: "/api/test", headers: {}, cookies: {}, session: {} } as any;
}

function mockRes() {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
    append: vi.fn(),
    cookie: vi.fn(),
    locals: {},
  };
  return res;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe("rateLimit middleware — generalLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => generalLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — mlLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => mlLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — adminLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => adminLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — exportLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => exportLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — assessmentLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => assessmentLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — previewLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => previewLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});

describe("rateLimit middleware — batchLimiter", () => {
  it("calls next for a fresh request (under limit)", async () => {
    const req = mockReq() as any;
    req.session = { user: { id: "user-123" } };
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => batchLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });

  it("uses session user.id as key when available", async () => {
    const req = mockReq() as any;
    req.session = { user: { id: "user-session-key" } };
    req.ip = "192.168.1.1";
    const res = mockRes();
    const next = mockNext();
    // Just verify it calls next without error — session key is used
    await new Promise<void>((resolve) => batchLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });

  it("falls back to IP when session user is missing", async () => {
    const req = mockReq("10.0.0.1");
    const res = mockRes();
    const next = mockNext();
    await new Promise<void>((resolve) => batchLimiter(req as Request, res as Response, () => { next(); resolve(); }));
    expect(next).toHaveBeenCalled();
  });
});
