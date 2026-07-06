import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectSqlInjectionPattern,
  VALID_RISK_CATEGORIES,
  searchQuerySchema,
  assessmentsQuerySchema,
  cohortQuerySchema,
  assessmentExportQuerySchema,
} from "./searchValidation";

describe("searchValidation", () => {
  describe("VALID_RISK_CATEGORIES", () => {
    it("contains expected values", () => {
      expect(VALID_RISK_CATEGORIES).toEqual(["LOW", "MODERATE", "HIGH"]);
    });
  });

  describe("detectSqlInjectionPattern", () => {
    it("returns null for safe input", () => {
      expect(detectSqlInjectionPattern("John Doe")).toBeNull();
      expect(detectSqlInjectionPattern("patient name")).toBeNull();
      expect(detectSqlInjectionPattern("diabetes assessment")).toBeNull();
      expect(detectSqlInjectionPattern("hba1c level")).toBeNull();
      expect(detectSqlInjectionPattern("risk score")).toBeNull();
      expect(detectSqlInjectionPattern("")).toBeNull();
    });

    it("detects OR 1=1 pattern", () => {
      const result = detectSqlInjectionPattern("' OR '1'='1");
      expect(result).not.toBeNull();
    });

    it("detects UNION SELECT pattern", () => {
      const result = detectSqlInjectionPattern("1 UNION SELECT password FROM users");
      expect(result).not.toBeNull();
    });

    it("detects DROP TABLE pattern", () => {
      const result = detectSqlInjectionPattern("'; DROP TABLE users; --");
      expect(result).not.toBeNull();
    });

    it("detects SQL comment pattern", () => {
      const result = detectSqlInjectionPattern("name -- comment");
      expect(result).not.toBeNull();
    });

    it("detects block comment pattern", () => {
      const result = detectSqlInjectionPattern("name/* comment */test");
      expect(result).not.toBeNull();
    });

    it("detects xp_ stored procedure pattern", () => {
      const result = detectSqlInjectionPattern("xp_cmdshell");
      expect(result).not.toBeNull();
    });

    it("detects INFORMATION_SCHEMA pattern", () => {
      const result = detectSqlInjectionPattern("UNION SELECT NULL FROM INFORMATION_SCHEMA.tables");
      expect(result).not.toBeNull();
    });

    it("detects SLEEP time-based injection", () => {
      const result = detectSqlInjectionPattern("1 AND SLEEP(5)");
      expect(result).not.toBeNull();
    });

    it("detects BENCHMARK injection", () => {
      const result = detectSqlInjectionPattern("1 AND BENCHMARK(1000000,SHA1('test'))");
      expect(result).not.toBeNull();
    });

    it("detects EXEC pattern", () => {
      // Pattern requires EXEC followed by open parenthesis
      const result = detectSqlInjectionPattern("EXEC(sp_executesql)");
      expect(result).not.toBeNull();
    });

    it("returns pattern description string when detected", () => {
      const result = detectSqlInjectionPattern("'; DROP TABLE assessments; --");
      expect(typeof result).toBe("string");
    });
  });

  describe("searchQuerySchema", () => {
    it("accepts empty object", () => {
      const result = searchQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.q).toBe("");
      }
    });

    it("accepts valid search query", () => {
      const result = searchQuerySchema.safeParse({ q: "diabetes" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe("diabetes");
      }
    });

    it("rejects query exceeding max length", () => {
      const result = searchQuerySchema.safeParse({ q: "a".repeat(201) });
      expect(result.success).toBe(false);
    });

    it("rejects query with invalid characters", () => {
      const result = searchQuerySchema.safeParse({ q: "diabetes<script>" });
      expect(result.success).toBe(false);
    });

    it("accepts valid risk category", () => {
      const result = searchQuerySchema.safeParse({ riskCategory: "HIGH" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid risk category", () => {
      const result = searchQuerySchema.safeParse({ riskCategory: "UNKNOWN" });
      expect(result.success).toBe(false);
    });

    it("accepts valid pagination params", () => {
      const result = searchQuerySchema.safeParse({ cursor: 10, limit: 50 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBe(10);
        expect(result.data.limit).toBe(50);
      }
    });

    it("rejects negative cursor", () => {
      const result = searchQuerySchema.safeParse({ cursor: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects limit exceeding 100", () => {
      const result = searchQuerySchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });

    it("rejects SQL injection in search query", () => {
      const result = searchQuerySchema.safeParse({ q: "'; DROP TABLE users;--" });
      expect(result.success).toBe(false);
    });

    it("trims whitespace from query", () => {
      const result = searchQuerySchema.safeParse({ q: "  diabetes  " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe("diabetes");
      }
    });

    it("accepts apostrophe in query (O'Brien style)", () => {
      const result = searchQuerySchema.safeParse({ q: "O'Brien" });
      expect(result.success).toBe(true);
    });
  });

  describe("assessmentsQuerySchema", () => {
    it("accepts empty object with defaults", () => {
      const result = assessmentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(50);
        expect(result.data.sortBy).toBe("createdAt");
        expect(result.data.order).toBe("desc");
      }
    });

    it("accepts valid risk category", () => {
      const result = assessmentsQuerySchema.safeParse({ riskCategory: "LOW" });
      expect(result.success).toBe(true);
    });

    it("accepts ALL risk category", () => {
      const result = assessmentsQuerySchema.safeParse({ riskCategory: "ALL" });
      expect(result.success).toBe(true);
    });

    it("normalizes gender to title case", () => {
      const male = assessmentsQuerySchema.safeParse({ gender: "male" });
      const female = assessmentsQuerySchema.safeParse({ gender: "female" });
      const other = assessmentsQuerySchema.safeParse({ gender: "other" });
      const all = assessmentsQuerySchema.safeParse({ gender: "all" });

      expect(male.success && male.data.gender).toBe("Male");
      expect(female.success && female.data.gender).toBe("Female");
      expect(other.success && other.data.gender).toBe("Other");
      expect(all.success && all.data.gender).toBe("All");
    });

    it("accepts valid age range", () => {
      const result = assessmentsQuerySchema.safeParse({ minAge: 18, maxAge: 65 });
      expect(result.success).toBe(true);
    });

    it("rejects age out of range", () => {
      const under = assessmentsQuerySchema.safeParse({ minAge: -1 });
      const over = assessmentsQuerySchema.safeParse({ maxAge: 150 });
      expect(under.success).toBe(false);
      expect(over.success).toBe(false);
    });

    it("accepts valid sortBy values", () => {
      const validValues = ["createdAt", "date", "riskScore", "risk", "age", "bmi", "patientName", "gender"];
      for (const val of validValues) {
        const result = assessmentsQuerySchema.safeParse({ sortBy: val });
        expect(result.success).toBe(true);
      }
    });

    it("accepts valid date range", () => {
      const result = assessmentsQuerySchema.safeParse({ startDate: "2024-01-01", endDate: "2024-12-31" });
      expect(result.success).toBe(true);
    });

    it("rejects ambiguous date format MM/DD/YYYY", () => {
      const result = assessmentsQuerySchema.safeParse({ startDate: "01/15/2024" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid gender value", () => {
      const result = assessmentsQuerySchema.safeParse({ gender: "unknown" });
      expect(result.success).toBe(false);
    });
  });

  describe("assessmentExportQuerySchema", () => {
    it("extends assessmentsQuerySchema with higher limit", () => {
      const result = assessmentExportQuerySchema.safeParse({ limit: 500 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(500);
      }
    });

    it("rejects limit exceeding 1000 for export", () => {
      const result = assessmentExportQuerySchema.safeParse({ limit: 2000 });
      expect(result.success).toBe(false);
    });

    it("accepts all valid assessment query options", () => {
      const result = assessmentExportQuerySchema.safeParse({
        riskCategory: "HIGH",
        sortBy: "riskScore",
        order: "asc",
        minAge: 30,
        maxAge: 70,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("cohortQuerySchema", () => {
    it("accepts empty object", () => {
      const result = cohortQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid age range", () => {
      const result = cohortQuerySchema.safeParse({ minAge: 25, maxAge: 60 });
      expect(result.success).toBe(true);
    });

    it("accepts valid BMI range", () => {
      const result = cohortQuerySchema.safeParse({ minBmi: 18, maxBmi: 35 });
      expect(result.success).toBe(true);
    });

    it("accepts valid HbA1c range", () => {
      const result = cohortQuerySchema.safeParse({ minHba1c: 4.0, maxHba1c: 14.0 });
      expect(result.success).toBe(true);
    });

    it("accepts valid glucose range", () => {
      const result = cohortQuerySchema.safeParse({ minGlucose: 70, maxGlucose: 200 });
      expect(result.success).toBe(true);
    });

    it("normalizes gender to title case", () => {
      const male = cohortQuerySchema.safeParse({ gender: "male" });
      const female = cohortQuerySchema.safeParse({ gender: "female" });
      expect(male.success && male.data.gender).toBe("Male");
      expect(female.success && female.data.gender).toBe("Female");
    });

    it("accepts valid smoking history", () => {
      const values = ["Never", "Former", "Current"];
      for (const val of values) {
        const result = cohortQuerySchema.safeParse({ smokingHistory: val });
        expect(result.success).toBe(true);
      }
    });

    it("accepts boolean hypertension and heartDisease", () => {
      const result = cohortQuerySchema.safeParse({ hypertension: true, heartDisease: false });
      expect(result.success).toBe(true);
    });

    it("accepts valid risk category", () => {
      const result = cohortQuerySchema.safeParse({ riskCategory: "MODERATE" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid risk category", () => {
      const result = cohortQuerySchema.safeParse({ riskCategory: "UNKNOWN" });
      expect(result.success).toBe(false);
    });

    it("rejects age below 0", () => {
      const result = cohortQuerySchema.safeParse({ minAge: -5 });
      expect(result.success).toBe(false);
    });

    it("rejects age above 120", () => {
      const result = cohortQuerySchema.safeParse({ maxAge: 200 });
      expect(result.success).toBe(false);
    });

    it("rejects BMI below 10", () => {
      const result = cohortQuerySchema.safeParse({ minBmi: 5 });
      expect(result.success).toBe(false);
    });

    it("rejects HbA1c above 20", () => {
      const result = cohortQuerySchema.safeParse({ maxHba1c: 25 });
      expect(result.success).toBe(false);
    });

    it("accepts ISO date range", () => {
      const result = cohortQuerySchema.safeParse({ startDate: "2024-01-01", endDate: "2024-12-31" });
      expect(result.success).toBe(true);
    });

    it("rejects ambiguous non-ISO date format", () => {
      // MM/DD/YYYY is ambiguous (01 could be Jan 1 or Jan 1) — not accepted
      const result = cohortQuerySchema.safeParse({ startDate: "01/01/2024" });
      expect(result.success).toBe(false);
    });
  });
});
