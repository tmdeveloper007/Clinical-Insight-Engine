import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../server/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.session = { user: { email: "test@example.com" } };
    next();
  },
  requireVerified: (req: any, res: any, next: any) => next(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getAnalyticsStats: vi.fn().mockResolvedValue({
      totalAssessments: 10,
      highRisk: 2,
      mediumRisk: 3,
      lowRisk: 5,
    }),
  },
}));

vi.mock("../../server/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import analyticsRouter from "./analytics.routes";

describe("analytics routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/", analyticsRouter);

  describe("GET /analytics", () => {
    it("returns 200 with stats when authenticated with session email", async () => {
      const response = await request(app).get("/analytics");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalAssessments: 10,
        highRisk: 2,
        mediumRisk: 3,
        lowRisk: 5,
      });
    });

    it("returns 500 when storage.getAnalyticsStats throws", async () => {
      const { storage } = await import("../../server/storage");
      (storage.getAnalyticsStats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("DB error")
      );

      const response = await request(app).get("/analytics");
      expect(response.status).toBe(500);
      expect(response.body.message).toBe("api.errors.failedToFetchAnalytics");
    });
  });
});
