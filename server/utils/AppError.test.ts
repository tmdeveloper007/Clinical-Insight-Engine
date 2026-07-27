import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "./AppError";

describe("AppError", () => {
  it("sets message", () => {
    const err = new AppError("oops", 500);
    expect(err.message).toBe("oops");
  });

  it("sets statusCode", () => {
    const err = new AppError("oops", 503);
    expect(err.statusCode).toBe(503);
  });

  it("isOperational defaults to true", () => {
    const err = new AppError("oops", 500);
    expect(err.isOperational).toBe(true);
  });

  it("isOperational can be set to false", () => {
    const err = new AppError("oops", 500, false);
    expect(err.isOperational).toBe(false);
  });

  it("sets optional errorCode", () => {
    const err = new AppError("oops", 400, true, "INVALID_INPUT");
    expect(err.errorCode).toBe("INVALID_INPUT");
  });

  it("is instanceof Error", () => {
    const err = new AppError("oops", 500);
    expect(err instanceof Error).toBe(true);
  });

  it("has a stack trace", () => {
    const err = new AppError("oops", 500);
    expect(err.stack).toBeDefined();
    expect(err.stack!.length).toBeGreaterThan(0);
  });
});

describe("ValidationError", () => {
  it("statusCode is 400", () => {
    const err = new ValidationError("bad input");
    expect(err.statusCode).toBe(400);
  });

  it("isOperational is true", () => {
    const err = new ValidationError("bad input");
    expect(err.isOperational).toBe(true);
  });

  it("passes through errorCode", () => {
    const err = new ValidationError("bad input", "ERR_001");
    expect(err.errorCode).toBe("ERR_001");
  });
});

describe("UnauthorizedError", () => {
  it("statusCode is 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it("default message is Unauthorized", () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe("Unauthorized");
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("statusCode is 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("default message is Forbidden", () => {
    const err = new ForbiddenError();
    expect(err.message).toBe("Forbidden");
  });
});

describe("NotFoundError", () => {
  it("statusCode is 404", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it("default message is Not found", () => {
    const err = new NotFoundError();
    expect(err.message).toBe("Not found");
  });
});

describe("ConflictError", () => {
  it("statusCode is 409", () => {
    const err = new ConflictError("already exists");
    expect(err.statusCode).toBe(409);
  });

  it("passes message through", () => {
    const err = new ConflictError("duplicate entry");
    expect(err.message).toBe("duplicate entry");
  });
});
