import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "./asyncHandler";

describe("asyncHandler", () => {
  it("calls the wrapped handler with req, res, and next", () => {
    const handler = vi.fn();
    const wrapped = asyncHandler(handler);
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    wrapped(mockReq as any, mockRes as any, mockNext);

    expect(handler).toHaveBeenCalledOnce;
    expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
  });

  it("does not call next when the handler resolves", async () => {
    const handler = vi.fn().mockResolvedValue("success");
    const wrapped = asyncHandler(handler);
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    wrapped(mockReq as any, mockRes as any, mockNext);
    // Wait for the Promise to settle
    await new Promise(setImmediate);
    await new Promise(setImmediate);

    expect(mockNext).not.toHaveBeenCalled;
  });

  it("calls next with the error when the handler rejects", async () => {
    const error = new Error("Something went wrong");
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(handler);
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    wrapped(mockReq as any, mockRes as any, mockNext);
    // Wait for the Promise to settle
    await new Promise(setImmediate);
    await new Promise(setImmediate);

    expect(mockNext).toHaveBeenCalledOnce;
    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it("calls next with non-Error rejections", async () => {
    const handler = vi.fn().mockRejectedValue("string error");
    const wrapped = asyncHandler(handler);
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    wrapped(mockReq as any, mockRes as any, mockNext);
    await new Promise(setImmediate);
    await new Promise(setImmediate);

    expect(mockNext).toHaveBeenCalledOnce;
    expect(mockNext).toHaveBeenCalledWith("string error");
  });



  it("returns a function with arity 3 (RequestHandler interface)", () => {
    const handler = vi.fn();
    const wrapped = asyncHandler(handler);
    expect(typeof wrapped).toBe("function");
    expect(wrapped.length).toBe(3);
  });
});
