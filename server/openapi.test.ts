import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express, Request, Response, NextFunction } from "express";

/**
 * server/openapi.test.ts
 *
 * Unit tests for the OpenAPI documentation setup.
 * Tests the openApiDocument generation, CSP headers, and registerOpenApiDocs behavior.
 */

vi.mock("swagger-ui-express", () => ({
  default: { serve: [], setup: vi.fn() },
}));

vi.mock("@asteasolutions/zod-to-openapi", () => ({
  extendZodWithOpenApi: vi.fn(),
  OpenAPIRegistry: vi.fn().mockImplementation(() => ({
    registerComponent: vi.fn(),
    register: vi.fn().mockReturnValue({}),
    registerPath: vi.fn(),
    definitions: {},
  })),
  OpenApiGeneratorV3: vi.fn().mockImplementation(() => ({
    generateDocument: vi.fn().mockReturnValue({
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
    }),
  })),
}));

vi.mock("../validation/auth.dto", () => ({
  loginDTOSchema: {},
}));

vi.mock("../shared/routes", () => ({
  api: {
    assessments: {
      preview: { path: "/api/assessments/preview", method: "post", input: {} },
      list: { path: "/api/assessments", method: "get" },
    },
    auth: {
      login: { path: "/api/auth/login", method: "post" },
      me: { path: "/api/auth/me", method: "get" },
    },
  },
}));

const {
  registerOpenApiDocs,
  openApiDocument,
} = await import("./openapi");

describe("openapi", () => {
  describe("openApiDocument", () => {
    it("generates an OpenAPI 3.0.0 document", () => {
      expect(openApiDocument.openapi).toBe("3.0.0");
    });

    it("includes info object with title and version", () => {
      expect(openApiDocument.info).toBeDefined();
      expect(typeof openApiDocument.info.title).toBe("string");
      expect(typeof openApiDocument.info.version).toBe("string");
    });

    it("includes a paths object (may be empty if api registry not set up)", () => {
      expect(typeof openApiDocument.paths).toBe("object");
    });
  });

  describe("registerOpenApiDocs", () => {
    let mockApp: Express;
    let getRoute: any;
    let postRoute: any;

    beforeEach(() => {
      const routes: Record<string, any[]> = {};
      mockApp = {
        get: vi.fn((path: string, ...handlers: any[]) => {
          routes[`GET ${path}`] = handlers;
        }),
        use: vi.fn((...args: any[]) => {}),
      } as unknown as Express;
      getRoute = (path: string) => routes[`GET ${path}`];
      postRoute = (path: string) => routes[`POST ${path}`];
    });

    it("registers /api-docs/openapi.json route", () => {
      registerOpenApiDocs(mockApp);
      const handlers = (mockApp.get as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: any[]) => call[0] === "/api-docs/openapi.json"
      );
      expect(handlers).toBeDefined();
    });

    it("responds with JSON for /api-docs/openapi.json", async () => {
      let capturedHandler: any;
      const app = {
        get: vi.fn((path: string, ...handlers: any[]) => {
          if (path === "/api-docs/openapi.json") capturedHandler = handlers[0];
        }),
        use: vi.fn(),
      } as unknown as Express;
      registerOpenApiDocs(app);
      const mockReq = {} as Request;
      const mockRes = {
        json: vi.fn(),
      } as unknown as Response;
      const mockNext = vi.fn() as NextFunction;
      await capturedHandler(mockReq, mockRes, mockNext);
      expect(mockRes.json).toHaveBeenCalledWith(openApiDocument);
    });

    it("CSP middleware sets required security headers", () => {
      // Import the swaggerDocsCsp function directly by re-parsing
      // We verify CSP headers are set by checking the app.use handler
      const cspHeaders: string[] = [];
      const app = {
        get: vi.fn(),
        use: (_path: any, ...handlers: any[]) => {
          // Check that a CSP-setting middleware is registered
          if (handlers.length > 0) {
            const mockReq = {};
            const mockRes = {
              setHeader: (name: string, val: string) => {
                if (name === "Content-Security-Policy") cspHeaders.push(val);
              },
            } as unknown as Response;
            const mockNext = vi.fn();
            // Call the middleware if it's a function
            if (typeof handlers[0] === "function") {
              handlers[0](mockReq, mockRes, mockNext);
            }
          }
        },
      } as unknown as Express;
      registerOpenApiDocs(app);
      // CSP headers should be present
      expect(cspHeaders.length).toBeGreaterThan(0);
      expect(cspHeaders[0]).toContain("default-src 'self'");
    });
  });
});
