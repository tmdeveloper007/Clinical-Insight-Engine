import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendEmail, mockSelect } = vi.hoisted(() => {
  const mockSendEmail = vi.fn().mockResolvedValue(undefined);
  const mockFromFn = vi.fn();
  const mockWhereFn = vi.fn();
  const mockSelect = vi.fn(() => ({
    from: mockFromFn.mockReturnValue({
      where: mockWhereFn.mockResolvedValue([]),
    }),
  }));
  return { mockSendEmail, mockSelect };
});

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./email.service", () => ({
  emailService: { sendEmail: mockSendEmail },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({ select: mockSelect })),
}));

// Import after mocks are set up
import { reportScheduler } from "./report-scheduler";

describe("ReportScheduler", () => {
  beforeEach(() => {
    mockSendEmail.mockClear();
    mockSelect.mockClear();
  });

  it("does not send emails when no users are subscribed", async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: vi.fn().mockResolvedValue([]) }),
    });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("daily");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends one email per subscribed user for daily reports", async () => {
    const mockUsers = [
      { id: "1", email: "doc1@hospital.org", reportFrequency: "daily" },
      { id: "2", email: "doc2@hospital.org", reportFrequency: "daily" },
    ];
    const mockAssessments = [
      { id: "a1", riskCategory: "moderate" },
      { id: "a2", riskCategory: "high" },
    ];

    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue(mockUsers) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue(mockAssessments) }),
      });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("daily");

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "doc1@hospital.org" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "doc2@hospital.org" })
    );
  });

  it("sends weekly report with correct subject line", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "3", email: "doc@hospital.org", reportFrequency: "weekly" }]) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([]) }),
      });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("weekly");

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[Clinical Insight Engine] Weekly Summary Report",
      })
    );
  });

  it("includes assessment counts in the email html", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "4", email: "doc@hospital.org", reportFrequency: "daily" }]) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([
          { id: "x1", riskCategory: "high" },
          { id: "x2", riskCategory: "moderate" },
          { id: "x3", riskCategory: "low" },
        ]) }),
      });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("daily");

    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.html).toContain("Total Assessments:");
    expect(emailCall.html).toContain("New High-Risk Patients:");
  });

  it("marks cohort trend as Action Required when >50% high-risk", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "5", email: "doc@hospital.org", reportFrequency: "daily" }]) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([
          { id: "h1", riskCategory: "HIGH" },
          { id: "h2", riskCategory: "HIGH" },
          { id: "h3", riskCategory: "HIGH" },
        ]) }),
      });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("daily");

    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.html).toContain("Action Required");
  });

  it("marks cohort trend as Stable when <=50% high-risk", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "6", email: "doc@hospital.org", reportFrequency: "daily" }]) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([
          { id: "s1", riskCategory: "HIGH" },
          { id: "s2", riskCategory: "moderate" },
        ]) }),
      });

    const scheduler = reportScheduler as any;
    await scheduler.generateAndSendReports("daily");

    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.html).toContain("Stable");
  });

  it("handles null riskCategory without crashing", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "7", email: "doc@hospital.org", reportFrequency: "daily" }]) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: vi.fn().mockResolvedValue([{ id: "n1", riskCategory: null }]) }),
      });

    const scheduler = reportScheduler as any;
    await expect(scheduler.generateAndSendReports("daily")).resolves.not.toThrow();
  });
});
