/**
 * errorSanitizer.test.ts
 *
 * Unit tests for server/security/errorSanitizer.ts
 * Ensures that internal system details, file paths, IP addresses, and stack traces
 * are never exposed to API clients.
 */

import { describe, expect, it } from "vitest";
import {
  sanitizeErrorMessage,
  getSafeServerErrorMessage,
  getSafeClientErrorMessage,
} from "./errorSanitizer";

describe("sanitizeErrorMessage", () => {
  it("returns defaultMessage when error is null", () => {
    expect(sanitizeErrorMessage(null)).toBe("An error occurred");
    expect(sanitizeErrorMessage(null, "custom")).toBe("custom");
  });

  it("returns defaultMessage when error is undefined", () => {
    expect(sanitizeErrorMessage(undefined)).toBe("An error occurred");
    expect(sanitizeErrorMessage(undefined, "custom")).toBe("custom");
  });

  it("returns defaultMessage for an Error with a stack trace in message", () => {
    const err = new Error("Error at /home/app/server/utils/helper.ts:42");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error with a file path in message", () => {
    const err = new Error("Error at /home/user/app/server/utils/helper.ts:42");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error with a Windows path", () => {
    const err = new Error("Failed at C:\\Users\\dev\\project\\index.ts");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error with an IP address", () => {
    const err = new Error("Connection from 192.168.1.100 failed");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error containing 'internal'", () => {
    const err = new Error("Internal error occurred");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error containing 'system'", () => {
    const err = new Error("System failure detected");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an Error containing 'uncaught'", () => {
    const err = new Error("Uncaught exception in main");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for Error with code ENOENT (resource not found)", () => {
    const err = Object.assign(new Error("file not found"), { code: "ENOENT" });
    expect(sanitizeErrorMessage(err)).toBe("Resource not found");
  });

  it("returns defaultMessage for Error with code EACCES (access denied)", () => {
    const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
    expect(sanitizeErrorMessage(err)).toBe("Access denied");
  });

  it("returns defaultMessage for Error with code ETIMEDOUT", () => {
    const err = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    expect(sanitizeErrorMessage(err)).toBe("Request timed out");
  });

  it("returns defaultMessage for Error with code ECONNREFUSED", () => {
    const err = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    expect(sanitizeErrorMessage(err)).toBe("Service unavailable");
  });

  it("returns defaultMessage for Error with code ECONNRESET", () => {
    const err = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    expect(sanitizeErrorMessage(err)).toBe("Connection reset");
  });

  it("passes through a safe plain string message", () => {
    const msg = "Something went wrong";
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });

  it("passes through a safe plain string message with custom default", () => {
    const msg = "Invalid input provided";
    expect(sanitizeErrorMessage(msg, "custom")).toBe(msg);
  });

  it("returns defaultMessage when plain string contains 'internal'", () => {
    expect(sanitizeErrorMessage("internal server error")).toBe("An error occurred");
  });

  it("passes through an object with a safe .message field", () => {
    const obj = { message: "Record not found", extra: "data" };
    expect(sanitizeErrorMessage(obj)).toBe("Record not found");
  });

  it("returns defaultMessage for object with .code ENOENT even if .message is set", () => {
    const obj = { code: "ENOENT", message: "some internal path /var/data" };
    expect(sanitizeErrorMessage(obj)).toBe("Resource not found");
  });

  it("returns empty string maps to defaultMessage", () => {
    expect(sanitizeErrorMessage("")).toBe("An error occurred");
    expect(sanitizeErrorMessage("")).toBe("An error occurred");
  });

  it("returns defaultMessage when Error has no message", () => {
    const err = new Error();
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("strips database error details from client messages", () => {
    const err = new Error("relation 'patients' does not exist in schema");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("strips credential error details from client messages", () => {
    const err = new Error("database secret validation failed");
    expect(sanitizeErrorMessage(err)).toBe("An error occurred");
  });

  it("returns defaultMessage for an object with no useful info", () => {
    expect(sanitizeErrorMessage({})).toBe("An error occurred");
    expect(sanitizeErrorMessage({ foo: "bar" })).toBe("An error occurred");
  });
});

describe("getSafeServerErrorMessage", () => {
  it("always returns a generic server error message", () => {
    expect(getSafeServerErrorMessage()).toBe("An internal server error occurred");
    expect(getSafeServerErrorMessage(new Error("details"))).toBe("An internal server error occurred");
    expect(getSafeServerErrorMessage(null)).toBe("An internal server error occurred");
  });
});

describe("getSafeClientErrorMessage", () => {
  it("delegates to sanitizeErrorMessage with default", () => {
    const err = Object.assign(new Error("Invalid input"), { code: "ENOENT" });
    expect(getSafeClientErrorMessage(err)).toBe("Resource not found");
  });

  it("returns custom default when error contains internal/system keywords", () => {
    const err = new Error("Internal server error occurred");
    expect(getSafeClientErrorMessage(err, "Bad Request")).toBe("Bad Request");
  });
});
