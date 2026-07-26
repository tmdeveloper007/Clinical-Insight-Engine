import { describe, expect, it } from "vitest";
import { errorResponseSchema, createErrorResponse } from "./errorResponse";

describe("errorResponseSchema", () => {
  it("parses a valid error response with only message", () => {
    const result = errorResponseSchema.safeParse({ message: "Not found" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Not found");
      expect(result.data.requestId).toBeUndefined();
    }
  });

  it("parses a valid error response with message and requestId", () => {
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = errorResponseSchema.safeParse({
      message: "Internal server error",
      requestId: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Internal server error");
      expect(result.data.requestId).toBe(validUuid);
    }
  });

  it("rejects a response missing the message field", () => {
    const result = errorResponseSchema.safeParse({ requestId: "123" });
    expect(result.success).toBe(false);
  });

  it("rejects a response with a non-string message", () => {
    const result = errorResponseSchema.safeParse({ message: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects a response with a malformed requestId (not a UUID)", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a response with a numeric requestId", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      requestId: 12345,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a response with extra fields (extra fields are stripped)", () => {
    const result = errorResponseSchema.safeParse({
      message: "Error",
      statusCode: 500,
      extra: "unknown",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe("Error");
      // statusCode and extra should be absent (strictness depends on zod config,
      // but the schema itself only validates known keys)
      expect((result.data as any).statusCode).toBeUndefined();
    }
  });
});

describe("createErrorResponse", () => {
  it("returns an object with the given message and requestId", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = createErrorResponse("Validation failed", uuid);
    expect(result.message).toBe("Validation failed");
    expect(result.requestId).toBe(uuid);
  });

  it("returns an object that satisfies the errorResponseSchema", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const response = createErrorResponse("Server error", uuid);
    const result = errorResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("returns an object where requestId matches the input uuid", () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const response = createErrorResponse("OK", uuid);
    expect(response.requestId).toBe(uuid);
    expect(response.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
