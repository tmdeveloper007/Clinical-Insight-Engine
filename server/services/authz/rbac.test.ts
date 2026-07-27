import { describe, it, expect } from "vitest";
import { hasRole, isAdmin, ROLES } from "./rbac";

describe("ROLES", () => {
  it("contains all expected role constants", () => {
    expect(ROLES.ADMIN).toBe("ADMIN");
    expect(ROLES.DOCTOR).toBe("DOCTOR");
    expect(ROLES.CLINICIAN).toBe("CLINICIAN");
    expect(ROLES.STAFF).toBe("STAFF");
    expect(ROLES.PATIENT).toBe("PATIENT");
    expect(ROLES.PROVIDER).toBe("provider");
  });
});

describe("hasRole", () => {
  it("returns true when user role matches target role exactly", () => {
    expect(hasRole({ role: "DOCTOR" }, "DOCTOR" as any)).toBe(true);
    expect(hasRole({ role: "ADMIN" }, "ADMIN" as any)).toBe(true);
    expect(hasRole({ role: "PATIENT" }, "PATIENT" as any)).toBe(true);
  });

  it("returns true for DOCTOR when user has provider role (legacy support)", () => {
    expect(hasRole({ role: "provider" }, "DOCTOR" as any)).toBe(true);
  });

  it("returns true for provider when user has DOCTOR role (legacy support)", () => {
    expect(hasRole({ role: "DOCTOR" }, "provider" as any)).toBe(true);
  });

  it("returns false when user role does not match target role", () => {
    expect(hasRole({ role: "PATIENT" }, "DOCTOR" as any)).toBe(false);
    expect(hasRole({ role: "STAFF" }, "ADMIN" as any)).toBe(false);
  });

  it("treats empty role as PROVIDER (legacy default) which maps to DOCTOR", () => {
    expect(hasRole({ role: "" }, "DOCTOR" as any)).toBe(true);
  });

  it("treats undefined role as PROVIDER (legacy default)", () => {
    expect(hasRole({}, "DOCTOR" as any)).toBe(true);
  });

  it("is case-insensitive for user role", () => {
    expect(hasRole({ role: "doctor" }, "DOCTOR" as any)).toBe(true);
    expect(hasRole({ role: "Admin" }, "ADMIN" as any)).toBe(true);
  });

  it("returns false for unmatched role with case mismatch", () => {
    expect(hasRole({ role: "patient" }, "DOCTOR" as any)).toBe(false);
  });
});

describe("isAdmin", () => {
  it("returns true when user role is ADMIN", () => {
    expect(isAdmin({ role: "ADMIN" })).toBe(true);
  });

  it("returns false when user role is not ADMIN", () => {
    expect(isAdmin({ role: "DOCTOR" })).toBe(false);
    expect(isAdmin({ role: "PATIENT" })).toBe(false);
    expect(isAdmin({ role: "STAFF" })).toBe(false);
  });

  it("returns false when user has no role", () => {
    expect(isAdmin({ role: "" })).toBe(false);
    expect(isAdmin({} as any)).toBe(false);
  });
});
