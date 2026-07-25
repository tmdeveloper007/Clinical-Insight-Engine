import { describe, it, expect } from "vitest";
import { canAccessPatientRecord } from "./patient-access";
import { ROLES } from "./rbac";

describe("canAccessPatientRecord", () => {
  // Admin user fixture
  const adminUser = { id: "admin-id", email: "admin@hospital.org", role: "ADMIN" as const };

  // Provider/doctor user fixture
  const doctorUser = { id: "doctor-id", email: "dr@hospital.org", role: "DOCTOR" as const };

  // Patient user fixture
  const patientUser = { id: "patient-id", email: "patient@email.org", role: "PATIENT" as const };

  // Assessment fixtures
  const adminAssessment = { createdBy: "other@hospital.org", userId: "other-id", ownerId: "other-id" };
  const doctorAssessment = { createdBy: "dr@hospital.org", userId: "other-id", ownerId: "other-id" };
  const patientAssessment = { createdBy: "other@hospital.org", userId: "patient-id", ownerId: "other-id" };
  const ownerAssessment = { createdBy: "other@hospital.org", userId: "other-id", ownerId: "patient-id" };

  describe("admin access", () => {
    it("grants access to any record for admin users", () => {
      expect(canAccessPatientRecord(adminUser, adminAssessment)).toBe(true);
      expect(canAccessPatientRecord(adminUser, doctorAssessment)).toBe(true);
      expect(canAccessPatientRecord(adminUser, patientAssessment)).toBe(true);
      expect(canAccessPatientRecord(adminUser, { createdBy: "stranger@x.com", userId: "x", ownerId: "x" })).toBe(true);
    });
  });

  describe("ownerId check", () => {
    it("grants access when ownerId matches user id", () => {
      expect(canAccessPatientRecord(patientUser, ownerAssessment)).toBe(true);
    });

    it("denies access when ownerId does not match user id", () => {
      expect(canAccessPatientRecord(doctorUser, ownerAssessment)).toBe(false);
    });
  });

  describe("createdBy check (provider assignment)", () => {
    it("grants access when provider created the record", () => {
      expect(canAccessPatientRecord(doctorUser, doctorAssessment)).toBe(true);
    });

    it("denies access when provider did not create the record", () => {
      expect(canAccessPatientRecord(doctorUser, patientAssessment)).toBe(false);
    });

    it("is case-insensitive when comparing emails", () => {
      const mixedCaseDoctor = { ...doctorUser, email: "DR@Hospital.Org" };
      expect(canAccessPatientRecord(mixedCaseDoctor, doctorAssessment)).toBe(true);
    });
  });

  describe("userId check (patient ownership)", () => {
    it("grants access when userId matches user id", () => {
      expect(canAccessPatientRecord(patientUser, patientAssessment)).toBe(true);
    });

    it("denies access when userId does not match user id", () => {
      expect(canAccessPatientRecord(patientUser, doctorAssessment)).toBe(false);
    });
  });

  describe("default deny", () => {
    it("denies access when no condition is met", () => {
      const strangerUser = { id: "stranger", email: "stranger@x.com", role: "STAFF" as const };
      expect(canAccessPatientRecord(strangerUser, doctorAssessment)).toBe(false);
    });
  });
});
