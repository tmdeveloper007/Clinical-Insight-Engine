import { describe, expect, it } from "vitest";
import { assessmentsToCsv } from "./csvExport";
import { escapeCsvCell, sanitizeCsvCell } from "./csvSanitizer";

describe("csvSanitizer", () => {
  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvCell('Doe, "Jane"\nPatient')).toBe('"Doe, ""Jane""\nPatient"');
  });

  it("prefixes spreadsheet formula values", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"https://example.com\")")).toBe(
      "'=HYPERLINK(\"https://example.com\")"
    );
    expect(sanitizeCsvCell("  +SUM(A1:A2)")).toBe("'  +SUM(A1:A2)");
  });

  it("does not prefix valid numbers or numeric strings", () => {
    expect(sanitizeCsvCell(-12.5)).toBe("-12.5");
    expect(sanitizeCsvCell("-12.5")).toBe("-12.5");
    expect(sanitizeCsvCell(123)).toBe("123");
    expect(sanitizeCsvCell("123")).toBe("123");
    expect(sanitizeCsvCell("+123")).toBe("+123");
  });
});

describe("assessmentsToCsv", () => {
  it("exports sanitized CSV rows", () => {
    const csv = assessmentsToCsv([
      {
        patientName: "Jane, Doe",
        riskCategory: "=HIGH",
        notes: 'Needs "follow-up"',
      },
    ]);

    expect(csv).toBe(
      'patientName,riskCategory,notes\n"Jane, Doe",\'=HIGH,"Needs ""follow-up"""'
    );
  });

  it("flattens nested objects and arrays into human-readable format", () => {
    const csv = assessmentsToCsv([
      {
        patientName: "Jane, Doe",
        factors: [
          { name: "Age", impact: "negative", description: "Age over 65" },
        ],
      },
    ]);

    expect(csv).toBe(
      'patientName,factors\n"Jane, Doe","name: Age, impact: negative, description: Age over 65"'
    );
  });

  it("returns empty string for empty array", () => {
    expect(assessmentsToCsv([])).toBe("");
  });

  it("handles null and undefined cell values gracefully", () => {
    const csv = assessmentsToCsv([
      { name: null, age: undefined, score: 42 },
    ]);
    expect(csv).toContain("name");
    expect(csv).toContain("age");
    expect(csv).toContain("score");
  });

  it("converts Date objects to ISO string format", () => {
    const csv = assessmentsToCsv([
      { name: "John", dob: new Date("2024-06-15T00:00:00Z") },
    ]);
    expect(csv).toContain("2024-06-15T00:00:00.000Z");
  });

  it("handles boolean values correctly", () => {
    const csv = assessmentsToCsv([
      { name: "Alice", active: true, archived: false },
    ]);
    expect(csv).toContain("true");
    expect(csv).toContain("false");
  });

  it("flattens deeply nested objects into key:value pairs", () => {
    const csv = assessmentsToCsv([
      {
        name: "Bob",
        meta: {
          department: {
            unit: "ICU",
            floor: 3,
          },
        },
      },
    ]);
    expect(csv).toContain("unit");
    expect(csv).toContain("ICU");
    expect(csv).toContain("floor");
    expect(csv).toContain("3");
  });

  it("flattens arrays of objects to semicolon-separated string", () => {
    const csv = assessmentsToCsv([
      {
        name: "Carol",
        tags: [{ label: "diabetes" }, { label: "hypertension" }],
      },
    ]);
    expect(csv).toContain("diabetes");
    expect(csv).toContain("hypertension");
    // Arrays are joined with semicolons
    expect(csv).toContain(";");
  });

  it("escapes newline characters within cell values", () => {
    const csv = assessmentsToCsv([{ note: "Line1\nLine2" }]);
    expect(csv).toContain("Line1");
    expect(csv).toContain("Line2");
    // The newline should be preserved in the escaped output
    expect(csv).toContain("\"");
  });
});

describe("csvSanitizer edge cases", () => {
  it("returns empty string for null", () => {
    expect(sanitizeCsvCell(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(sanitizeCsvCell(undefined)).toBe("");
  });

  it("converts Date to ISO string before other processing", () => {
    const d = new Date("2024-03-01T00:00:00Z");
    expect(sanitizeCsvCell(d)).toBe(d.toISOString());
  });

  it("preserves numeric types as-is", () => {
    expect(sanitizeCsvCell(0)).toBe("0");
    expect(sanitizeCsvCell(-99)).toBe("-99");
    expect(sanitizeCsvCell(3.14159)).toBe("3.14159");
  });

  it("does not prefix formula when value is numeric string", () => {
    expect(sanitizeCsvCell("123")).toBe("123");
    expect(sanitizeCsvCell("42")).toBe("42");
  });

  it("flattens array of primitives with semicolons", () => {
    const result = sanitizeCsvCell(["a", "b", "c"]);
    expect(result).toBe("a; b; c");
  });

  it("handles nested arrays correctly", () => {
    const result = sanitizeCsvCell([["x", "y"], ["z"]]);
    expect(result).toContain("x");
    expect(result).toContain("y");
    expect(result).toContain("z");
  });
});
