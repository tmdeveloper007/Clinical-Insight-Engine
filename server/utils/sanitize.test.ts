import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("returns normal text unchanged", () => {
    expect(sanitizeHtml("Hello world")).toBe("Hello world");
    expect(sanitizeHtml("Patient name: John Doe")).toBe("Patient name: John Doe");
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips basic HTML tags", () => {
    expect(sanitizeHtml("<p>Hello</p>")).toBe("Hello");
    expect(sanitizeHtml("<div>Content</div>")).toBe("Content");
    expect(sanitizeHtml("<span>nested</span>")).toBe("nested");
  });

  it("strips nested HTML tags", () => {
    expect(sanitizeHtml("<div><p>Hello <b>world</b></p></div>")).toBe(
      "Hello world"
    );
    expect(sanitizeHtml("<ul><li>Item 1</li><li>Item 2</li></ul>")).toBe(
      "Item 1Item 2"
    );
  });

  it("strips mixed content and preserves surrounding text", () => {
    expect(sanitizeHtml("Hello <b>world</b>")).toBe("Hello world");
    expect(sanitizeHtml("Name: <em>John</em> Age: 45")).toBe(
      "Name: John Age: 45"
    );
  });

  it("handles edge cases: self-closing and malformed tags", () => {
    expect(sanitizeHtml("text<br/>more")).toBe("textmore");
    expect(sanitizeHtml("text<br>more")).toBe("textmore");
    // < > is stripped: space between < and > makes > the closing bracket
    expect(sanitizeHtml("< > angle brackets")).toBe(" angle brackets");
  });

  it("handles multiple consecutive tags", () => {
    expect(sanitizeHtml("<p></p><p></p>")).toBe("");
    expect(sanitizeHtml("<div>A</div><span>B</span><p>C</p>")).toBe("ABC");
  });
});
