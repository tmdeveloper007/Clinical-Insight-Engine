import { describe, expect, test } from "vitest";
import { hasRole, isAdmin, ROLES } from "./rbac";

describe("rbac", () => {
  describe("hasRole", () => {
    test("returns true for matching exact role", () => {
      expect(hasRole({ role: "ADMIN" }, ROLES.ADMIN)).toBe(true);
      expect(hasRole({ role: "DOCTOR" }, ROLES.DOCTOR)).toBe(true);
      expect(hasRole({ role: "CLINICIAN" }, ROLES.CLINICIAN)).toBe(true);
      expect(hasRole({ role: "STAFF" }, ROLES.STAFF)).toBe(true);
      expect(hasRole({ role: "PATIENT" }, ROLES.PATIENT)).toBe(true);
    });

    test("returns true for matching role case-insensitively", () => {
      expect(hasRole({ role: "admin" }, ROLES.ADMIN)).toBe(true);
      expect(hasRole({ role: "Admin" }, ROLES.ADMIN)).toBe(true);
      expect(hasRole({ role: "doctor" }, ROLES.DOCTOR)).toBe(true);
      expect(hasRole({ role: "DoCtoR" }, ROLES.DOCTOR)).toBe(true);
    });

    test("returns false for non-matching role", () => {
      expect(hasRole({ role: "PATIENT" }, ROLES.DOCTOR)).toBe(false);
      expect(hasRole({ role: "STAFF" }, ROLES.ADMIN)).toBe(false);
      expect(hasRole({ role: "ADMIN" }, ROLES.PATIENT)).toBe(false);
    });

    test("maps provider to DOCTOR (legacy support)", () => {
      expect(hasRole({ role: "provider" }, ROLES.DOCTOR)).toBe(true);
      expect(hasRole({ role: "PROVIDER" }, ROLES.DOCTOR)).toBe(true);
      expect(hasRole({ role: "provider" }, ROLES.ADMIN)).toBe(false);
    });

    test("maps DOCTOR to provider (legacy support)", () => {
      expect(hasRole({ role: "DOCTOR" }, ROLES.PROVIDER)).toBe(true);
      expect(hasRole({ role: "doctor" }, ROLES.PROVIDER)).toBe(true);
    });

    test("treats undefined role as PROVIDER and matches DOCTOR target", () => {
      // When user.role is undefined, it defaults to PROVIDER (legacy default)
      // PROVIDER <-> DOCTOR are equivalent, so hasRole returns true
      const userWithUndefined = { role: undefined as any };
      expect(hasRole(userWithUndefined, ROLES.DOCTOR)).toBe(true);
      expect(hasRole(userWithUndefined, ROLES.PROVIDER)).toBe(true);
    });

    test("returns false when role does not match target", () => {
      expect(hasRole({ role: "PATIENT" }, ROLES.PROVIDER)).toBe(false);
    });
  });

  describe("isAdmin", () => {
    test("returns true for ADMIN role", () => {
      expect(isAdmin({ role: "ADMIN" })).toBe(true);
      expect(isAdmin({ role: "admin" })).toBe(true);
    });

    test("returns false for non-ADMIN roles", () => {
      expect(isAdmin({ role: "DOCTOR" })).toBe(false);
      expect(isAdmin({ role: "PATIENT" })).toBe(false);
      expect(isAdmin({ role: "STAFF" })).toBe(false);
    });
  });
});
