import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("strips basic script tags", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe("alert(1)");
  });

  it("strips anchor tags but preserves inner text", () => {
    expect(sanitizeHtml("<a href='x'>click here</a>")).toBe("click here");
  });

  it("preserves plain text unchanged", () => {
    expect(sanitizeHtml("Patient temperature is 37.5C")).toBe(
      "Patient temperature is 37.5C"
    );
  });

  it("returns empty string for null input", () => {
    expect(sanitizeHtml(null as any)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(sanitizeHtml(undefined as any)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips nested tags", () => {
    expect(sanitizeHtml("<div><p>Hello <strong>World</strong></p></div>")).toBe(
      "Hello World"
    );
  });

  it("strips self-closing tags", () => {
    expect(sanitizeHtml("Age: 45<br/>Weight: 80kg")).toBe("Age: 45Weight: 80kg");
  });

  it("strips tags with attributes", () => {
    expect(
      sanitizeHtml(
        "<span class='clinical' onclick='alert(1)'>Patient note</span>"
      )
    ).toBe("Patient note");
  });

  it("strips multiple consecutive tags", () => {
    expect(
      sanitizeHtml("<b>Bold</b> <i>Italic</i> <u>Underline</u>")
    ).toBe("Bold Italic Underline");
  });

  it("handles text without any tags", () => {
    expect(sanitizeHtml("HbA1c: 5.4%, Glucose: 95 mg/dL")).toBe(
      "HbA1c: 5.4%, Glucose: 95 mg/dL"
    );
  });

  it("strips img tags", () => {
    expect(sanitizeHtml("Chart: <img src='x' onerror='alert(1)'>")).toBe(
      "Chart: "
    );
  });
});
