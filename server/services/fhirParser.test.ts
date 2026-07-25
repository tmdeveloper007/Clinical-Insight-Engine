import { describe, it, expect } from "vitest";
import {
  validateFhirBundle,
  parseFhirBundle,
  extractExplainableInsights,
  extractClinicalNoteDateWarnings,
  convertToInternalSchema,
} from "./fhirParser";

describe("validateFhirBundle", () => {
  it("accepts a valid FHIR Bundle", () => {
    const payload = {
      resourceType: "Bundle",
      type: "collection",
      entry: [{ resource: { resourceType: "Patient" } }],
    };
    expect(() => validateFhirBundle(payload)).not.toThrow();
  });

  it("throws for null payload", () => {
    expect(() => validateFhirBundle(null as any)).toThrow("Invalid FHIR payload");
  });

  it("throws for undefined payload", () => {
    expect(() => validateFhirBundle(undefined as any)).toThrow("Invalid FHIR payload");
  });

  it("throws for non-object payload", () => {
    expect(() => validateFhirBundle("string" as any)).toThrow("Invalid FHIR payload");
    expect(() => validateFhirBundle(123 as any)).toThrow("Invalid FHIR payload");
  });

  it("throws when resourceType is missing", () => {
    expect(() => validateFhirBundle({} as any)).toThrow("Invalid FHIR payload");
  });

  it("throws when resourceType is not Bundle", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Patient" } as any)
    ).toThrow("Unsupported FHIR structure");
  });

  it("throws when type is missing", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", entry: [] } as any)
    ).toThrow("Unsupported FHIR structure");
  });

  it("throws when entry is missing", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", type: "collection" } as any)
    ).toThrow("Missing Bundle entries");
  });

  it("throws when entry is not an array", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", type: "collection", entry: {} } as any)
    ).toThrow("Missing Bundle entries");
  });

  it("throws when entry is empty", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", type: "collection", entry: [] } as any)
    ).toThrow("Missing Bundle entries");
  });
});

describe("parseFhirBundle", () => {
  it("returns empty structure for empty entry array", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [],
    });
    expect(result.observations).toHaveLength(0);
    expect(result.documents).toHaveLength(0);
    expect(result.patient).toBeUndefined();
  });

  it("parses a Patient resource", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "pt-1",
            name: [{ use: "official", given: ["John"], family: "Doe" }],
            gender: "male",
            birthDate: "1990-05-15",
          },
        },
      ],
    });
    expect(result.patient).toMatchObject({
      id: "pt-1",
      name: "John Doe",
      gender: "Male",
      birthDate: "1990-05-15",
    });
  });

  it("parses gender female correctly", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            name: [{ given: ["Jane"], family: "Smith" }],
            gender: "female",
          },
        },
      ],
    });
    expect(result.patient?.gender).toBe("Female");
  });

  it("skips entries without resource", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [{ resource: { resourceType: "Patient", name: [{ given: ["Test"] }], gender: "male" } }],
    });
    expect(result.patient).toBeDefined();
  });

  it("skips null entries gracefully", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [null as any, { resource: { resourceType: "Patient", name: [{ given: ["Test"] }], gender: "male" } }],
    });
    expect(result.patient).toBeDefined();
  });

  it("parses an Observation resource with valueQuantity", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Observation",
            code: { coding: [{ code: "2339-0", display: "Blood Glucose" }] },
            effectiveDateTime: "2024-01-15",
            valueQuantity: { value: 120, unit: "mg/dL" },
          },
        },
      ],
    });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].code).toBe("2339-0");
    expect(result.observations[0].valueQuantity).toMatchObject({ value: 120, unit: "mg/dL" });
  });

  it("parses a DocumentReference resource", () => {
    const result = parseFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "DocumentReference",
            description: "Clinical note",
            type: { text: "Progress Note" },
          },
        },
      ],
    });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].description).toBe("Clinical note");
    expect(result.documents[0].type).toBe("Progress Note");
  });
});

describe("extractExplainableInsights", () => {
  it("returns default insights for empty note", () => {
    const insights = extractExplainableInsights("");
    expect(insights).toHaveLength(3);
    expect(insights[0].insight).toContain("hypertension");
    expect(insights[1].insight).toContain("heart disease");
    expect(insights[2].insight).toContain("smoking");
  });

  it("returns default insights for null note", () => {
    const insights = extractExplainableInsights(null as any);
    expect(insights).toHaveLength(3);
  });

  it("extracts BP reading when elevated", () => {
    const insights = extractExplainableInsights("Patient BP reading 150/95 today.");
    const bpInsight = insights.find((i) => i.insight.includes("hypertension"));
    expect(bpInsight?.source_snippet).toBeTruthy();
  });

  it("extracts hypertension keyword", () => {
    const insights = extractExplainableInsights("Patient has a history of hypertension.");
    const htInsight = insights.find((i) => i.insight.includes("hypertension"));
    expect(htInsight?.source_snippet).toContain("hypertension");
  });

  it("extracts heart disease keyword", () => {
    const insights = extractExplainableInsights("EKG shows atrial fibrillation.");
    const hdInsight = insights.find((i) => i.insight.includes("heart disease"));
    expect(hdInsight?.source_snippet).toBeTruthy();
  });

  it("extracts smoking history for current smoker", () => {
    const insights = extractExplainableInsights("Patient is a current smoker.");
    const shInsight = insights.find((i) => i.insight.includes("smoking"));
    expect(shInsight?.insight).toContain("current");
  });

  it("extracts smoking history for former smoker", () => {
    const insights = extractExplainableInsights("Patient is a former smoker.");
    const shInsight = insights.find((i) => i.insight.includes("smoking"));
    expect(shInsight?.insight).toContain("former");
  });

  it("extracts smoking history for never smoker", () => {
    const insights = extractExplainableInsights("Patient is a non-smoker.");
    const shInsight = insights.find((i) => i.insight.includes("smoking"));
    expect(shInsight?.insight).toContain("never");
  });
});

describe("convertToInternalSchema", () => {
  it("throws when patient is missing", () => {
    expect(() =>
      convertToInternalSchema({ observations: [], documents: [] } as any)
    ).toThrow("Missing required field: Patient Name");
  });

  it("throws when patient name is empty", () => {
    expect(() =>
      convertToInternalSchema({ patient: { name: "", gender: "Male" }, observations: [], documents: [] } as any)
    ).toThrow("Missing required field: Patient Name");
  });

  it("throws when gender is missing", () => {
    expect(() =>
      convertToInternalSchema({ patient: { name: "John" }, observations: [], documents: [] } as any)
    ).toThrow("Missing required field: Gender");
  });

  it("throws when gender is invalid", () => {
    expect(() =>
      convertToInternalSchema({ patient: { name: "John", gender: "Unknown" }, observations: [], documents: [] } as any)
    ).toThrow("Gender must be 'Male' or 'Female'");
  });

  it("throws when birthDate is missing", () => {
    expect(() =>
      convertToInternalSchema({ patient: { name: "John", gender: "Male" }, observations: [], documents: [] } as any)
    ).toThrow("Missing required field: Age");
  });

  it("throws when birthDate is in ambiguous format without ISO fallback", () => {
    expect(() =>
      convertToInternalSchema({
        patient: { name: "John", gender: "Male", birthDate: "not-a-date" },
        observations: [],
        documents: [],
      } as any)
    ).toThrow(/Invalid birth date format/);
  });

  it("throws when BMI is missing from observations", () => {
    expect(() =>
      convertToInternalSchema({
        patient: { name: "John", gender: "Male", birthDate: "1990-01-01" },
        observations: [],
        documents: [],
      } as any)
    ).toThrow("Missing required field: BMI");
  });

  it("throws when HbA1c is missing from observations", () => {
    const structure = {
      patient: { name: "John", gender: "Male", birthDate: "1990-01-01" },
      observations: [
        {
          code: "39156-5",
          codeDisplay: "Body Mass Index",
          valueQuantity: { value: 25.0 },
        },
      ],
      documents: [],
    };
    expect(() => convertToInternalSchema(structure as any)).toThrow("Missing required field: HbA1c Level");
  });

  it("throws when blood glucose is missing", () => {
    const structure = {
      patient: { name: "John", gender: "Male", birthDate: "1990-01-01" },
      observations: [
        { code: "39156-5", codeDisplay: "BMI", valueQuantity: { value: 25.0 } },
        { code: "4548-4", codeDisplay: "HbA1c", valueQuantity: { value: 6.5 } },
      ],
      documents: [],
    };
    expect(() => convertToInternalSchema(structure as any)).toThrow("Missing required field: Blood Glucose Level");
  });

  it("parses a complete valid structure", () => {
    const structure = {
      patient: { name: "John Doe", gender: "Male", birthDate: "1990-01-01" },
      observations: [
        { code: "39156-5", codeDisplay: "BMI", valueQuantity: { value: 25.0 } },
        { code: "4548-4", codeDisplay: "HbA1c", valueQuantity: { value: 6.5 } },
        { code: "2339-0", codeDisplay: "Blood Glucose", valueQuantity: { value: 120 } },
      ],
      documents: [],
    };
    const result = convertToInternalSchema(structure as any);
    expect(result.assessment.patientName).toBe("John Doe");
    expect(result.assessment.gender).toBe("Male");
    expect(result.assessment.bmi).toBe(25.0);
    expect(result.assessment.hba1cLevel).toBe(6.5);
    expect(result.assessment.bloodGlucoseLevel).toBe(120);
  });

  it("infers hypertension from BP component observation with high systolic", () => {
    const structure = {
      patient: { name: "John", gender: "Male", birthDate: "1990-01-01" },
      observations: [
        {
          code: "85354-9",
          codeDisplay: "Blood Pressure",
          component: [
            {
              code: { coding: [{ code: "8480-6", display: "Systolic BP" }] },
              valueQuantity: { value: 150 },
            },
          ],
        },
        { code: "39156-5", codeDisplay: "BMI", valueQuantity: { value: 25.0 } },
        { code: "4548-4", codeDisplay: "HbA1c", valueQuantity: { value: 6.5 } },
        { code: "2339-0", codeDisplay: "Glucose", valueQuantity: { value: 120 } },
      ],
      documents: [],
    };
    const result = convertToInternalSchema(structure as any);
    expect(result.assessment.hypertension).toBe(true);
  });
});
