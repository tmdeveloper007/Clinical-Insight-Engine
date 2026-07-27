import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips a single HTML tag", () => {
    expect(sanitizeHtml("<b>bold</b>")).toBe("bold");
  });

  it("strips tag with attributes", () => {
    expect(sanitizeHtml('<a href="http://evil.com">link</a>')).toBe("link");
  });

  it("strips multiple tags", () => {
    expect(sanitizeHtml("<p>Hello <strong>World</strong></p>")).toBe("Hello World");
  });

  it("strips unclosed tags", () => {
    expect(sanitizeHtml("text <script>alert(1)</script>")).toBe("text alert(1)");
  });

  it("strips nested tags", () => {
    expect(sanitizeHtml("<div><span>nested</span></div>")).toBe("nested");
  });

  it("preserves text with no HTML tags", () => {
    expect(sanitizeHtml("plain text here")).toBe("plain text here");
  });

  it("strips anything that looks like an HTML tag including angle-bracket fragments", () => {
    // sanitizeHtml uses /<[^>]*>/g — anything matching that pattern is stripped
    expect(sanitizeHtml("a <b> and c</b> d")).toBe("a  and c d");
  });

  it("handles self-closing tags", () => {
    expect(sanitizeHtml("line1<br/>line2")).toBe("line1line2");
  });

  it("strips img tags", () => {
    expect(sanitizeHtml('text <img src="x" onerror="alert(1)"/> more')).toBe("text  more");
  });

  it("strips onclick handlers", () => {
    expect(sanitizeHtml('<div onclick="evil()">hi</div>')).toBe("hi");
  });
});
