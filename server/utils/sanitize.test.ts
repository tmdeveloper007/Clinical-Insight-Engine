import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeHtml("Hello World")).toBe("Hello World");
    expect(sanitizeHtml("Simple text without HTML")).toBe("Simple text without HTML");
  });

  it("removes a single HTML tag", () => {
    expect(sanitizeHtml("<b>Bold</b>")).toBe("Bold");
  });

  it("removes multiple HTML tags", () => {
    expect(sanitizeHtml("<p>Paragraph</p><br><span>Span</span>")).toBe("ParagraphSpan");
  });

  it("removes nested HTML tags", () => {
    expect(sanitizeHtml("<div><p>Nested <strong>deep</strong></p></div>")).toBe("Nested deep");
  });

  it("removes script tags (security-relevant)", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
  });

  it("removes img tags with src attributes", () => {
    expect(sanitizeHtml('text <img src="x" onerror="alert(1)"> more')).toBe("text  more");
  });

  it("removes on* event handler attributes", () => {
    expect(sanitizeHtml('<div onclick="evil()">Click me</div>')).toBe("Click me");
  });

  it("handles mixed text and HTML", () => {
    expect(sanitizeHtml("Hello <b>World</b>!")).toBe("Hello World!");
  });

  it("removes all angle-bracketed substrings", () => {
    expect(sanitizeHtml("a < b > c")).toBe("a  c");
    expect(sanitizeHtml("before <tag> after")).toBe("before  after");
  });

  it("handles strings with no angle brackets", () => {
    expect(sanitizeHtml("No HTML here")).toBe("No HTML here");
  });

  it("handles already-sanitized content", () => {
    expect(sanitizeHtml("Already clean")).toBe("Already clean");
  });
});
