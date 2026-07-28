import { describe, it, expect } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  generalLimiter,
  mlLimiter,
  adminLimiter,
  exportLimiter,
  assessmentLimiter,
  previewLimiter,
  batchLimiter,
} from "./rateLimit";

describe("rateLimit middleware exports", () => {
  it("generalLimiter is a function", () => {
    expect(typeof generalLimiter).toBe("function");
  });

  it("mlLimiter is a function", () => {
    expect(typeof mlLimiter).toBe("function");
  });

  it("adminLimiter is a function", () => {
    expect(typeof adminLimiter).toBe("function");
  });

  it("exportLimiter is a function", () => {
    expect(typeof exportLimiter).toBe("function");
  });

  it("assessmentLimiter is a function", () => {
    expect(typeof assessmentLimiter).toBe("function");
  });

  it("previewLimiter is a function", () => {
    expect(typeof previewLimiter).toBe("function");
  });

  it("batchLimiter is a function", () => {
    expect(typeof batchLimiter).toBe("function");
  });

  it("generalLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    generalLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("mlLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    mlLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("adminLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    adminLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("exportLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    exportLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("assessmentLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    assessmentLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("previewLimiter calls next on valid request", (done) => {
    const mockReq = { ip: "127.0.0.1" } as Partial<Request>;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    previewLimiter(mockReq as Request, mockRes, done as NextFunction);
  });

  it("batchLimiter calls next on valid request with session user", (done) => {
    const mockReq = { ip: "127.0.0.1", session: { user: { id: "user-42" } } } as any;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    batchLimiter(mockReq, mockRes, done as NextFunction);
  });

  it("batchLimiter calls next on valid request without session", (done) => {
    const mockReq = { ip: "127.0.0.1" } as any;
    const mockRes = { status: () => ({ json: () => ({}) }) } as any;
    batchLimiter(mockReq, mockRes, done as NextFunction);
  });
});
