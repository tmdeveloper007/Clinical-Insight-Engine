import { describe, test, expect, vi, beforeEach } from "vitest";
import type { AuditEvent } from "./access-audit";

// Mocks for logger and storage - must be declared before vi.mock
const mockInfo = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();
const mockRecordPatientAccess = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger", () => ({
  logger: {
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  },
}));

vi.mock("../storage", () => ({
  storage: {
    recordPatientAccess: mockRecordPatientAccess,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    ip: "192.168.1.100",
    headers: {
      "user-agent": "TestBrowser/1.0",
    },
    ...overrides,
  } as unknown as import("express").Request;
}

describe("access-audit", () => {
  describe("logAccessAttempt", () => {
    test("creates ACCESS_GRANTED event with correct structure", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt(
        "user-123",
        "Assessment",
        456,
        true,
        "User authorized to access this patient record"
      );

      const infoCall = mockInfo.mock.calls[0];
      const loggedEvent = infoCall[0].audit as AuditEvent;

      expect(loggedEvent.timestamp).toBeTruthy();
      expect(loggedEvent.type).toBe("ACCESS_GRANTED");
      expect(loggedEvent.userId).toBe("user-123");
      expect(loggedEvent.resourceType).toBe("Assessment");
      expect(loggedEvent.resourceId).toBe(456);
      expect(loggedEvent.reason).toBe("User authorized to access this patient record");
    });

    test("creates ACCESS_DENIED event with correct structure", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt(
        "user-123",
        "Assessment",
        789,
        false,
        "IDOR attempt: User not authorized"
      );

      const warnCall = mockWarn.mock.calls[0];
      const loggedEvent = warnCall[0].audit as AuditEvent;

      expect(loggedEvent.type).toBe("ACCESS_DENIED");
      expect(loggedEvent.userId).toBe("user-123");
      expect(loggedEvent.reason).toBe("IDOR attempt: User not authorized");
      expect(warnCall[0].security).toBe(true);
    });

    test("calls logger.info for granted access", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-1", "Patient", 1, true, "authorized");
      expect(mockInfo).toHaveBeenCalledTimes(1);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    test("calls logger.warn for denied access", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-1", "Patient", 1, false, "unauthorized");
      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockInfo).not.toHaveBeenCalled();
    });

    test("includes authMethod in event when provided", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt(
        "user-123",
        "Assessment",
        1,
        true,
        "authorized",
        "jwt"
      );

      const infoCall = mockInfo.mock.calls[0];
      const loggedEvent = infoCall[0].audit as AuditEvent;
      expect(loggedEvent.authMethod).toBe("jwt");
    });

    test("does not include authMethod when not provided", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt(
        "user-123",
        "Assessment",
        1,
        true,
        "authorized"
      );

      const infoCall = mockInfo.mock.calls[0];
      const loggedEvent = infoCall[0].audit as AuditEvent;
      expect("authMethod" in loggedEvent).toBe(false);
    });

    test("calls storage.recordPatientAccess with VIEW action for granted access", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-123", "Assessment", 1, true, "authorized");
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRecordPatientAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          resourceType: "Assessment",
          resourceId: "1",
          action: "VIEW",
          granted: true,
        })
      );
    });

    test("calls storage.recordPatientAccess with DENIED action for denied access", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-123", "Assessment", 1, false, "IDOR");
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRecordPatientAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DENIED",
          granted: false,
        })
      );
    });

    test("passes IP and User-Agent from request", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      const req = createMockRequest({});
      logAccessAttempt("user-123", "Assessment", 1, true, "auth", "session", req);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRecordPatientAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: "192.168.1.100",
          userAgent: "TestBrowser/1.0",
        })
      );
    });

    test("converts numeric resourceId to string for storage", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-123", "Assessment", 999, true, "auth");
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRecordPatientAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "999",
        })
      );
    });

    test("handles string resourceId", async () => {
      const { logAccessAttempt } = await import("./access-audit");
      logAccessAttempt("user-123", "Patient", "patient-abc", true, "auth");
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRecordPatientAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "patient-abc",
        })
      );
    });
  });
});
