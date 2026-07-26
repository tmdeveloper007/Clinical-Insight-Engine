/**
 * tests/exports.routes.test.ts
 *
 * Integration tests for server/routes/exports.routes.ts.
 * Tests GET /export.csv and GET /research.csv endpoints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { createServer } from "http";

// ─── Mock storage ────────────────────────────────────────────────────────────

const mockGetAssessments = vi.hoisted(() => vi.fn());

vi.mock("../server/storage", () => ({
  storage: {
    getAssessments: mockGetAssessments,
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

describe("GET /api/assessments/export.csv", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/export.csv");

    expect(res.status).toBe(401);
  });

  it("returns 200 with text/csv content-type when authenticated", async () => {
    mockGetAssessments.mockResolvedValueOnce({ data: [] });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/export.csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  it("returns 200 with CSV content", async () => {
    mockGetAssessments.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          patientName: "John Doe",
          age: 45,
          gender: "Male",
          bmi: 24.5,
          hba1cLevel: 5.2,
          bloodGlucoseLevel: 95,
          hypertension: false,
          heartDisease: false,
          smokingHistory: "never",
          riskScore: 12.3,
          risk: "LOW",
        },
      ],
    });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/export.csv");

    expect(res.status).toBe(200);
    expect(res.text).toContain("John Doe");
  });

  it("returns 400 when query params fail validation", async () => {
    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app)
      .get("/api/assessments/export.csv")
      .query({ limit: "5000" }); // Exceeds max 1000

    expect(res.status).toBe(400);
  });

  it("returns 500 on storage failure", async () => {
    mockGetAssessments.mockRejectedValueOnce(new Error("Database error"));

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/export.csv");

    expect(res.status).toBe(500);
    // The response message is the sanitized human-readable form
    expect(res.body.message).toBeTruthy();
    expect(typeof res.body.message).toBe("string");
  });

  it("passes user email and query params to getAssessments", async () => {
    mockGetAssessments.mockResolvedValueOnce({ data: [] });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    await request(app)
      .get("/api/assessments/export.csv")
      .query({ riskCategory: "HIGH", limit: "50" });

    expect(mockGetAssessments).toHaveBeenCalledOnce();
    const callArgs = mockGetAssessments.mock.calls[0][0];
    expect(callArgs.createdBy).toBe("test@example.com");
    expect(callArgs.riskCategory).toBe("HIGH");
    expect(callArgs.limit).toBe(50);
  });
});

describe("GET /api/assessments/research.csv", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/research.csv");

    expect(res.status).toBe(401);
  });

  it("returns 200 with CSV content stripped of PHI", async () => {
    mockGetAssessments.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          patientName: "John Doe",
          createdBy: "admin@hospital.org",
          userId: "user-123",
          ownerId: "owner-456",
          clinicalNote: "Patient has diabetes",
          age: 45,
          gender: "Male",
          bmi: 24.5,
          riskScore: 12.3,
          risk: "LOW",
        },
      ],
    });

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/research.csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    // PHI fields should be absent
    expect(res.text).not.toContain("John Doe");
    expect(res.text).not.toContain("admin@hospital.org");
    expect(res.text).not.toContain("Patient has diabetes");
    // Should contain hashed ID
    expect(res.text).toContain("researchId");
    // Should contain non-PHI fields
    expect(res.text).toContain("age");
    expect(res.text).toContain("gender");
  });

  it("returns 500 on storage failure", async () => {
    mockGetAssessments.mockRejectedValueOnce(new Error("DB error"));

    const app = createAuthenticatedApp();
    await registerRoutes(createServer(), app);

    const res = await request(app).get("/api/assessments/research.csv");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("api.errors.failedToExport");
  });
});
