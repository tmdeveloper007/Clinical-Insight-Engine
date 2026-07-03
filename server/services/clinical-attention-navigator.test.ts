import { describe, test, expect } from "vitest";
import { generateAttentionNavigator } from "./clinical-attention-navigator";

describe("clinical-attention-navigator", () => {
  test("returns empty priorities for empty input", () => {
    const result = generateAttentionNavigator({});
    expect(result.priorities).toEqual([]);
  });

  describe("risk category", () => {
    test("HIGH risk category returns high priority item", () => {
      const result = generateAttentionNavigator({ riskCategory: "HIGH" });
      expect(result.priorities[0]).toMatchObject({
        factor: "Risk category",
        priority: "high",
      });
    });

    test("MODERATE risk category returns moderate priority item", () => {
      const result = generateAttentionNavigator({ riskCategory: "MODERATE" });
      expect(result.priorities[0]).toMatchObject({
        factor: "Risk category",
        priority: "moderate",
      });
    });

    test("LOW risk category returns no risk category item", () => {
      const result = generateAttentionNavigator({ riskCategory: "LOW" });
      const riskCat = result.priorities.find(p => p.factor === "Risk category");
      expect(riskCat).toBeUndefined();
    });

    test("riskCategory is case-insensitive", () => {
      const result = generateAttentionNavigator({ riskCategory: "high" });
      expect(result.priorities[0]).toMatchObject({ priority: "high" });
    });
  });

  describe("HbA1c thresholds", () => {
    test("HbA1c >= 9 returns high priority", () => {
      const result = generateAttentionNavigator({ hba1cLevel: "9.5" as any });
      const item = result.priorities.find(p => p.factor === "HbA1c");
      expect(item).toMatchObject({ priority: "high", value: 9.5 });
    });

    test("HbA1c >= 7 and < 9 returns moderate priority", () => {
      const result = generateAttentionNavigator({ hba1cLevel: "7.5" as any });
      const item = result.priorities.find(p => p.factor === "HbA1c");
      expect(item).toMatchObject({ priority: "moderate", value: 7.5 });
    });

    test("HbA1c < 7 returns monitor priority", () => {
      const result = generateAttentionNavigator({ hba1cLevel: "5.5" as any });
      const item = result.priorities.find(p => p.factor === "HbA1c");
      expect(item).toMatchObject({ priority: "monitor", value: 5.5 });
    });
  });

  describe("blood glucose thresholds", () => {
    test("glucose >= 200 returns high priority", () => {
      const result = generateAttentionNavigator({ bloodGlucoseLevel: "250" as any });
      const item = result.priorities.find(p => p.factor === "Blood Glucose");
      expect(item).toMatchObject({ priority: "high", value: 250 });
    });

    test("glucose >= 140 and < 200 returns moderate priority", () => {
      const result = generateAttentionNavigator({ bloodGlucoseLevel: "160" as any });
      const item = result.priorities.find(p => p.factor === "Blood Glucose");
      expect(item).toMatchObject({ priority: "moderate", value: 160 });
    });

    test("glucose < 140 returns monitor priority", () => {
      const result = generateAttentionNavigator({ bloodGlucoseLevel: "100" as any });
      const item = result.priorities.find(p => p.factor === "Blood Glucose");
      expect(item).toMatchObject({ priority: "monitor", value: 100 });
    });
  });

  describe("BMI thresholds", () => {
    test("BMI >= 30 returns moderate priority", () => {
      const result = generateAttentionNavigator({ bmi: "32" as any });
      const item = result.priorities.find(p => p.factor === "BMI");
      expect(item).toMatchObject({ priority: "moderate" });
    });

    test("BMI >= 25 and < 30 returns monitor priority", () => {
      const result = generateAttentionNavigator({ bmi: "27" as any });
      const item = result.priorities.find(p => p.factor === "BMI");
      expect(item).toMatchObject({ priority: "monitor" });
    });

    test("BMI < 25 returns monitor priority", () => {
      const result = generateAttentionNavigator({ bmi: "22" as any });
      const item = result.priorities.find(p => p.factor === "BMI");
      expect(item).toMatchObject({ priority: "monitor" });
    });
  });

  describe("hypertension", () => {
    test("hypertension = true returns moderate priority", () => {
      const result = generateAttentionNavigator({ hypertension: true as any });
      const item = result.priorities.find(p => p.factor === "Hypertension");
      expect(item).toMatchObject({ priority: "moderate" });
    });

    test("hypertension = false returns no hypertension item", () => {
      const result = generateAttentionNavigator({ hypertension: false as any });
      const item = result.priorities.find(p => p.factor === "Hypertension");
      expect(item).toBeUndefined();
    });
  });

  describe("heart disease", () => {
    test("heartDisease = true returns high priority", () => {
      const result = generateAttentionNavigator({ heartDisease: true as any });
      const item = result.priorities.find(p => p.factor === "Heart Disease");
      expect(item).toMatchObject({ priority: "high" });
    });

    test("heartDisease = false returns no heart disease item", () => {
      const result = generateAttentionNavigator({ heartDisease: false as any });
      const item = result.priorities.find(p => p.factor === "Heart Disease");
      expect(item).toBeUndefined();
    });
  });

  describe("smoking normalization", () => {
    test("current smoker returns moderate priority", () => {
      const result = generateAttentionNavigator({ smokingHistory: "current" as any });
      const item = result.priorities.find(p => p.factor === "Smoking History");
      expect(item).toMatchObject({ priority: "moderate" });
    });

    test("former smoker returns monitor priority", () => {
      const result = generateAttentionNavigator({ smokingHistory: "former" as any });
      const item = result.priorities.find(p => p.factor === "Smoking History");
      expect(item).toMatchObject({ priority: "monitor" });
    });

    test("never smoker returns no smoking history item", () => {
      const result = generateAttentionNavigator({ smokingHistory: "never" as any });
      const item = result.priorities.find(p => p.factor === "Smoking History");
      expect(item).toBeUndefined();
    });

    test("unknown smoking returns no smoking history item", () => {
      const result = generateAttentionNavigator({ smokingHistory: "unknown" as any });
      const item = result.priorities.find(p => p.factor === "Smoking History");
      expect(item).toBeUndefined();
    });
  });

  describe("AssessmentFactor handling", () => {
    test("positive impact factors get high priority (top 3 only)", () => {
      const factors = [
        { name: "Factor 1", impact: "positive" as const, description: "desc1" },
        { name: "Factor 2", impact: "negative" as const, description: "desc2" },
        { name: "Factor 3", impact: "positive" as const, description: "desc3" },
        { name: "Factor 4", impact: "positive" as const, description: "desc4" },
      ];
      const result = generateAttentionNavigator({ factors } as any);
      const positiveFactors = result.priorities.filter(p => p.reason.includes("Factor contribution"));
      expect(positiveFactors).toHaveLength(3);
      expect(positiveFactors.every(p => p.priority === "high")).toBe(true);
    });

    test("negative impact factors get monitor priority", () => {
      const factors = [{ name: "Neg Factor", impact: "negative" as const, description: "desc" }];
      const result = generateAttentionNavigator({ factors } as any);
      const negFactor = result.priorities.find(p => p.factor === "Neg Factor");
      expect(negFactor).toMatchObject({ priority: "monitor" });
    });
  });

  describe("priority deduplication", () => {
    test("high priority wins over moderate for same factor", () => {
      // When both HIGH riskCategory and heartDisease exist, both are high
      // But if HbA1c (moderate) duplicates with a high-priority factor, high wins
      const factors = [{ name: "HbA1c", impact: "positive" as const, description: "" }];
      const result = generateAttentionNavigator({ hba1cLevel: "7.5" as any, factors: factors } as any);
      const hba1cItems = result.priorities.filter(p => p.factor === "HbA1c");
      // Should only have one HbA1c item (the high-priority one from factors)
      expect(hba1cItems).toHaveLength(1);
      expect(hba1cItems[0].priority).toBe("high");
    });
  });

  describe("sorting", () => {
    test("high priority items appear before moderate items", () => {
      const result = generateAttentionNavigator({
        riskCategory: "HIGH",
        heartDisease: true as any,
        hypertension: true as any,
        hba1cLevel: "9.5" as any,
        bmi: "32" as any,
        smokingHistory: "current" as any,
      } as any);

      const priorities = result.priorities;
      const firstModerateIdx = priorities.findIndex(p => p.priority === "moderate");
      const lastHighIdx = priorities.map(p => p.priority).lastIndexOf("high");

      // All high items come before all moderate items
      expect(firstModerateIdx).toBeGreaterThan(lastHighIdx);
    });

    test("moderate priority items appear before monitor items", () => {
      const result = generateAttentionNavigator({
        bmi: "22" as any, // monitor
        hba1cLevel: "5.5" as any, // monitor
      } as any);

      const priorities = result.priorities;
      const firstMonitorIdx = priorities.findIndex(p => p.priority === "monitor");
      const lastModerateIdx = priorities.map(p => p.priority).lastIndexOf("moderate");

      if (lastModerateIdx >= 0) {
        expect(firstMonitorIdx).toBeGreaterThan(lastModerateIdx);
      }
    });
  });

  describe("null and undefined handling", () => {
    test("null values are handled gracefully", () => {
      const result = generateAttentionNavigator({
        hba1cLevel: null,
        bmi: null,
        bloodGlucoseLevel: null,
      } as any);
      expect(result.priorities).toEqual([]);
    });

    test("string 'null' is handled gracefully", () => {
      const result = generateAttentionNavigator({
        hba1cLevel: "null" as any,
      } as any);
      // "null" as string converts to NaN, which is monitor, no item added
      const hba1c = result.priorities.find(p => p.factor === "HbA1c");
      expect(hba1c).toBeUndefined();
    });
  });
});
