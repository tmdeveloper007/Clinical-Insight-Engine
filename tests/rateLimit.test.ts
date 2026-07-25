import { describe, expect, test, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock function is available in the hoisted vi.mock scope
const { mockRateLimit } = vi.hoisted(() => {
  return {
    mockRateLimit: vi.fn((options: any) => {
      const handler = vi.fn((req: any, res: any, next: any) => next());
      // Attach options to handler for test inspection
      (handler as any)._windowMs = options.windowMs;
      (handler as any)._limit = options.limit;
      (handler as any)._standardHeaders = options.standardHeaders;
      (handler as any)._legacyHeaders = options.legacyHeaders;
      (handler as any)._keyGenerator = options.keyGenerator;
      (handler as any)._validate = options.validate;
      (handler as any)._message = options.message;
      return handler;
    }),
  };
});

vi.mock("express-rate-limit", () => ({
  rateLimit: mockRateLimit,
}));

// Import after mocking
import {
  generalLimiter,
  mlLimiter,
  adminLimiter,
  exportLimiter,
  assessmentLimiter,
  previewLimiter,
  batchLimiter,
} from "../server/middleware/rateLimit";

describe("rateLimit middleware exports", () => {
  beforeEach(() => {
    mockRateLimit.mockClear();
  });

  test("all limiters are functions", () => {
    expect(typeof generalLimiter).toBe("function");
    expect(typeof mlLimiter).toBe("function");
    expect(typeof adminLimiter).toBe("function");
    expect(typeof exportLimiter).toBe("function");
    expect(typeof assessmentLimiter).toBe("function");
    expect(typeof previewLimiter).toBe("function");
    expect(typeof batchLimiter).toBe("function");
  });

  describe("generalLimiter", () => {
    test("windowMs is 60 seconds (60000ms)", () => {
      expect((generalLimiter as any)._windowMs).toBe(60 * 1000);
    });

    test("limit is 100 requests per window", () => {
      expect((generalLimiter as any)._limit).toBe(100);
    });

    test("standardHeaders is true", () => {
      expect((generalLimiter as any)._standardHeaders).toBe(true);
    });

    test("legacyHeaders is false", () => {
      expect((generalLimiter as any)._legacyHeaders).toBe(false);
    });
  });

  describe("mlLimiter", () => {
    test("windowMs is 60 seconds", () => {
      expect((mlLimiter as any)._windowMs).toBe(60 * 1000);
    });

    test("limit is 20 requests per window", () => {
      expect((mlLimiter as any)._limit).toBe(20);
    });

    test("message contains prediction context", () => {
      const msg = (mlLimiter as any)._message;
      expect(typeof msg).toBe("object");
      expect(msg.message).toContain("prediction");
    });
  });

  describe("adminLimiter", () => {
    test("windowMs is 60 seconds", () => {
      expect((adminLimiter as any)._windowMs).toBe(60 * 1000);
    });

    test("limit is 60 requests per window", () => {
      expect((adminLimiter as any)._limit).toBe(60);
    });
  });

  describe("exportLimiter", () => {
    test("windowMs is 60 seconds", () => {
      expect((exportLimiter as any)._windowMs).toBe(60 * 1000);
    });

    test("limit is 10 requests per window", () => {
      expect((exportLimiter as any)._limit).toBe(10);
    });
  });

  describe("assessmentLimiter", () => {
    test("windowMs is 15 minutes (900000ms)", () => {
      expect((assessmentLimiter as any)._windowMs).toBe(15 * 60 * 1000);
    });

    test("limit is 5 requests per window", () => {
      expect((assessmentLimiter as any)._limit).toBe(5);
    });
  });

  describe("previewLimiter", () => {
    test("windowMs is 15 minutes", () => {
      expect((previewLimiter as any)._windowMs).toBe(15 * 60 * 1000);
    });

    test("limit is 10 requests per window", () => {
      expect((previewLimiter as any)._limit).toBe(10);
    });
  });

  describe("batchLimiter", () => {
    test("windowMs is 60 seconds", () => {
      expect((batchLimiter as any)._windowMs).toBe(60 * 1000);
    });

    test("limit is 5 requests per window", () => {
      expect((batchLimiter as any)._limit).toBe(5);
    });

    test("keyGenerator falls back to req.ip when session user is absent", () => {
      const keyGen = (batchLimiter as any)._keyGenerator;
      const mockReqNoSession = { ip: "192.168.1.1" } as any;
      expect(keyGen(mockReqNoSession)).toBe("192.168.1.1");
    });

    test("keyGenerator uses session user id when present", () => {
      const keyGen = (batchLimiter as any)._keyGenerator;
      const mockReqWithSession = {
        ip: "192.168.1.1",
        session: { user: { id: "user-42" } },
      } as any;
      expect(keyGen(mockReqWithSession)).toBe("user-42");
    });

    test("validate.ip is false to disable IP-based validation", () => {
      expect((batchLimiter as any)._validate).toMatchObject({ ip: false });
    });
  });
});
