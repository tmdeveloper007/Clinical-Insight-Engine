import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestContext } from "./logger";
import pino from "pino";
import { Writable } from "stream";

/**
 * server/logger.test.ts
 *
 * Unit tests for the server logger utility.
 * Uses a custom in-memory Writable stream to capture pino log output
 * and verify: PHI field redaction, requestId injection, sanitize behavior.
 * The test logger mirrors server/logger.ts config and proxy behavior.
 */

function makeCaptureStream(): {
  stream: Writable & { records: any[] };
} {
  const records: any[] = [];
  const stream = new Writable({
    objectMode: true,
    write(chunk: any, _enc: any, cb: any) {
      records.push(JSON.parse(chunk.toString()));
      cb();
    },
  }) as Writable & { records: any[] };
  stream.records = records;
  return { stream };
}

function makeTestLogger(stream: Writable & { records: any[] }) {
  const PHI_FIELDS = [
    "patientName", "patient_name", "email", "password", "passwordHash",
    "password_hash", "token", "secret", "ssn", "dob", "phone",
    "diagnosis", "symptoms", "vitals", "lab_results",
  ];
  const baseLogger = pino(
    {
      level: "info",
      redact: {
        paths: PHI_FIELDS.map((f) => `["${f}"]`),
        censor: "[REDACTED]",
      },
    },
    stream as any
  );
  const proxied = new Proxy(baseLogger, {
    get(target, prop, receiver) {
      const orig = target[prop as keyof typeof target];
      if (typeof orig === "function") {
        return function (...args: any[]) {
          const reqId = requestContext.getStore();
          if (reqId) {
            if (typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
              args[0] = { requestId: reqId, ...args[0] };
            } else {
              args.unshift({ requestId: reqId });
            }
          }
          // Sanitize sensitive keys
          for (let i = 0; i < args.length; i++) {
            if (typeof args[i] === "object" && args[i] !== null) {
              for (const key of Object.keys(args[i] as object)) {
                const lower = key.toLowerCase();
                if (
                  lower.includes("auth") ||
                  lower.includes("cookie") ||
                  lower.includes("token") ||
                  lower.includes("secret") ||
                  lower.includes("password") ||
                  lower.includes("session")
                ) {
                  (args[i] as any)[key] = "[REDACTED]";
                }
              }
            }
          }
          return (orig as Function).apply(target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  // Override the internal write to capture output
  (proxied as any).write = (obj: any) => stream.write(obj + "\n");
  return proxied;
}

describe("logger", () => {
  const PHI_FIELDS = [
    "patientName", "patient_name", "email", "password", "passwordHash",
    "password_hash", "token", "secret", "ssn", "dob", "phone",
    "diagnosis", "symptoms", "vitals", "lab_results",
  ];

  describe("PHI field redaction via pino redact config", () => {
    for (const field of PHI_FIELDS) {
      it(`redacts PHI field "${field}"`, () => {
        const testValue = field === "email" ? "patient@example.com" : "sensitive-value";
        const { stream } = makeCaptureStream();
        const log = pino(
          {
            level: "info",
            redact: {
              paths: PHI_FIELDS.map((f) => `["${f}"]`),
              censor: "[REDACTED]",
            },
          },
          stream as any
        );
        log.info({ [field]: testValue, status: "ok" }, "test");
        stream.end();
        const rec = stream.records[0];
        expect(rec[field]).toBe("[REDACTED]");
        expect(rec.status).toBe("ok");
      });
    }
  });

  describe("requestId injection via AsyncLocalStorage", () => {
    it("injects requestId when store is set", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      const fakeRequestId = "req-123-abc";
      requestContext.run(fakeRequestId, () => {
        log.info({ msg: "test message" });
      });
      stream.end();
      const rec = stream.records[0];
      expect(rec.requestId).toBe(fakeRequestId);
      expect(rec.msg).toBe("test message");
    });

    it("omits requestId when store is not set", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      log.info({ msg: "test message" });
      stream.end();
      const rec = stream.records[0];
      expect(rec.requestId).toBeUndefined();
      expect(rec.msg).toBe("test message");
    });

    it("prepends requestId when first arg is a non-object", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      const fakeRequestId = "req-456";
      requestContext.run(fakeRequestId, () => {
        log.info("plain string message");
      });
      stream.end();
      const rec = stream.records[0];
      expect(rec.requestId).toBe(fakeRequestId);
    });

    it("merges requestId without overwriting other fields", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      const fakeRequestId = "req-789";
      requestContext.run(fakeRequestId, () => {
        log.info({ msg: "test", level: "info" });
      });
      stream.end();
      const rec = stream.records[0];
      expect(rec.requestId).toBe(fakeRequestId);
      expect(rec.msg).toBe("test");
      expect(rec.level).toBe("info");
    });
  });

  describe("sanitizeSensitiveData proxy trap", () => {
    it("redacts passwordHash in plain objects", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      log.info({ passwordHash: "secret123", status: "ok" }, "test");
      stream.end();
      const rec = stream.records[0];
      expect(rec.passwordHash).toBe("[REDACTED]");
      expect(rec.status).toBe("ok");
    });

    it("redacts session-related keys", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      // Proxy sanitization covers top-level keys; nested PHI relies on pino redact.
      log.info({ sessionToken: "tok123", name: "Alice" }, "test");
      stream.end();
      const rec = stream.records[0];
      expect(rec.sessionToken).toBe("[REDACTED]");
      expect(rec.name).toBe("Alice");
    });

    it("handles arrays without crashing", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      expect(() => log.info({ items: ["a", "b", "c"] }, "test")).not.toThrow();
      stream.end();
    });

    it("handles Error objects without crashing", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      expect(() => {
        const err = new Error("something went wrong");
        log.error({ err }, "error occurred");
      }).not.toThrow();
      stream.end();
    });

    it("handles null without crashing", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      expect(() => (log.info as Function)(null)).not.toThrow();
      stream.end();
    });

    it("handles primitive string without crashing", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      expect(() => (log.info as Function)("just a string")).not.toThrow();
      stream.end();
    });

    it("handles number without crashing", () => {
      const { stream } = makeCaptureStream();
      const log = makeTestLogger(stream);
      expect(() => (log.info as Function)(42)).not.toThrow();
      stream.end();
    });
  });
});
