/**
 * tests/settings.routes.test.ts
 *
 * Integration tests for server/routes/settings.routes.ts.
 * Tests GET / and PATCH / with mocked drizzle ORM.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

// ─── Mock drizzle db ─────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock("../server/db", () => ({
  getDb: () => mockDb,
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
  // Set both req.session.user AND req.user to match real auth flow
  app.use((req, res, next) => {
    req.session.user = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      emailVerified: true,
    };
    (req as any).user = { id: "user-123" };
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

describe("GET /api/settings", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/settings");

    expect(res.status).toBe(401);
  });

  it("returns 200 with reportFrequency when user exists", async () => {
    const mockWhere = vi.fn().mockResolvedValueOnce([
      { id: "user-123", reportFrequency: "daily" },
    ]);
    const mockFrom = vi.fn().mockReturnValueOnce({ where: mockWhere });
    mockDb.select.mockReturnValueOnce({ from: mockFrom });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/settings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reportFrequency: "daily" });
  });

  it("returns 404 when user not found in database", async () => {
    const mockWhere = vi.fn().mockResolvedValueOnce([]);
    const mockFrom = vi.fn().mockReturnValueOnce({ where: mockWhere });
    mockDb.select.mockReturnValueOnce({ from: mockFrom });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/settings");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("returns 500 on database error", async () => {
    const mockWhere = vi.fn().mockRejectedValueOnce(new Error("DB error"));
    const mockFrom = vi.fn().mockReturnValueOnce({ where: mockWhere });
    mockDb.select.mockReturnValueOnce({ from: mockFrom });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/settings");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to get settings");
  });
});

describe("PATCH /api/settings", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .patch("/api/settings")
      .send({ reportFrequency: "daily" });

    expect(res.status).toBe(401);
  });

  it("returns 200 with updated reportFrequency for valid enum values", async () => {
    const mockReturning = vi.fn().mockResolvedValueOnce([
      { id: "user-123", reportFrequency: "weekly" },
    ]);
    const mockWhere = vi.fn().mockReturnValueOnce({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValueOnce({ where: mockWhere });
    mockDb.update.mockReturnValueOnce({ set: mockSet });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .patch("/api/settings")
      .send({ reportFrequency: "weekly" });

    expect(res.status).toBe(200);
    expect(res.body.reportFrequency).toBe("weekly");
  });

  it("returns 400 for invalid reportFrequency values", async () => {
    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .patch("/api/settings")
      .send({ reportFrequency: "monthly" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when reportFrequency is missing", async () => {
    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .patch("/api/settings")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 500 on database error during update", async () => {
    const mockReturning = vi.fn().mockRejectedValueOnce(new Error("DB error"));
    const mockWhere = vi.fn().mockResolvedValueOnce([]);
    const mockSet = vi.fn().mockReturnValueOnce({
      where: mockWhere,
      returning: mockReturning,
    });
    mockDb.update.mockReturnValueOnce({ set: mockSet });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .patch("/api/settings")
      .send({ reportFrequency: "daily" });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to update settings");
  });
});
