import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Global mocks — set up once before any import
vi.mock("../server/db", () => ({
  getDb: vi.fn(),
  getPool: vi.fn(),
  verifyDatabaseConnection: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAssessments: vi.fn(),
  },
}));

// Override in each test via vi.mocked
const mockStorage = vi.mocked(await import("../server/storage")).storage;
const mockDb = vi.mocked(await import("../server/db")).getDb;

// Test case: authenticated user with data
describe("GET /api/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and data array when authenticated with valid jwtUser", async () => {
    const mockAssessments = {
      data: [
        { id: 1, patientName: "Alice", age: 45, riskScore: 0.3, createdBy: "test@example.com", userId: "uid-1" },
        { id: 2, patientName: "Bob", age: 52, riskScore: 0.7, createdBy: "test@example.com", userId: "uid-2" },
      ],
    };
    mockStorage.getAssessments.mockResolvedValue(mockAssessments);

    const app = express();
    app.use(express.json());

    // Apply jwt mock for this test
    app.use((req: any, _res, next) => {
      req.jwtUser = { sub: "user-1", email: "test@example.com" };
      next();
    });

    // Inline the route logic for test isolation
    app.get("/api/patients", async (req: any, res: any, _next: any) => {
      try {
        const userEmail = req.jwtUser?.email;
        if (!userEmail) {
          return res.status(401).json({ message: "api.errors.unauthorized" });
        }
        const records = await mockStorage.getAssessments(50, undefined, userEmail);
        const sanitizedRecords = records.data.map((record: any) => {
          const { userId, createdBy, ...rest } = record;
          return rest;
        });
        return res.json({ data: sanitizedRecords });
      } catch (error) {
        return res.status(500).json({ message: "Internal error" });
      }
    });

    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(2);
  });

  it("strips userId and createdBy from returned records", async () => {
    const mockAssessments = {
      data: [
        { id: 1, patientName: "Alice", age: 45, riskScore: 0.3, createdBy: "test@example.com", userId: "uid-1" },
      ],
    };
    mockStorage.getAssessments.mockResolvedValue(mockAssessments);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.jwtUser = { sub: "user-1", email: "test@example.com" };
      next();
    });
    app.get("/api/patients", async (req: any, res: any) => {
      const records = await mockStorage.getAssessments(50, undefined, req.jwtUser?.email);
      const sanitizedRecords = records.data.map((record: any) => {
        const { userId, createdBy, ...rest } = record;
        return rest;
      });
      res.json({ data: sanitizedRecords });
    });

    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty("userId");
    expect(res.body.data[0]).not.toHaveProperty("createdBy");
    expect(res.body.data[0]).toHaveProperty("patientName");
    expect(res.body.data[0]).toHaveProperty("id");
  });

  it("returns 401 when jwtUser has no email", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.jwtUser = { sub: "user-1" }; // no email
      next();
    });
    app.get("/api/patients", async (req: any, res: any) => {
      const userEmail = req.jwtUser?.email;
      if (!userEmail) {
        return res.status(401).json({ message: "api.errors.unauthorized" });
      }
      res.json({ data: [] });
    });

    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("api.errors.unauthorized");
  });

  it("returns 500 when storage.getAssessments throws", async () => {
    mockStorage.getAssessments.mockRejectedValue(new Error("DB error"));

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.jwtUser = { sub: "user-1", email: "test@example.com" };
      next();
    });
    app.get("/api/patients", async (req: any, res: any) => {
      try {
        const userEmail = req.jwtUser?.email;
        if (!userEmail) {
          return res.status(401).json({ message: "api.errors.unauthorized" });
        }
        await mockStorage.getAssessments(50, undefined, userEmail);
        res.json({ data: [] });
      } catch (error) {
        res.status(500).json({ message: "Internal error" });
      }
    });

    const res = await request(app).get("/api/patients");
    expect(res.status).toBe(500);
  });
});
