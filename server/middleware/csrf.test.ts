import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { requireCsrfToken } from "./csrf";
import crypto from "crypto";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  return app;
}

function makeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function makeCookie(token: string): string {
  return `csrf-token=${token}; Max-Age=86400; Path=/; SameSite=Strict`;
}

describe("requireCsrfToken", () => {
  it("allows GET requests through without token check", async () => {
    const app = makeApp();
    app.get("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("allows HEAD requests through", async () => {
    const app = makeApp();
    app.head("/test", requireCsrfToken, (req: any, res: any) => res.status(200).end());
    const res = await request(app).head("/test");
    expect(res.status).toBe(200);
  });

  it("allows OPTIONS requests through without token check", async () => {
    const app = makeApp();
    app.options("/test", requireCsrfToken, (req: any, res: any) => res.status(204).end());
    const res = await request(app).options("/test");
    expect(res.status).toBe(204);
  });

  it("returns 403 on POST without any tokens", async () => {
    const app = makeApp();
    app.post("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const res = await request(app).post("/test").send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF token missing");
  });

  it("returns 403 on POST with cookie but no header token", async () => {
    const app = makeApp();
    app.post("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const token = makeToken();
    const res = await request(app)
      .post("/test")
      .set("Cookie", makeCookie(token))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF token missing");
  });

  it("returns 403 when cookie and header tokens do not match", async () => {
    const app = makeApp();
    app.post("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const token = makeToken();
    const wrongToken = makeToken();
    const res = await request(app)
      .post("/test")
      .set("Cookie", makeCookie(token))
      .set("x-csrf-token", wrongToken)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF token mismatch");
  });

  it("allows POST when cookie and header tokens match", async () => {
    const app = makeApp();
    app.post("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const token = makeToken();
    const res = await request(app)
      .post("/test")
      .set("Cookie", makeCookie(token))
      .set("x-csrf-token", token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("allows POST with x-api-key header regardless of CSRF tokens", async () => {
    const app = makeApp();
    app.post("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const res = await request(app)
      .post("/test")
      .set("x-api-key", "my-secret-key")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("allows DELETE with matching tokens", async () => {
    const app = makeApp();
    app.delete("/test", requireCsrfToken, (req: any, res: any) => res.json({ deleted: true }));
    const token = makeToken();
    const res = await request(app)
      .delete("/test")
      .set("Cookie", makeCookie(token))
      .set("x-csrf-token", token)
      .send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it("returns 403 on PUT without tokens", async () => {
    const app = makeApp();
    app.put("/test", requireCsrfToken, (req: any, res: any) => res.json({ ok: true }));
    const res = await request(app).put("/test").send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF token missing");
  });

  it("allows PUT with matching tokens", async () => {
    const app = makeApp();
    app.put("/test", requireCsrfToken, (req: any, res: any) => res.json({ updated: true }));
    const token = makeToken();
    const res = await request(app)
      .put("/test")
      .set("Cookie", makeCookie(token))
      .set("x-csrf-token", token)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: true });
  });
});
