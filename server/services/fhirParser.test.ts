import { describe, it, expect } from "vitest";
import {
  validateFhirBundle,
  parseFhirBundle,
  convertToInternalSchema,
  extractExplainableInsights,
} from "./fhirParser";

describe("validateFhirBundle", () => {
  it("passes for a valid Bundle with required fields", () => {
    const payload = {
      resourceType: "Bundle",
      type: "collection",
      entry: [{ resource: { resourceType: "Patient", name: "John" } }],
    };
    expect(() => validateFhirBundle(payload)).not.toThrow();
  });

  it("throws for null payload", () => {
    expect(() => validateFhirBundle(null as any)).toThrow("Invalid FHIR payload");
  });

  it("throws for non-object payload", () => {
    expect(() => validateFhirBundle("string" as any)).toThrow("Invalid FHIR payload");
    expect(() => validateFhirBundle(123 as any)).toThrow("Invalid FHIR payload");
  });

  it("throws when resourceType is missing", () => {
    expect(() => validateFhirBundle({ type: "collection", entry: [] } as any)).toThrow("Invalid FHIR payload");
  });

  it("throws when resourceType is not Bundle", () => {
    expect(() => validateFhirBundle({ resourceType: "Patient", entry: [] } as any)).toThrow("Unsupported FHIR structure");
  });

  it("throws when type is missing", () => {
    expect(() => validateFhirBundle({ resourceType: "Bundle", entry: [] } as any)).toThrow("Unsupported FHIR structure");
  });

  it("throws when entry is missing", () => {
    expect(() => validateFhirBundle({ resourceType: "Bundle", type: "collection" } as any)).toThrow("Missing Bundle entries");
  });

  it("throws when entry is not an array", () => {
    expect(() => validateFhirBundle({ resourceType: "Bundle", type: "collection", entry: "not-array" } as any)).toThrow("Missing Bundle entries");
  });

  it("throws when entry is empty array", () => {
    expect(() => validateFhirBundle({ resourceType: "Bundle", type: "collection", entry: [] } as any)).toThrow("Missing Bundle entries");
  });
});

describe("parseFhirBundle", () => {
  it("parses a Patient resource with official name", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        { resource: { resourceType: "Patient", id: "P001", name: [{ use: "official", given: ["John"], family: "Doe" }], gender: "male", birthDate: "1990-05-15" } }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.patient).toBeDefined();
    expect(result.patient!.name).toBe("John Doe");
    expect(result.patient!.gender).toBe("Male");
    expect(result.patient!.id).toBe("P001");
  });

  it("parses a Patient resource with gender=female", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        { resource: { resourceType: "Patient", name: [{ given: ["Jane"], family: "Smith" }], gender: "female" } }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.patient!.gender).toBe("Female");
  });

  it("skips entries without a resource field", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        { resource: { resourceType: "Patient", name: [{ given: ["John"] }], gender: "male" } },
        { notResource: "x" },
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.patient).toBeDefined();
  });

  it("skips unknown resourceType entries", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        { resource: { resourceType: "UnknownType" } }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.patient).toBeUndefined();
    expect(result.observations).toHaveLength(0);
  });

  it("parses Observation with valueQuantity", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        {
          resource: {
            resourceType: "Observation",
            code: { coding: [{ code: "4548-4", display: "HbA1c" }] },
            effectiveDateTime: "2024-01-15",
            valueQuantity: { value: 5.4, unit: "%" }
          }
        }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].valueQuantity!.value).toBe(5.4);
    expect(result.observations[0].code).toBe("4548-4");
  });

  it("parses Observation with valueString", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        {
          resource: {
            resourceType: "Observation",
            code: { text: "Hypertension" },
            valueString: "yes"
          }
        }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.observations[0].valueString).toBe("yes");
  });

  it("parses DocumentReference with attachment", () => {
    const bundle = {
      resourceType: "Bundle", type: "collection", entry: [
        {
          resource: {
            resourceType: "DocumentReference",
            description: "Clinical note",
            type: { text: "Progress Note" },
            content: [{ attachment: { title: "Note Title", data: "VGVzdA==" } }]  // "Test" in base64
          }
        }
      ]
    };
    const result = parseFhirBundle(bundle);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].description).toBe("Clinical note");
    expect(result.documents[0].type).toBe("Progress Note");
    expect(result.documents[0].attachmentTitle).toBe("Note Title");
    expect(result.documents[0].attachmentContent).toBe("Test");
  });
});

describe("convertToInternalSchema", () => {
  const validBundle = {
    patient: {
      id: "P001",
      name: "Alice Brown",
      gender: "Female" as const,
      birthDate: "1985-03-20",
    },
    observations: [
      {
        code: "39156-5",
        codeDisplay: "Body mass index",
        valueQuantity: { value: 27.5, unit: "kg/m2" }
      },
      {
        code: "4548-4",
        codeDisplay: "HbA1c",
        valueQuantity: { value: 6.1, unit: "%" }
      },
      {
        code: "2339-0",
        codeDisplay: "Glucose",
        valueQuantity: { value: 110, unit: "mg/dL" }
      },
    ],
    documents: []
  };

  it("converts a valid FHIR bundle to internal schema", () => {
    const result = convertToInternalSchema(validBundle);
    expect(result.assessment.patientName).toBe("Alice Brown");
    expect(result.assessment.gender).toBe("Female");
    expect(result.assessment.age).toBe(41);  // born 1985-03-20, today 2026-07-03 → 41 years old
    expect(result.assessment.bmi).toBe(27.5);
    expect(result.assessment.hba1cLevel).toBe(6.1);
    expect(result.assessment.bloodGlucoseLevel).toBe(110);
  });

  it("throws when patient name is missing", () => {
    const bundle = { ...validBundle, patient: { ...validBundle.patient, name: "" } };
    expect(() => convertToInternalSchema(bundle)).toThrow("Missing required field: Patient Name");
  });

  it("throws when patient object is missing", () => {
    const bundle = { observations: [], documents: [] };
    expect(() => convertToInternalSchema(bundle as any)).toThrow("Missing required field: Patient Name");
  });

  it("throws when gender is not Male or Female", () => {
    const bundle = { ...validBundle, patient: { ...validBundle.patient, gender: "Unknown" as any } };
    expect(() => convertToInternalSchema(bundle)).toThrow("Gender must be 'Male' or 'Female'");
  });

  it("throws when birthDate is missing", () => {
    const bundle = { ...validBundle, patient: { ...validBundle.patient, birthDate: undefined as any } };
    expect(() => convertToInternalSchema(bundle)).toThrow("Missing required field: Age");
  });

  it("throws when BMI observation is missing", () => {
    const bundle = { ...validBundle, observations: validBundle.observations.filter(o => o.code !== "39156-5") };
    expect(() => convertToInternalSchema(bundle)).toThrow("Missing required field: BMI");
  });

  it("throws when HbA1c observation is missing", () => {
    const bundle = { ...validBundle, observations: validBundle.observations.filter(o => o.code !== "4548-4") };
    expect(() => convertToInternalSchema(bundle)).toThrow("Missing required field: HbA1c Level");
  });

  it("throws when blood glucose observation is missing", () => {
    const bundle = { ...validBundle, observations: validBundle.observations.filter(o => o.code !== "2339-0") };
    expect(() => convertToInternalSchema(bundle)).toThrow("Missing required field: Blood Glucose Level");
  });

  it("detects hypertension from BP observation", () => {
    const bundle = {
      ...validBundle,
      observations: [
        {
          code: "85354-9",
          codeDisplay: "Blood pressure panel",
          component: [
            { code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: 155 } },  // systolic > 140
            { code: { coding: [{ code: "8462-4" }] }, valueQuantity: { value: 85 } }
          ]
        },
        ...validBundle.observations
      ]
    };
    const result = convertToInternalSchema(bundle);
    expect(result.assessment.hypertension).toBe(true);
  });

  it("detects heart disease from keyword in display", () => {
    const bundle = {
      ...validBundle,
      observations: [
        { code: "unknown", codeDisplay: "History of myocardial infarction", valueString: "yes" },
        ...validBundle.observations
      ]
    };
    const result = convertToInternalSchema(bundle);
    expect(result.assessment.heartDisease).toBe(true);
  });
});

describe("extractExplainableInsights", () => {
  it("returns default insights for empty note", () => {
    const insights = extractExplainableInsights("");
    expect(insights).toHaveLength(3);
    expect(insights[0].insight).toBe("Patient shows signs of hypertension");
  });

  it("extracts hypertension from BP reading > 140/90", () => {
    const insights = extractExplainableInsights("Patient BP: 155/95 mmHg today.");
    const htInsight = insights.find(i => i.insight === "Patient shows signs of hypertension");
    expect(htInsight).toBeDefined();
    expect(htInsight!.source_snippet).not.toBeNull();
  });

  it("extracts heart disease from coronary artery keyword", () => {
    const insights = extractExplainableInsights("Patient has a history of coronary artery disease.");
    const hdInsight = insights.find(i => i.insight === "Patient shows signs of heart disease");
    expect(hdInsight).toBeDefined();
    expect(hdInsight!.source_snippet).not.toBeNull();
  });

  it("extracts smoking history for current smoker", () => {
    const insights = extractExplainableInsights("Patient is a current smoker.");
    const shInsight = insights.find(i => i.insight.includes("smoking history"));
    expect(shInsight).toBeDefined();
    expect(shInsight!.insight).toContain("current");
  });

  it("extracts smoking history for former smoker", () => {
    const insights = extractExplainableInsights("Patient is a former smoker.");
    const shInsight = insights.find(i => i.insight.includes("smoking history"));
    expect(shInsight).toBeDefined();
    expect(shInsight!.insight).toContain("former");
  });

  it("extracts smoking history for never smoker", () => {
    const insights = extractExplainableInsights("Patient has never smoked.");
    const shInsight = insights.find(i => i.insight.includes("smoking history"));
    expect(shInsight).toBeDefined();
    expect(shInsight!.insight).toContain("never");
  });
});
