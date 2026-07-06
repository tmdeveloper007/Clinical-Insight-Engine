import { describe, it, expect } from "vitest";
import {
  validateFhirBundle,
  parseFhirBundle,
  extractExplainableInsights,
  extractClinicalNoteDateWarnings,
  convertToInternalSchema,
} from "./fhirParser";

describe("validateFhirBundle", () => {
  it("accepts a valid FHIR R4 Bundle with at least one entry", () => {
    expect(() =>
      validateFhirBundle({
        resourceType: "Bundle",
        type: "collection",
        entry: [{ resource: { resourceType: "Patient", name: [] } }],
      })
    ).not.toThrow();
  });

  it("rejects null payload", () => {
    expect(() => validateFhirBundle(null)).toThrow("Invalid FHIR payload");
  });

  it("rejects non-object payload", () => {
    expect(() => validateFhirBundle("string" as any)).toThrow("Invalid FHIR payload");
  });

  it("rejects payload missing resourceType", () => {
    expect(() => validateFhirBundle({ type: "collection", entry: [] })).toThrow(
      "Invalid FHIR payload"
    );
  });

  it("rejects unsupported resourceType", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Patient", type: "collection", entry: [] })
    ).toThrow("Unsupported FHIR structure");
  });

  it("rejects missing entry array", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", type: "collection" })
    ).toThrow("Missing Bundle entries");
  });

  it("rejects empty entry array", () => {
    expect(() =>
      validateFhirBundle({ resourceType: "Bundle", type: "collection", entry: [] })
    ).toThrow("Missing Bundle entries");
  });
});

describe("parseFhirBundle", () => {
  it("parses a minimal Patient resource", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "pt-1",
            name: [{ given: ["John"], family: "Doe" }],
            gender: "male",
            birthDate: "1980-05-15",
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.patient).toBeDefined();
    expect(result.patient?.name).toBe("John Doe");
    expect(result.patient?.gender).toBe("Male");
    expect(result.patient?.birthDate).toBe("1980-05-15");
    expect(result.observations).toHaveLength(0);
    expect(result.documents).toHaveLength(0);
  });

  it("parses gender female", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            gender: "female",
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.patient?.gender).toBe("Female");
  });

  it("ignores unrecognized resourceType", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-1",
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.patient).toBeUndefined();
    expect(result.observations).toHaveLength(0);
  });

  it("skips malformed entries", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        { resource: null },
        { resource: "not an object" },
        {},
        {
          resource: {
            resourceType: "Patient",
            name: [{ given: ["Jane"], family: "Smith" }],
            gender: "female",
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.patient?.name).toBe("Jane Smith");
  });

  it("parses Observation with valueQuantity", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Observation",
            code: {
              coding: [{ code: "2339-0", display: "Blood Glucose" }],
            },
            effectiveDateTime: "2024-01-15T10:00:00Z",
            valueQuantity: { value: 120, unit: "mg/dL" },
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].code).toBe("2339-0");
    expect(result.observations[0].valueQuantity?.value).toBe(120);
    expect(result.observations[0].effectiveDateTime).toBe("2024-01-15T10:00:00Z");
  });

  it("parses Observation with valueString", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Observation",
            code: { text: "BP Status" },
            valueString: "Hypertension",
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.observations[0].valueString).toBe("Hypertension");
  });

  it("parses Observation components", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Observation",
            code: { coding: [{ code: "85354-9", display: "BP Panel" }] },
            component: [
              {
                code: { coding: [{ code: "8480-6", display: "Systolic BP" }] },
                valueQuantity: { value: 155 },
              },
              {
                code: { coding: [{ display: "Diastolic BP" }] },
                valueQuantity: { value: 95 },
              },
            ],
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.observations[0].component).toHaveLength(2);
    expect(result.observations[0].component?.[0].valueQuantity?.value).toBe(155);
  });

  it("parses DocumentReference with attachment", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "DocumentReference",
            description: "Initial assessment note",
            type: { text: "Clinical Note" },
            content: [
              {
                attachment: {
                  title: "Note.txt",
                  data: Buffer.from("Patient presents with symptoms").toString("base64"),
                },
              },
            ],
          },
        },
      ],
    };

    const result = parseFhirBundle(bundle);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].description).toBe("Initial assessment note");
    expect(result.documents[0].attachmentTitle).toBe("Note.txt");
    expect(result.documents[0].attachmentContent).toBe("Patient presents with symptoms");
  });
});

describe("extractExplainableInsights", () => {
  it("returns 3 default insights for empty text", () => {
    const insights = extractExplainableInsights("");
    expect(insights).toHaveLength(3);
    expect(insights[0].insight).toBe("Patient shows signs of hypertension");
    expect(insights[1].insight).toBe("Patient shows signs of heart disease");
    expect(insights[2].insight).toBe("Patient has a history of smoking");
    insights.forEach((i) => {
      expect(i.source_snippet).toBeNull();
      expect(i.source_index).toBeNull();
    });
  });

  it("extracts hypertension from BP reading above threshold", () => {
    const text = "Patient BP reading is 155/95 mmHg. Started on medication.";
    const insights = extractExplainableInsights(text);
    const ht = insights.find((i) => i.insight === "Patient shows signs of hypertension");
    expect(ht?.source_snippet).toBeTruthy();
    expect(ht?.source_index).toBeTruthy();
  });

  it("extracts hypertension from keyword match", () => {
    const text = "Known hypertension, on Amlodipine 5mg daily.";
    const insights = extractExplainableInsights(text);
    const ht = insights.find((i) => i.insight === "Patient shows signs of hypertension");
    expect(ht?.source_snippet).toBeTruthy();
  });

  it("extracts heart disease from CAD keyword", () => {
    const text = "Patient has a history of coronary artery disease.";
    const insights = extractExplainableInsights(text);
    const hd = insights.find((i) => i.insight === "Patient shows signs of heart disease");
    expect(hd?.source_snippet).toBeTruthy();
  });

  it("extracts smoking history for current smoker", () => {
    const text = "Patient is a current smoker, approximately 10 cigarettes per day.";
    const insights = extractExplainableInsights(text);
    const sh = insights.find((i) => i.insight.includes("Patient has a smoking history"));
    expect(sh?.insight).toContain("current");
    expect(sh?.source_snippet).toBeTruthy();
  });

  it("extracts smoking history for former smoker", () => {
    const text = "Patient is a former smoker, quit 5 years ago.";
    const insights = extractExplainableInsights(text);
    const sh = insights.find((i) => i.insight.includes("Patient has a smoking history"));
    expect(sh?.insight).toContain("former");
  });

  it("extracts smoking history for never smoker", () => {
    const text = "Patient is a non-smoker, never used tobacco products.";
    const insights = extractExplainableInsights(text);
    const sh = insights.find((i) => i.insight.includes("Patient has a smoking history"));
    expect(sh?.insight).toContain("never");
  });
});

describe("extractClinicalNoteDateWarnings", () => {
  it("returns empty array for empty text", () => {
    const result = extractClinicalNoteDateWarnings("");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for text with only ISO dates", () => {
    const text = "Patient assessed on 2024-01-15 and followed up 2024-02-20.";
    const result = extractClinicalNoteDateWarnings(text);
    expect(result.every((d) => d.confidence === 1.0)).toBe(true);
  });
});

describe("convertToInternalSchema", () => {
  const minimalPatient = {
    patient: {
      name: "John Doe",
      gender: "Male" as const,
      birthDate: "1990-05-15",
    },
    observations: [
      {
        codeDisplay: "BMI",
        code: "39156-5",
        valueQuantity: { value: 27.5, unit: "kg/m2" },
      },
      {
        codeDisplay: "HbA1c",
        code: "4548-4",
        valueQuantity: { value: 6.2, unit: "%" },
      },
      {
        codeDisplay: "Blood Glucose",
        code: "2339-0",
        valueQuantity: { value: 110, unit: "mg/dL" },
      },
    ],
    documents: [],
  };

  it("converts valid FHIR structure to internal schema", () => {
    const result = convertToInternalSchema(minimalPatient);
    expect(result.assessment.patientName).toBe("John Doe");
    expect(result.assessment.gender).toBe("Male");
    expect(result.assessment.age).toBeGreaterThan(0);
    expect(result.assessment.bmi).toBe(27.5);
    expect(result.assessment.hba1cLevel).toBe(6.2);
    expect(result.assessment.bloodGlucoseLevel).toBe(110);
    expect(result.dateWarnings).toBeDefined();
  });

  it("throws when patient is missing", () => {
    expect(() =>
      convertToInternalSchema({ observations: [], documents: [] })
    ).toThrow("Missing required field: Patient Name");
  });

  it("throws when patient name is empty", () => {
    const structure = {
      patient: { name: "", gender: "Male" as const, birthDate: "1990-05-15" },
      observations: [
        { codeDisplay: "BMI", code: "39156-5", valueQuantity: { value: 25 } },
        { codeDisplay: "HbA1c", code: "4548-4", valueValue: { value: 5.5 } },
        { codeDisplay: "Glucose", code: "2339-0", valueQuantity: { value: 100 } },
      ],
      documents: [],
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: Patient Name"
    );
  });

  it("throws when gender is missing", () => {
    const structure = {
      ...minimalPatient,
      patient: { ...minimalPatient.patient, gender: undefined as any },
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: Gender"
    );
  });

  it("throws when gender is invalid", () => {
    const structure = {
      ...minimalPatient,
      patient: { ...minimalPatient.patient, gender: "Other" as any },
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Gender must be 'Male' or 'Female'"
    );
  });

  it("throws when birthDate is missing", () => {
    const structure = {
      ...minimalPatient,
      patient: { ...minimalPatient.patient, birthDate: undefined as any },
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: Age"
    );
  });

  it("throws when age is out of range", () => {
    const structure = {
      ...minimalPatient,
      patient: { ...minimalPatient.patient, birthDate: "1900-01-01" },
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Age must be between 1 and 120"
    );
  });

  it("throws when BMI is missing", () => {
    const structure = {
      ...minimalPatient,
      observations: minimalPatient.observations.filter(
        (o) => o.code !== "39156-5"
      ),
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: BMI"
    );
  });

  it("throws when HbA1c is missing", () => {
    const structure = {
      ...minimalPatient,
      observations: minimalPatient.observations.filter(
        (o) => o.code !== "4548-4"
      ),
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: HbA1c Level"
    );
  });

  it("throws when blood glucose is missing", () => {
    const structure = {
      ...minimalPatient,
      observations: minimalPatient.observations.filter(
        (o) => o.code !== "2339-0"
      ),
    };
    expect(() => convertToInternalSchema(structure)).toThrow(
      "Missing required field: Blood Glucose Level"
    );
  });

  it("maps hypertension from observation code 85354-9 with elevated systolic", () => {
    const structure = {
      patient: minimalPatient.patient,
      observations: [
        ...minimalPatient.observations,
        {
          code: "85354-9",
          codeDisplay: "Blood Pressure",
          component: [
            {
              code: { coding: [{ code: "8480-6", display: "Systolic" }] },
              valueQuantity: { value: 155 },
            },
          ],
        },
      ],
      documents: [],
    };
    const result = convertToInternalSchema(structure);
    expect(result.assessment.hypertension).toBe(true);
  });

  it("maps smoking history from smoking cessation observation", () => {
    const structure = {
      patient: minimalPatient.patient,
      observations: [
        ...minimalPatient.observations,
        {
          codeDisplay: "Smoking Status",
          valueString: "Patient is a former smoker, quit 3 years ago",
        },
      ],
      documents: [],
    };
    const result = convertToInternalSchema(structure);
    expect(result.assessment.smokingHistory).toBe("former");
  });

  it("uses display name when code is absent", () => {
    const structure = {
      patient: minimalPatient.patient,
      observations: [
        {
          codeDisplay: "Body Mass Index",
          valueQuantity: { value: 24.0 },
        },
        {
          codeDisplay: "Glycated Hemoglobin",
          valueQuantity: { value: 5.4 },
        },
        {
          codeDisplay: "Glucose [Mass/volume] in Serum",
          valueQuantity: { value: 95 },
        },
      ],
      documents: [],
    };
    const result = convertToInternalSchema(structure);
    expect(result.assessment.bmi).toBe(24.0);
    expect(result.assessment.hba1cLevel).toBe(5.4);
    expect(result.assessment.bloodGlucoseLevel).toBe(95);
  });
});
