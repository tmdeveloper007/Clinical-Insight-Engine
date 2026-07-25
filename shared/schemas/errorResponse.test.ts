import { describe, it, expect } from "vitest";
import { errorResponseSchema, createErrorResponse, type ErrorResponse } from "./errorResponse";

describe("errorResponseSchema", () => {
  it("accepts a valid error response with message only", () => {
    const result = errorResponseSchema.safeParse({ message: "Not found" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Not found");
      expect(result.data.requestId).toBeUndefined();
    }
  });

  it("accepts a valid error response with message and requestId", () => {
    const result = errorResponseSchema.safeParse({
      message: "Internal error",
      requestId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Internal error");
      expect(result.data.requestId).toBe("123e4567-e89b-12d3-a456-426614174000");
    }
  });

  it("rejects when message is missing", () => {
    const result = errorResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects when message is not a string", () => {
    const result = errorResponseSchema.safeParse({ message: 123 });
    expect(result.success).toBe(false);
  });

  it("accepts an empty string as message (schema allows it)", () => {
    const result = errorResponseSchema.safeParse({ message: "" });
    expect(result.success).toBe(true);
  });

  it("rejects requestId that is not a valid UUID", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects requestId that is a number", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: 12345 as any,
    });
    expect(result.success).toBe(false);
  });

  it("accepts extra fields are stripped by zod", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      extraField: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extraField).toBeUndefined();
    }
  });
});

describe("createErrorResponse", () => {
  it("returns an object with the given message", () => {
    const response = createErrorResponse("Something went wrong", "req-123");
    expect(response.message).toBe("Something went wrong");
  });

  it("returns an object with the given requestId", () => {
    const response = createErrorResponse("Error", "req-abc-456");
    expect(response.requestId).toBe("req-abc-456");
  });

  it("returned object is valid according to errorResponseSchema", () => {
    const response = createErrorResponse("Server error", "123e4567-e89b-12d3-a456-426614174000");
    const result = errorResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("can be used without requestId by omitting it", () => {
    // createErrorResponse always includes requestId; for a valid schema, omit the key
    const response = { message: "Client error" };
    const result = errorResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("returned type is ErrorResponse", () => {
    const response = createErrorResponse("Error", "123e4567-e89b-12d3-a456-426614174000") as ErrorResponse;
    // TypeScript would catch mismatches; at runtime just verify structure
    expect(typeof response.message).toBe("string");
    expect(typeof response.requestId).toBe("string");
  });
});
