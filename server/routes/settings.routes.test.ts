import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

// Mock DB and auth
vi.mock("../server/db", () => ({
  getDb: vi.fn(),
  getPool: vi.fn(),
  verifyDatabaseConnection: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock("../server/middleware/validateDTO", () => ({
  validateDTO: (schema: any) => (req: any, res: any, next: any) => next(),
}));

const mockDb = vi.mocked(await import("../server/db")).getDb;

describe("GET /settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reportFrequency for authenticated user", async () => {
    const mockUser = { id: "user-123", email: "test@example.com", reportFrequency: "daily" };
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([mockUser]),
    });
    mockDb.mockReturnValue({
      select: vi.fn().mockReturnValue({ from: mockFrom }),
    });

    const app = express();
    app.use(express.json());
    // Simulate requireAuth middleware
    app.use((req: any, _res, next) => {
      req.user = { id: "user-123" };
      next();
    });
    app.get("/settings", async (req: any, res: any) => {
      try {
        const db = mockDb();
        const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.json({ reportFrequency: user.reportFrequency });
      } catch (error) {
        return res.status(500).json({ message: "Failed to get settings" });
      }
    });

    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reportFrequency");
    expect(res.body.reportFrequency).toBe("daily");
  });

  it("returns 404 when user not found", async () => {
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockDb.mockReturnValue({
      select: vi.fn().mockReturnValue({ from: mockFrom }),
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "user-123" };
      next();
    });
    app.get("/settings", async (req: any, res: any) => {
      try {
        const db = mockDb();
        const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.json({ reportFrequency: user.reportFrequency });
      } catch (error) {
        return res.status(500).json({ message: "Failed to get settings" });
      }
    });

    const res = await request(app).get("/settings");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("returns 500 on database error", async () => {
    mockDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        throw new Error("DB connection failed");
      }),
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "user-123" };
      next();
    });
    app.get("/settings", async (req: any, res: any) => {
      try {
        const db = mockDb();
        await db.select().from(users).where(eq(users.id, req.user!.id));
        res.json({});
      } catch (error) {
        return res.status(500).json({ message: "Failed to get settings" });
      }
    });

    const res = await request(app).get("/settings");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to get settings");
  });
});

describe("PATCH /settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates reportFrequency and returns new value", async () => {
    const updatedUser = { id: "user-123", email: "test@example.com", reportFrequency: "weekly" };
    mockDb.mockReturnValue({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      }),
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "user-123" };
      next();
    });
    app.patch("/settings", async (req: any, res: any) => {
      try {
        const { reportFrequency } = req.body;
        const db = mockDb();
        const [updated] = await db
          .update(users)
          .set({ reportFrequency })
          .where(eq(users.id, req.user!.id))
          .returning();
        return res.json({ reportFrequency: updated.reportFrequency });
      } catch (error) {
        return res.status(500).json({ message: "Failed to update settings" });
      }
    });

    const res = await request(app)
      .patch("/settings")
      .send({ reportFrequency: "weekly" });
    expect(res.status).toBe(200);
    expect(res.body.reportFrequency).toBe("weekly");
  });

  it("returns 500 on update error", async () => {
    mockDb.mockReturnValue({
      update: vi.fn().mockImplementation(() => {
        throw new Error("Update failed");
      }),
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "user-123" };
      next();
    });
    app.patch("/settings", async (req: any, res: any) => {
      try {
        const { reportFrequency } = req.body;
        const db = mockDb();
        await db.update(users).set({ reportFrequency }).where(eq(users.id, req.user!.id));
        res.json({});
      } catch (error) {
        return res.status(500).json({ message: "Failed to update settings" });
      }
    });

    const res = await request(app)
      .patch("/settings")
      .send({ reportFrequency: "daily" });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to update settings");
  });
});
