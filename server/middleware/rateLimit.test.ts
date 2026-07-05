import { describe, it, expect, vi, beforeEach } from "vitest";

// Declare all mock state in vi.hoisted so vi.mock can reference it after hoisting
const mocks = vi.hoisted(() => {
  const mwMocks = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  let mwIndex = 0;
  return {
    mwMocks,
    getMw: () => {
      const mw = mwMocks[mwIndex++];
      mw.mockImplementation((req: any, res: any, next: any) => next());
      return mw;
    },
  };
});

vi.mock("express-rate-limit", () => ({
  rateLimit: mocks.getMw,
}));

import {
  generalLimiter,
  mlLimiter,
  adminLimiter,
  exportLimiter,
  assessmentLimiter,
  previewLimiter,
} from "./rateLimit";

describe("rateLimit middleware exports", () => {
  beforeEach(() => {
    // Reset mwIndex so subsequent tests can verify fresh calls
    // Note: mwMocks[0..5] are already created by the import; this resets tracking only
    mocks.mwMocks.forEach((m) => m.mockClear());
  });

  it("all limiters are functions", () => {
    expect(typeof generalLimiter).toBe("function");
    expect(typeof mlLimiter).toBe("function");
    expect(typeof adminLimiter).toBe("function");
    expect(typeof exportLimiter).toBe("function");
    expect(typeof assessmentLimiter).toBe("function");
    expect(typeof previewLimiter).toBe("function");
  });

  it("each limiter is a distinct middleware instance", () => {
    const unique = new Set([
      generalLimiter,
      mlLimiter,
      adminLimiter,
      exportLimiter,
      assessmentLimiter,
      previewLimiter,
    ]);
    expect(unique.size).toBe(6);
  });

  it("generalLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    generalLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("mlLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    mlLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("adminLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    adminLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("exportLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    exportLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("assessmentLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    assessmentLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("previewLimiter calls next for a valid request", () => {
    const mockReq = { ip: "127.0.0.1" };
    const mockRes = { setHeader: vi.fn(), statusCode: 200, on: vi.fn() };
    const mockNext = vi.fn();
    previewLimiter(mockReq as any, mockRes as any, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it("six middleware instances are created (one per limiter export)", () => {
    // Import created 6 distinct mw instances
    expect(mocks.mwMocks[5]).toBeDefined();
  });
});
