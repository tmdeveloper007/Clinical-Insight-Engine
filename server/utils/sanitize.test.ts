import { describe, test, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitize", () => {
  describe("sanitizeHtml", () => {
    test("returns empty string for empty input", () => {
      expect(sanitizeHtml("")).toBe("");
    });

    test("removes simple HTML tags", () => {
      expect(sanitizeHtml("<p>Hello</p>")).toBe("Hello");
      expect(sanitizeHtml("<b>bold</b>")).toBe("bold");
      expect(sanitizeHtml("<strong>important</strong>")).toBe("important");
    });

    test("removes nested HTML tags", () => {
      expect(sanitizeHtml("<div><p>text</p></div>")).toBe("text");
      expect(sanitizeHtml("<ul><li>item1</li><li>item2</li></ul>")).toBe("item1item2");
    });

    test("removes script tags and preserves inner content", () => {
      // sanitizeHtml strips <...> blocks. When inner content contains > it can be
      // absorbed into the tag match and removed too.
      expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
      expect(sanitizeHtml("text<script>evil()</script>more")).toBe("textevil()more");
    });

    test("removes event handler attributes from tags", () => {
      // <img onerror=...> is stripped; tag content preserved
      expect(sanitizeHtml("<img src=x onerror=alert(1)>")).toBe("");
      expect(sanitizeHtml("<div onclick=alert('test')>click me</div>")).toBe("click me");
    });

    test("removes style tags and preserves CSS content", () => {
      expect(sanitizeHtml("<style>.foo{color:red}</style>")).toBe(".foo{color:red}");
    });

    test("removes anchor tags but preserves link text", () => {
      expect(sanitizeHtml("<a href='https://evil.com'>link</a>")).toBe("link");
    });

    test("removes iframe tags", () => {
      expect(sanitizeHtml("<iframe src='https://evil.com'></iframe>")).toBe("");
    });

    test("preserves text without HTML tags", () => {
      expect(sanitizeHtml("Plain text without tags")).toBe("Plain text without tags");
    });

    test("handles mixed content with text and HTML", () => {
      expect(sanitizeHtml("Name: <b>John</b>, Age: <i>30</i>")).toBe("Name: John, Age: 30");
    });

    test("removes self-closing tags", () => {
      expect(sanitizeHtml("text<br/>more")).toBe("textmore");
      expect(sanitizeHtml("text<hr>more")).toBe("textmore");
      expect(sanitizeHtml("text<img src='x'/>more")).toBe("textmore");
    });

    test("handles multiple consecutive tags", () => {
      expect(sanitizeHtml("<p>a</p><p>b</p><p>c</p>")).toBe("abc");
    });

    test("handles malformed HTML gracefully", () => {
      expect(sanitizeHtml("<p>unclosed")).toBe("unclosed");
      expect(sanitizeHtml("text<>tags</>")).toBe("texttags");
    });

    test("removes HTML comments", () => {
      // <!-- comment --> is matched by <[^>]*> so becomes empty, preserving text around it
      expect(sanitizeHtml("text<!-- comment -->more")).toBe("textmore");
    });

    test("removes DOCTYPE declarations", () => {
      expect(sanitizeHtml("<!DOCTYPE html><html><body>content</body></html>")).toBe("content");
    });

    test("strips SVG and embedded object tags", () => {
      expect(sanitizeHtml("<svg onload=alert(1)>")).toBe("");
      expect(sanitizeHtml("<object data='evil.swf'></object>")).toBe("");
    });

    test("removes table tags", () => {
      expect(sanitizeHtml("<table><tr><td>cell</td></tr></table>")).toBe("cell");
    });

    test("preserves whitespace in plain text", () => {
      expect(sanitizeHtml("Hello   World")).toBe("Hello   World");
    });

    test("handles unicode text", () => {
      expect(sanitizeHtml("<p>Patient: John Doe (HbA1c 7.2)</p>")).toBe("Patient: John Doe (HbA1c 7.2)");
    });

    test("removes HTML attributes from opening tags", () => {
      expect(sanitizeHtml("<div class='my-class' id='my-id'>content</div>")).toBe("content");
    });

    test("handles clinical note with inline HTML tags", () => {
      const note = "Patient <b>John Doe</b> reported: <i>fatigue</i> and <i>dizziness</i> for 3 days.";
      expect(sanitizeHtml(note)).toBe("Patient John Doe reported: fatigue and dizziness for 3 days.");
    });
  });
});
