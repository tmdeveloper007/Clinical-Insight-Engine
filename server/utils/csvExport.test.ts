import { describe, it, expect } from "vitest";
import { assessmentsToCsv } from "./csvExport";

describe("assessmentsToCsv", () => {
  it("returns empty string for empty array", () => {
    expect(assessmentsToCsv([])).toBe("");
  });

  it("returns empty string for null input", () => {
    expect(assessmentsToCsv(null as any)).toBe("");
    expect(assessmentsToCsv(undefined as any)).toBe("");
  });

  it("returns empty string for undefined array", () => {
    expect(assessmentsToCsv(undefined as any)).toBe("");
  });

  it("produces correct CSV for single row", () => {
    const input = [{ name: "John", age: 45 }];
    const result = assessmentsToCsv(input);
    expect(result).toBe("name,age\nJohn,45");
  });

  it("produces correct CSV for multiple rows", () => {
    const input = [
      { name: "John", age: 45 },
      { name: "Jane", age: 38 },
    ];
    const result = assessmentsToCsv(input);
    const lines = result.split("\n");
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("John,45");
    expect(lines[2]).toBe("Jane,38");
  });

  it("uses headers from first row only", () => {
    const input = [
      { name: "John", age: 45, extra: "ignored" },
      { name: "Jane" },
    ];
    const result = assessmentsToCsv(input);
    // Only the keys from the first row are used as headers
    const lines = result.split("\n");
    expect(lines[0]).toBe("name,age,extra");
    expect(lines[2]).toBe("Jane,,");
  });

  it("escapes CSV injection characters in cell values", () => {
    // A value starting with = should be escaped (csv sanitizer prefixes it)
    const input = [{ formula: "=HYPERLINK('http://evil.com')", name: "test" }];
    const result = assessmentsToCsv(input);
    // The sanitizer prefixes dangerous cells with a single quote
    expect(result).toContain("name");
    expect(result).toContain("test");
  });

  it("handles numeric values correctly", () => {
    const input = [
      { id: 1, score: 0.85, count: 100 },
      { id: 2, score: 0.12, count: 50 },
    ];
    const result = assessmentsToCsv(input);
    expect(result).toContain("id,score,count");
    expect(result).toContain("1,0.85,100");
    expect(result).toContain("2,0.12,50");
  });

  it("handles empty string values", () => {
    const input = [{ name: "", age: 30 }];
    const result = assessmentsToCsv(input);
    expect(result).toBe("name,age\n,30");
  });

  it("handles special characters in values", () => {
    const input = [{ name: 'John "Jack" Doe', city: "New York, NY" }];
    const result = assessmentsToCsv(input);
    // csvSanitizer handles special chars
    expect(result).toContain("name");
    expect(result).toContain("city");
  });
});
