import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendMail } = vi.hoisted(() => {
  return { mockSendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }) };
});

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  users: "users",
  assessments: "assessments",
}));

vi.mock("./email.service", () => ({
  emailService: {
    sendEmail: mockSendMail,
  },
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { reportScheduler } from "./report-scheduler";

describe("reportScheduler", () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  describe("init", () => {
    it("registers daily and weekly cron jobs", async () => {
      const nodeCron = await import("node-cron");
      reportScheduler.init();
      expect(nodeCron.default.schedule).toHaveBeenCalledWith(
        "0 8 * * *",
        expect.any(Function)
      );
      expect(nodeCron.default.schedule).toHaveBeenCalledWith(
        "0 8 * * 1",
        expect.any(Function)
      );
    });
  });

  describe("generateAndSendReports (private, accessed via singleton)", () => {
    it("does not send emails when no users are subscribed", async () => {
      const { getDb } = await import("../db");
      (getDb as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await (reportScheduler as any).generateAndSendReports("daily");
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("sends one email per subscribed user for daily frequency", async () => {
      const { getDb } = await import("../db");
      (getDb as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn()
              .mockResolvedValueOnce([
                { id: "u1", email: "user1@example.com", reportFrequency: "daily" },
                { id: "u2", email: "user2@example.com", reportFrequency: "daily" },
              ])
              .mockResolvedValueOnce([
                { riskCategory: "HIGH" },
                { riskCategory: "LOW" },
              ]),
          }),
        }),
      });

      await (reportScheduler as any).generateAndSendReports("daily");
      expect(mockSendMail).toHaveBeenCalledTimes(2);
    });

    it("sends emails to weekly subscribers only for weekly frequency", async () => {
      const { getDb } = await import("../db");
      (getDb as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn()
              .mockResolvedValueOnce([
                { id: "w1", email: "weekly@example.com", reportFrequency: "weekly" },
              ])
              .mockResolvedValueOnce([]),
          }),
        }),
      });

      await (reportScheduler as any).generateAndSendReports("weekly");
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it("email contains correct daily subject line", async () => {
      const { getDb } = await import("../db");
      (getDb as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn()
              .mockResolvedValueOnce([
                { id: "u1", email: "user@example.com", reportFrequency: "daily" },
              ])
              .mockResolvedValueOnce([{ riskCategory: "LOW" }]),
          }),
        }),
      });

      await (reportScheduler as any).generateAndSendReports("daily");
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@example.com",
          subject: "[Clinical Insight Engine] Daily Summary Report",
        })
      );
    });

    it("email contains correct weekly subject line", async () => {
      const { getDb } = await import("../db");
      (getDb as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn()
              .mockResolvedValueOnce([
                { id: "w1", email: "weekly@example.com", reportFrequency: "weekly" },
              ])
              .mockResolvedValueOnce([{ riskCategory: "MEDIUM" }]),
          }),
        }),
      });

      await (reportScheduler as any).generateAndSendReports("weekly");
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "weekly@example.com",
          subject: "[Clinical Insight Engine] Weekly Summary Report",
        })
      );
    });
  });
});
