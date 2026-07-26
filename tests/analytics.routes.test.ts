/**
 * tests/analytics.routes.test.ts
 *
 * Integration tests for server/routes/analytics.routes.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

// ─── Mock storage — vi.hoisted makes mockAvailable during vi.mock hoisting ──

const mockGetAnalyticsStats = vi.hoisted(() => vi.fn());

vi.mock("../server/storage", () => ({
  storage: {
    getAnalyticsStats: mockGetAnalyticsStats,
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAuthenticatedApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.session.user = {
      id: "test-user-id",
      email: "test@example.com",
      name: "Test User",
      emailVerified: true,
    };
    next();
  });
  return app;
}

function createUnauthenticatedApp() {
  const app = express();
  app.use(express.json());
  return app;
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/assessments/analytics", () => {
  it("returns 401 when user is not authenticated", async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/analytics");

    expect(res.status).toBe(401);
  });

  it("returns 200 with stats when authenticated", async () => {
    const mockStats = {
      totalAssessments: 42,
      riskDistribution: { LOW: 20, MODERATE: 15, HIGH: 7 },
    };
    mockGetAnalyticsStats.mockResolvedValueOnce(mockStats);

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/analytics");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockStats);
    expect(mockGetAnalyticsStats).toHaveBeenCalledOnce();
    expect(mockGetAnalyticsStats).toHaveBeenCalledWith("test@example.com");
  });

  it("returns 500 and logs error when storage.getAnalyticsStats throws", async () => {
    mockGetAnalyticsStats.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/analytics");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("api.errors.failedToFetchAnalytics");
  });

  it("passes the authenticated user's email to getAnalyticsStats", async () => {
    mockGetAnalyticsStats.mockResolvedValueOnce({ totalAssessments: 0 });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    await request(app).get("/api/assessments/analytics");

    expect(mockGetAnalyticsStats).toHaveBeenCalledWith("test@example.com");
  });
});
