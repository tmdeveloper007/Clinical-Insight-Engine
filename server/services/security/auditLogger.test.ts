import { describe, it, expect, vi, beforeEach } from "vitest";
import { logAuditEvent, generateRequestId } from "./auditLogger";

const { mockWarn, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("../../logger", () => ({
  logger: { warn: mockWarn, error: mockError },
}));

describe("maskSensitiveData (via logAuditEvent integration)", () => {
  // Test via logAuditEvent since direct import has module cache issues
  // The masking logic is verified by checking the payload sent to logger.warn

  beforeEach(() => {
    mockWarn.mockClear();
  });

  it("masks ssn in audit event payload", () => {
    logAuditEvent("Audit event", { requestId: "req-x", ssn: "123-45-6789" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.ssn).toBe("***-MASKED-***");
  });

  it("masks email in audit event payload", () => {
    logAuditEvent("Audit event", { requestId: "req-y", email: "secret@example.com" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.email).toBe("***-MASKED-***");
  });

  it("masks password in audit event payload", () => {
    logAuditEvent("Audit event", { requestId: "req-z", password: "supersecret" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.password).toBe("***-MASKED-***");
  });

  it("preserves non-sensitive fields unchanged", () => {
    logAuditEvent("Audit event", { requestId: "req-a", statusCode: 403, path: "/api/secure" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.statusCode).toBe(403);
    expect(payload.path).toBe("/api/secure");
    expect(payload.ssn).toBeUndefined();
  });

  it("recursively masks nested objects", () => {
    logAuditEvent("Audit event", { requestId: "req-b", nested: { email: "nested@test.com", safe: "ok" } });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.nested.email).toBe("***-MASKED-***");
    expect(payload.nested.safe).toBe("ok");
  });
});

describe("logAuditEvent", () => {
  beforeEach(() => {
    mockWarn.mockClear();
    mockError.mockClear();
  });

  it("calls logger.warn with auditLog payload", () => {
    const details = { requestId: "req-123", statusCode: 200 };
    logAuditEvent("User logged in", details);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const callArgs = mockWarn.mock.calls[0];
    expect(callArgs[0]).toHaveProperty("auditLog");
  });

  it("includes timestamp in the audit log", () => {
    logAuditEvent("Test event", { requestId: "req-1" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload).toHaveProperty("timestamp");
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it("includes message in the audit log", () => {
    logAuditEvent("Custom audit message", { requestId: "req-2" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.message).toBe("Custom audit message");
  });

  it("includes masked details in the audit log", () => {
    logAuditEvent("Auth event", { requestId: "req-3", email: "secret@example.com", safeField: "visible" });
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.email).toBe("***-MASKED-***");
    expect(payload.safeField).toBe("visible");
  });

  it("attaches error name and message when error is an Error instance", () => {
    const err = new Error("Token expired");
    logAuditEvent("Auth failure", { requestId: "req-4" }, err);
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.errorName).toBe("Error");
    expect(payload.errorMessage).toBe("Token expired");
  });

  it("attaches raw string when error is not an Error instance", () => {
    logAuditEvent("Failure", { requestId: "req-5" }, "string error");
    const payload = mockWarn.mock.calls[0][0].auditLog;
    expect(payload.rawError).toBe("string error");
  });

  it("does not throw when details is empty", () => {
    expect(() => logAuditEvent("Empty event", {})).not.toThrow();
  });
});

describe("generateRequestId", () => {
  it("returns a non-empty string", () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns a UUID-formatted string", () => {
    const id = generateRequestId();
    // UUID v4 format: 8-4-4-4-12 hex digits
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set([generateRequestId(), generateRequestId(), generateRequestId()]);
    expect(ids.size).toBe(3);
  });
});
