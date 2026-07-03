import { describe, test, expect } from "vitest";
import {
  searchQuerySchema,
  assessmentsQuerySchema,
  assessmentExportQuerySchema,
  cohortQuerySchema,
  detectSqlInjectionPattern,
  VALID_RISK_CATEGORIES,
} from "./searchValidation";

describe("searchValidation", () => {
  describe("detectSqlInjectionPattern", () => {
    test("returns null for safe alphanumeric search terms", () => {
      expect(detectSqlInjectionPattern("John Doe")).toBeNull();
      expect(detectSqlInjectionPattern("diabetes patient")).toBeNull();
      expect(detectSqlInjectionPattern("HbA1c")).toBeNull();
    });

    test("detects OR 1=1 pattern", () => {
      expect(detectSqlInjectionPattern("' OR '1'='1")).not.toBeNull();
      expect(detectSqlInjectionPattern("OR 1=1")).not.toBeNull();
    });

    test("detects UNION SELECT pattern", () => {
      expect(detectSqlInjectionPattern("UNION SELECT * FROM users")).not.toBeNull();
      expect(detectSqlInjectionPattern("UNION ALL SELECT")).not.toBeNull();
    });

    test("detects SQL comment patterns", () => {
      expect(detectSqlInjectionPattern("name --")).not.toBeNull();
      expect(detectSqlInjectionPattern("/* block comment */")).not.toBeNull();
    });

    test("detects DROP/DELETE/INSERT statements", () => {
      expect(detectSqlInjectionPattern("; DROP TABLE users")).not.toBeNull();
      expect(detectSqlInjectionPattern("'; DELETE FROM assessments")).not.toBeNull();
    });

    test("detects xp_ stored procedures", () => {
      expect(detectSqlInjectionPattern("EXEC xp_cmdshell")).not.toBeNull();
      expect(detectSqlInjectionPattern("xp_cmdshell")).not.toBeNull();
    });

    test("detects INFORMATION_SCHEMA enumeration", () => {
      expect(detectSqlInjectionPattern("INFORMATION_SCHEMA.TABLES")).not.toBeNull();
    });

    test("detects time-based injection patterns", () => {
      expect(detectSqlInjectionPattern("SLEEP(5)")).not.toBeNull();
      expect(detectSqlInjectionPattern("WAITFOR DELAY '00:00:05'")).not.toBeNull();
      expect(detectSqlInjectionPattern("BENCHMARK(1000000,SHA1('test'))")).not.toBeNull();
    });

    test("detects file operations", () => {
      expect(detectSqlInjectionPattern("LOAD_FILE('/etc/passwd')")).not.toBeNull();
      expect(detectSqlInjectionPattern("INTO OUTFILE '/tmp/data'")).not.toBeNull();
    });

    test("accepts hyphenated words and medical terms", () => {
      expect(detectSqlInjectionPattern("HbA1c-level")).toBeNull();
      expect(detectSqlInjectionPattern("blood-glucose")).toBeNull();
      expect(detectSqlInjectionPattern("O'Brien")).toBeNull();
      expect(detectSqlInjectionPattern("Jr., M.D.")).toBeNull();
    });
  });

  describe("searchQuerySchema", () => {
    test("accepts empty and undefined query", () => {
      const result = searchQuerySchema.parse({});
      expect(result.q).toBe("");
      expect(result.limit).toBe(20);
    });

    test("accepts valid search term", () => {
      const result = searchQuerySchema.parse({ q: "diabetes mellitus" });
      expect(result.q).toBe("diabetes mellitus");
    });

    test("trims whitespace from search term", () => {
      const result = searchQuerySchema.parse({ q: "  diabetes  " });
      expect(result.q).toBe("diabetes");
    });

    test("rejects search term exceeding 200 characters", () => {
      const longQuery = "a".repeat(201);
      expect(() => searchQuerySchema.parse({ q: longQuery })).toThrow();
    });

    test("rejects search term with disallowed characters", () => {
      expect(() => searchQuerySchema.parse({ q: "diabetes<script>alert(1)</script>" })).toThrow();
      expect(() => searchQuerySchema.parse({ q: "name@domain.com" })).toThrow();
      expect(() => searchQuerySchema.parse({ q: "query; DROP TABLE" })).toThrow();
    });

    test("accepts valid risk categories", () => {
      for (const category of VALID_RISK_CATEGORIES) {
        const result = searchQuerySchema.parse({ riskCategory: category });
        expect(result.riskCategory).toBe(category);
      }
    });

    test("rejects invalid risk category", () => {
      expect(() => searchQuerySchema.parse({ riskCategory: "CRITICAL" })).toThrow();
    });

    test("accepts valid pagination parameters", () => {
      const result = searchQuerySchema.parse({ cursor: "10", limit: "50" });
      expect(result.cursor).toBe(10);
      expect(result.limit).toBe(50);
    });

    test("uses default limit when not provided", () => {
      const result = searchQuerySchema.parse({});
      expect(result.limit).toBe(20);
    });

    test("rejects limit exceeding 100", () => {
      expect(() => searchQuerySchema.parse({ limit: "101" })).toThrow();
    });

    test("rejects cursor less than 1", () => {
      expect(() => searchQuerySchema.parse({ cursor: "0" })).toThrow();
      expect(() => searchQuerySchema.parse({ cursor: "-1" })).toThrow();
    });

    test("rejects search term with SQL injection pattern", () => {
      expect(() => searchQuerySchema.parse({ q: "' OR '1'='1" })).toThrow();
      expect(() => searchQuerySchema.parse({ q: "UNION SELECT password FROM users" })).toThrow();
    });
  });

  describe("assessmentsQuerySchema", () => {
    test("accepts empty query with defaults", () => {
      const result = assessmentsQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe("createdAt");
      expect(result.order).toBe("desc");
    });

    test("accepts valid searchTerm", () => {
      const result = assessmentsQuerySchema.parse({ searchTerm: "diabetes" });
      expect(result.searchTerm).toBe("diabetes");
    });

    test("rejects searchTerm exceeding 200 characters", () => {
      const long = "a".repeat(201);
      expect(() => assessmentsQuerySchema.parse({ searchTerm: long })).toThrow();
    });

    test("accepts valid gender values", () => {
      const male = assessmentsQuerySchema.parse({ gender: "male" });
      expect(male.gender).toBe("Male");
      const female = assessmentsQuerySchema.parse({ gender: "female" });
      expect(female.gender).toBe("Female");
      const other = assessmentsQuerySchema.parse({ gender: "other" });
      expect(other.gender).toBe("Other");
      const all = assessmentsQuerySchema.parse({ gender: "all" });
      expect(all.gender).toBe("All");
    });

    test("rejects invalid gender value", () => {
      expect(() => assessmentsQuerySchema.parse({ gender: "unknown" })).toThrow();
    });

    test("accepts valid age range", () => {
      const result = assessmentsQuerySchema.parse({ minAge: "18", maxAge: "65" });
      expect(result.minAge).toBe(18);
      expect(result.maxAge).toBe(65);
    });

    test("rejects minAge below 0", () => {
      expect(() => assessmentsQuerySchema.parse({ minAge: "-5" })).toThrow();
    });

    test("accepts valid ISO 8601 date for startDate", () => {
      const result = assessmentsQuerySchema.parse({ startDate: "2024-01-15" });
      expect(result.startDate).toBe("2024-01-15");
    });

    test("rejects ambiguous date format", () => {
      expect(() => assessmentsQuerySchema.parse({ startDate: "01/15/2024" })).toThrow();
      expect(() => assessmentsQuerySchema.parse({ startDate: "15-01-2024" })).toThrow();
    });

    test("accepts valid sortBy and order", () => {
      const result = assessmentsQuerySchema.parse({ sortBy: "riskScore", order: "asc" });
      expect(result.sortBy).toBe("riskScore");
      expect(result.order).toBe("asc");
    });

    test("accepts valid riskCategory transformation", () => {
      const result = assessmentsQuerySchema.parse({ riskCategory: "moderate" });
      expect(result.riskCategory).toBe("MODERATE");
    });
  });

  describe("assessmentExportQuerySchema", () => {
    test("extends assessmentsQuerySchema with higher limit", () => {
      const result = assessmentExportQuerySchema.parse({});
      expect(result.limit).toBe(1000);
    });

    test("accepts export limit up to 1000", () => {
      const result = assessmentExportQuerySchema.parse({ limit: "500" });
      expect(result.limit).toBe(500);
    });

    test("rejects export limit exceeding 1000", () => {
      expect(() => assessmentExportQuerySchema.parse({ limit: "1001" })).toThrow();
    });
  });

  describe("cohortQuerySchema", () => {
    test("accepts valid cohort filters", () => {
      const result = cohortQuerySchema.parse({
        minAge: "20",
        maxAge: "60",
        minBmi: "18.5",
        maxBmi: "30",
        gender: "male",
        riskCategory: "HIGH",
      });
      expect(result.minAge).toBe(20);
      expect(result.maxAge).toBe(60);
      expect(result.gender).toBe("Male");
      expect(result.riskCategory).toBe("HIGH");
    });

    test("accepts valid BMI range", () => {
      const result = cohortQuerySchema.parse({ minBmi: "18.5", maxBmi: "35" });
      expect(result.minBmi).toBe(18.5);
      expect(result.maxBmi).toBe(35);
    });

    test("rejects BMI outside valid range", () => {
      expect(() => cohortQuerySchema.parse({ minBmi: "5" })).toThrow();
      expect(() => cohortQuerySchema.parse({ maxBmi: "90" })).toThrow();
    });

    test("accepts valid HbA1c range", () => {
      const result = cohortQuerySchema.parse({ minHba1c: "5.0", maxHba1c: "12.0" });
      expect(result.minHba1c).toBe(5.0);
      expect(result.maxHba1c).toBe(12.0);
    });

    test("coerces hypertension and heartDisease to boolean (any non-empty string is truthy)", () => {
      // z.coerce.boolean() treats any non-empty string as truthy
      const result = cohortQuerySchema.parse({ hypertension: "true", heartDisease: "false" });
      expect(result.hypertension).toBe(true);
      expect(result.heartDisease).toBe(true); // coerce.boolean converts "false" to true
    });

    test("accepts smoking history filter", () => {
      const result = cohortQuerySchema.parse({ smokingHistory: "Current" });
      expect(result.smokingHistory).toBe("Current");
    });

    test("accepts ISO 8601 date range", () => {
      const result = cohortQuerySchema.parse({ startDate: "2024-01-01", endDate: "2024-12-31" });
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-12-31");
    });

    test("rejects non-ISO date format in cohort", () => {
      expect(() => cohortQuerySchema.parse({ startDate: "01/01/2024" })).toThrow();
    });

    test("rejects invalid risk category in cohort", () => {
      expect(() => cohortQuerySchema.parse({ riskCategory: "CRITICAL" })).toThrow();
    });
  });
});
