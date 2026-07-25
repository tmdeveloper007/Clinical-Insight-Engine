import { describe, it, expect } from "vitest";
import { errorResponseSchema, createErrorResponse } from "./errorResponse";

describe("errorResponseSchema", () => {
  it("accepts a valid minimal error response with only message", () => {
    const result = errorResponseSchema.safeParse({ message: "Something went wrong" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid error response with optional requestId (UUID)", () => {
    const result = errorResponseSchema.safeParse({
      message: "Server error",
      requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing the message field", () => {
    const result = errorResponseSchema.safeParse({ code: 500 });
    expect(result.success).toBe(false);
  });

  it("rejects a response with a non-string message", () => {
    const result = errorResponseSchema.safeParse({ message: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects a response with an invalid requestId (not a UUID)", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a response with a non-string requestId", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: 12345,
    });
    expect(result.success).toBe(false);
  });

  it("allows extra fields beyond message and requestId", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      extra: "field",
    });
    expect(result.success).toBe(true);
  });
});

describe("createErrorResponse", () => {
  it("returns an object with the given message and requestId", () => {
    const result = createErrorResponse("Not found", "f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(result).toEqual({
      message: "Not found",
      requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });
  });

  it("the returned object satisfies the errorResponseSchema", () => {
    const result = createErrorResponse("Server error", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    const parsed = errorResponseSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
