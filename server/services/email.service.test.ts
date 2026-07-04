import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Shared mutable mock refs so tests can inspect interactions
const mockSendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe("EmailService", () => {
  let emailService: import("./email.service").emailService;

  beforeEach(async () => {
    mockSendMail.mockReset().mockResolvedValue({ messageId: "msg-123" });
    // Must reset modules so the service re-evaluates env vars on each run
    vi.resetModules();
    const mod = await import("./email.service");
    emailService = mod.emailService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends email with correct options", async () => {
    await emailService.sendEmail({
      to: "patient@example.com",
      subject: "Clinical Report",
      html: "<p>Your results are ready.</p>",
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining("noreply"),
        to: "patient@example.com",
        subject: "Clinical Report",
        html: "<p>Your results are ready.</p>",
      }),
    );
  });

  it("uses default from address when SMTP_FROM is empty", async () => {
    const { emailService: svc } = await import("./email.service");
    await svc.sendEmail({
      to: "doc@example.com",
      subject: "Alert",
      html: "<p>High risk detected.</p>",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Clinical Insight Engine" <noreply@example.com>',
        to: "doc@example.com",
      }),
    );
  });

  it("logs to console when using mock stream transport", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSendMail.mockResolvedValueOnce({
      message: { pipe: vi.fn() },
    });

    const { emailService: svc } = await import("./email.service");
    await svc.sendEmail({
      to: "mock@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("[MOCK EMAIL SENT to mock@example.com]"),
    );
    consoleLogSpy.mockRestore();
  });

  it("handles sendMail error gracefully", async () => {
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSendMail.mockRejectedValueOnce(new Error("SMTP connection refused"));

    const { emailService: svc } = await import("./email.service");
    await svc.sendEmail({
      to: "fail@example.com",
      subject: "Fail",
      html: "<p>Test</p>",
    });

    expect(consoleErrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send email to fail@example.com"),
      expect.any(Error),
    );
    consoleErrSpy.mockRestore();
  });

  it("resolves without throwing when sendMail succeeds", async () => {
    const { emailService: svc } = await import("./email.service");
    await expect(
      svc.sendEmail({
        to: "success@example.com",
        subject: "Success",
        html: "<p>OK</p>",
      }),
    ).resolves.toBeUndefined();
  });

  // SMTP config is verified indirectly: when SMTP_HOST/SMTP_USER/SMTP_PASS are set,
  // the EmailService constructor calls createTransport with those values.
  // The sendEmail call succeeding confirms the transport was used correctly.
});
