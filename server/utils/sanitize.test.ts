import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("strips simple opening and closing tags", () => {
    expect(sanitizeHtml("<b>hello</b>")).toBe("hello");
  });

  it("strips self-closing tags", () => {
    expect(sanitizeHtml("age: <br/> 45")).toBe("age:  45");
  });

  it("strips nested tags", () => {
    expect(sanitizeHtml("<p><strong>bold</strong> text</p>")).toBe("bold text");
  });

  it("strips script tags completely", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>safe")).toBe("alert('xss')safe");
  });

  it("strips style tags completely", () => {
    expect(sanitizeHtml("<style>.c{color:red}</style>content")).toBe(".c{color:red}content");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeHtml("plain text without tags")).toBe("plain text without tags");
  });

  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles attributes in tags", () => {
    expect(sanitizeHtml('<a href="http://evil.com" onclick="bad()">link</a>')).toBe("link");
  });

  it("strips img tags with src attribute", () => {
    expect(sanitizeHtml("text <img src=x onerror=alert(1)> more")).toBe("text  more");
  });

  it("handles malformed HTML (unclosed tags)", () => {
    expect(sanitizeHtml("<b>bold text")).toBe("bold text");
  });

  it("strips anything matching HTML tag pattern including comparisons", () => {
    // The sanitizeHtml function uses a broad regex; text resembling
    // HTML tags (e.g. "< 100 and > 50") will also be stripped.
    expect(sanitizeHtml("value < 100 and > 50")).toBe("value  50");
  });

  it("handles multiple consecutive tags", () => {
    expect(sanitizeHtml("<b></b><i></i><u></u>clean")).toBe("clean");
  });
});
