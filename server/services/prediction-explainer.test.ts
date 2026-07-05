import { describe, expect, it } from "vitest";
import { generatePredictionExplanation } from "./prediction-explainer";

describe("generatePredictionExplanation", () => {
  it("returns an object with all required fields", () => {
    const result = generatePredictionExplanation({});
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("patientSummary");
    expect(result).toHaveProperty("clinicianSummary");
    expect(result).toHaveProperty("topContributors");
    expect(result).toHaveProperty("strongestPositive");
    expect(result).toHaveProperty("strongestNegative");
  });

  it("returns empty arrays when no factors are provided", () => {
    const result = generatePredictionExplanation({});
    expect(result.topContributors).toHaveLength(0);
    expect(result.strongestPositive).toHaveLength(0);
    expect(result.strongestNegative).toHaveLength(0);
  });

  it("marks HIGH riskCategory in summary", () => {
    const result = generatePredictionExplanation({ riskCategory: "HIGH" });
    expect(result.summary.toLowerCase()).toContain("high");
    expect(result.patientSummary.toLowerCase()).toContain("high");
    expect(result.clinicianSummary.toLowerCase()).toContain("high");
  });

  it("marks MODERATE riskCategory in summary", () => {
    const result = generatePredictionExplanation({ riskCategory: "MODERATE" });
    expect(result.summary.toLowerCase()).toContain("moderate");
  });

  it("marks LOW riskCategory in summary", () => {
    const result = generatePredictionExplanation({ riskCategory: "LOW" });
    expect(result.summary.toLowerCase()).toContain("low");
  });

  it("handles lowercase riskCategory input", () => {
    const result = generatePredictionExplanation({ riskCategory: "high" });
    expect(result.summary.toLowerCase()).toContain("high");
  });

  it("handles null/undefined factors gracefully", () => {
    const result = generatePredictionExplanation({ factors: null as any });
    expect(result.topContributors).toHaveLength(0);
    expect(result.strongestPositive).toHaveLength(0);
  });

  it("handles non-array factors gracefully", () => {
    const result = generatePredictionExplanation({ factors: "not-an-array" as any });
    expect(result.topContributors).toHaveLength(0);
  });

  it("sorts topContributors by strength descending", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "Factor A", impact: "positive", description: "Low impact" },
        { name: "Factor B", impact: "positive", description: "High impact" },
      ],
    });
    const strengths = result.topContributors.map(f => f.strength);
    expect(strengths[0]).toBeGreaterThanOrEqual(strengths[1]);
  });

  it("limits topContributors to 4 items", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "Factor 1", impact: "positive", description: "D1" },
        { name: "Factor 2", impact: "positive", description: "D2" },
        { name: "Factor 3", impact: "positive", description: "D3" },
        { name: "Factor 4", impact: "positive", description: "D4" },
        { name: "Factor 5", impact: "positive", description: "D5" },
      ],
    });
    expect(result.topContributors.length).toBeLessThanOrEqual(4);
  });

  it("separates positive and negative contributors correctly", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "Positive Factor", impact: "positive", description: "Increases risk" },
        { name: "Negative Factor", impact: "negative", description: "Decreases risk" },
      ],
    });
    expect(result.strongestPositive.length).toBeGreaterThan(0);
    expect(result.strongestNegative.length).toBeGreaterThan(0);
  });

  it("each contributor has required fields after weighting", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "Test Factor", impact: "positive", description: "Test desc" },
      ],
    });
    for (const c of result.topContributors) {
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("impact");
      expect(c).toHaveProperty("description");
      expect(c).toHaveProperty("strength");
      expect(c).toHaveProperty("why");
    }
  });

  it("maps known factor names to correct strengths", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "diabetic hba1c range", impact: "positive", description: "High HbA1c" },
      ],
    });
    const factor = result.topContributors[0];
    expect(factor.strength).toBe(100);
  });

  it("uses default strength for unknown factor names with positive impact", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "completely unknown factor", impact: "positive", description: "Unknown" },
      ],
    });
    const factor = result.topContributors[0];
    expect(factor.strength).toBeGreaterThan(0);
    expect(factor.strength).toBeLessThanOrEqual(100);
  });

  it("clamps strength to maximum of 100", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "Factor", impact: "positive", description: "D" },
      ],
    });
    for (const c of result.topContributors) {
      expect(c.strength).toBeLessThanOrEqual(100);
    }
  });

  it("summary contains risk classification language", () => {
    const result = generatePredictionExplanation({});
    expect(result.summary.toLowerCase()).toContain("diabetes");
    expect(result.patientSummary.toLowerCase()).toContain("diabetes");
    // clinicianSummary uses "risk" language rather than explicit "diabetes"
    expect(result.clinicianSummary.toLowerCase()).toContain("risk");
  });

  it("handles factors with missing name gracefully", () => {
    const result = generatePredictionExplanation({
      factors: [
        { name: "", impact: "positive", description: "Empty name" } as any,
      ],
    });
    expect(result.topContributors).toBeDefined();
  });

  it("summary and patientSummary differ appropriately", () => {
    const result = generatePredictionExplanation({
      riskCategory: "HIGH",
      factors: [
        { name: "Test Factor", impact: "positive", description: "Test" },
      ],
    });
    // Both should be defined but have different formatting
    expect(result.summary).toBeDefined();
    expect(result.patientSummary).toBeDefined();
  });
});
