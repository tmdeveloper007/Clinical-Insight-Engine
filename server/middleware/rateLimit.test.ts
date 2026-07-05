import { describe, it, expect } from "vitest";
import {
  generalLimiterConfig,
  mlLimiterConfig,
  adminLimiterConfig,
  exportLimiterConfig,
  assessmentLimiterConfig,
  previewLimiterConfig,
} from "./rateLimit";

/**
 * server/middleware/rateLimit.test.ts
 *
 * Unit tests for the six rate limiter configurations.
 * Confirms windowMs, limit, standardHeaders, legacyHeaders, and message shape.
 */

describe("rateLimit middleware", () => {
  describe("generalLimiter", () => {
    it("sets windowMs to 60 seconds (60000ms)", () => {
      expect(generalLimiterConfig.windowMs).toBe(60000);
    });

    it("limits each IP to 100 requests per window", () => {
      expect(generalLimiterConfig.limit).toBe(100);
    });

    it("returns standard rate-limit headers", () => {
      expect(generalLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(generalLimiterConfig.legacyHeaders).toBe(false);
    });

    it("returns a message object on limit exceeded", () => {
      expect(generalLimiterConfig.message).toEqual({
        message: "Too many requests, please try again later.",
      });
    });
  });

  describe("mlLimiter", () => {
    it("sets windowMs to 60 seconds (60000ms)", () => {
      expect(mlLimiterConfig.windowMs).toBe(60000);
    });

    it("limits each IP to 20 prediction requests per window", () => {
      expect(mlLimiterConfig.limit).toBe(20);
    });

    it("returns standard rate-limit headers", () => {
      expect(mlLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(mlLimiterConfig.legacyHeaders).toBe(false);
    });

    it("returns a prediction-specific message on limit exceeded", () => {
      expect(mlLimiterConfig.message).toEqual({
        message: "Too many prediction requests, please try again later.",
      });
    });
  });

  describe("adminLimiter", () => {
    it("sets windowMs to 60 seconds (60000ms)", () => {
      expect(adminLimiterConfig.windowMs).toBe(60000);
    });

    it("limits each IP to 60 requests per window", () => {
      expect(adminLimiterConfig.limit).toBe(60);
    });

    it("returns standard rate-limit headers", () => {
      expect(adminLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(adminLimiterConfig.legacyHeaders).toBe(false);
    });

    it("returns an admin-specific message on limit exceeded", () => {
      expect(adminLimiterConfig.message).toEqual({
        message: "Too many admin requests, please try again later.",
      });
    });
  });

  describe("exportLimiter", () => {
    it("sets windowMs to 60 seconds (60000ms)", () => {
      expect(exportLimiterConfig.windowMs).toBe(60000);
    });

    it("limits each IP to 10 export requests per window", () => {
      expect(exportLimiterConfig.limit).toBe(10);
    });

    it("returns standard rate-limit headers", () => {
      expect(exportLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(exportLimiterConfig.legacyHeaders).toBe(false);
    });

    it("returns an export-specific message on limit exceeded", () => {
      expect(exportLimiterConfig.message).toEqual({
        message: "Too many export requests, please try again later.",
      });
    });
  });

  describe("assessmentLimiter", () => {
    it("sets windowMs to 15 minutes (900000ms)", () => {
      expect(assessmentLimiterConfig.windowMs).toBe(900000);
    });

    it("limits each IP to 5 assessment requests per window", () => {
      expect(assessmentLimiterConfig.limit).toBe(5);
    });

    it("returns standard rate-limit headers", () => {
      expect(assessmentLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(assessmentLimiterConfig.legacyHeaders).toBe(false);
    });

    it("uses error field in the message on limit exceeded", () => {
      expect(assessmentLimiterConfig.message).toEqual({
        error: "Too many assessment requests, please try again later.",
      });
    });
  });

  describe("previewLimiter", () => {
    it("sets windowMs to 15 minutes (900000ms)", () => {
      expect(previewLimiterConfig.windowMs).toBe(900000);
    });

    it("limits each IP to 10 preview requests per window", () => {
      expect(previewLimiterConfig.limit).toBe(10);
    });

    it("returns standard rate-limit headers", () => {
      expect(previewLimiterConfig.standardHeaders).toBe(true);
    });

    it("disables legacy X-RateLimit-* headers", () => {
      expect(previewLimiterConfig.legacyHeaders).toBe(false);
    });

    it("uses error field in the message on limit exceeded", () => {
      expect(previewLimiterConfig.message).toEqual({
        error: "Too many preview requests, please try again later.",
      });
    });
  });
});
