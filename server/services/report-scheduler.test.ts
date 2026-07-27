import { describe, it, expect, vi, beforeEach } from "vitest";
import cron from "node-cron";

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
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
    sendEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("reportScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("init registers two cron jobs (daily and weekly)", async () => {
    const { reportScheduler } = await import("./report-scheduler");
    reportScheduler.init();
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    expect(cron.schedule).toHaveBeenCalledWith(
      "0 8 * * *",
      expect.any(Function)
    );
    expect(cron.schedule).toHaveBeenCalledWith(
      "0 8 * * 1",
      expect.any(Function)
    );
  });

  it("init does not send emails immediately", async () => {
    const { emailService } = await import("./email.service");
    const { reportScheduler } = await import("./report-scheduler");
    reportScheduler.init();
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it("getReportScheduler is exported", async () => {
    const mod = await import("./report-scheduler");
    expect(mod.reportScheduler).toBeDefined();
    expect(typeof mod.reportScheduler.init).toBe("function");
  });
});
