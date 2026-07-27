import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "./asyncHandler";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
type SyncHandler = (req: Request, res: Response, next: NextFunction) => void;

describe("asyncHandler", () => {
  it("calls the wrapped function with req, res, next", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    const handler = asyncHandler(async (r, resArg, nextArg) => {
      expect(r).toBe(req);
      expect(resArg).toBe(res);
      expect(nextArg).toBe(next);
    });
    await handler(req, res, next);
  });

  it("resolves successfully when the async function resolves", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    const handler = asyncHandler(async () => {
      return Promise.resolve();
    });
    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes thrown errors to next", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    const testError = new Error("boom");
    const handler = asyncHandler(async () => {
      throw testError;
    });
    await handler(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBe(testError);
  });

  it("passes rejected promises to next", async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();
    const testError = new Error("rejected");
    const handler = asyncHandler(async () => {
      throw testError;
    });
    // The returned function is synchronous; promise chain settles immediately
    handler(req, res, next);
    // Wait for microtasks to flush so .catch(next) has fired
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBe(testError);
  });

  it("returns a function", () => {
    const fn = asyncHandler(async () => {});
    expect(typeof fn).toBe("function");
  });
});
