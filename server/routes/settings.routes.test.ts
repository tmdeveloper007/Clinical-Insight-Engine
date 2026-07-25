import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";

const mockUser = { id: "test-user-id", email: "test@example.com", reportFrequency: "daily" as const };

vi.mock("../../server/auth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: "test-user-id", email: "test@example.com", role: "provider" };
    next();
  },
}));

vi.mock("../../server/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }),
}));

import settingsRouter from "./settings.routes";

describe("settings routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/", settingsRouter);

  describe("GET /", () => {
    it("returns 200 with reportFrequency when user exists", async () => {
      const { getDb } = await import("../../server/db");
      const mockDb = getDb() as ReturnType<typeof getDb>;
      const selectMock = mockDb.select as ReturnType<typeof vi.fn>;
      const fromMock = mockDb.from as ReturnType<typeof vi.fn>;
      const whereMock = mockDb.where as ReturnType<typeof vi.fn>;
      const limitMock = mockDb.limit as ReturnType<typeof vi.fn>;

      selectMock.mockReturnThis();
      fromMock.mockReturnThis();
      whereMock.mockReturnValue([mockUser]);
      limitMock.mockReturnValue([mockUser]);

      const response = await request(app).get("/");
      expect(response.status).toBe(200);
      expect(response.body.reportFrequency).toBe("daily");
    });

    it("returns 404 when user is not found", async () => {
      const { getDb } = await import("../../server/db");
      const mockDb = getDb() as ReturnType<typeof getDb>;
      const selectMock = mockDb.select as ReturnType<typeof vi.fn>;
      const fromMock = mockDb.from as ReturnType<typeof vi.fn>;
      const whereMock = mockDb.where as ReturnType<typeof vi.fn>;
      const limitMock = mockDb.limit as ReturnType<typeof vi.fn>;

      selectMock.mockReturnThis();
      fromMock.mockReturnThis();
      whereMock.mockReturnValue([]);
      limitMock.mockReturnValue([]);

      const response = await request(app).get("/");
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("User not found");
    });
  });

  describe("PATCH /", () => {
    it("returns 200 with updated reportFrequency for valid enum value", async () => {
      const { getDb } = await import("../../server/db");
      const mockDb = getDb() as ReturnType<typeof getDb>;
      const updateMock = mockDb.update as ReturnType<typeof vi.fn>;
      const setMock = mockDb.set as ReturnType<typeof vi.fn>;
      const whereMock = mockDb.where as ReturnType<typeof vi.fn>;
      const returningMock = mockDb.returning as ReturnType<typeof vi.fn>;

      updateMock.mockReturnThis();
      setMock.mockReturnThis();
      whereMock.mockReturnThis();
      returningMock.mockReturnValue([{ ...mockUser, reportFrequency: "weekly" }]);

      const response = await request(app)
        .patch("/")
        .send({ reportFrequency: "weekly" });
      expect(response.status).toBe(200);
      expect(response.body.reportFrequency).toBe("weekly");
    });

    it("returns 400 when reportFrequency is not a valid enum value", async () => {
      const response = await request(app)
        .patch("/")
        .send({ reportFrequency: "monthly" });
      expect(response.status).toBe(400);
    });
  });
});
