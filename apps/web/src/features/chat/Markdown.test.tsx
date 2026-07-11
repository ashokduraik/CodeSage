import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders headings as elements rather than raw hashes", () => {
    render(<Markdown content={"### Key Components\n\nSome text"} />);
    const heading = screen.getByRole("heading", { name: "Key Components" });
    expect(heading).toBeTruthy();
    expect(heading.textContent).not.toContain("#");
  });

  it("renders bold text without literal asterisks", () => {
    render(<Markdown content={"This is **important** now"} />);
    const strong = screen.getByText("important");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders unordered lists", () => {
    render(<Markdown content={"- one\n- two"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders ordered lists", () => {
    render(<Markdown content={"1. first\n2. second"} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it("renders inline code", () => {
    render(<Markdown content={"call `getMinEmi` here"} />);
    const code = screen.getByText("getMinEmi");
    expect(code.tagName).toBe("CODE");
  });

  it("renders fenced code blocks inside a pre", () => {
    render(<Markdown content={"```ts\nconst x = 1;\n```"} />);
    const code = screen.getByText(/const x = 1;/);
    expect(code.closest("pre")).not.toBeNull();
  });

  it("renders links with safe target and rel", () => {
    render(<Markdown content={"[docs](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders GFM tables", () => {
    render(<Markdown content={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeTruthy();
  });

  it("sanitizes raw HTML script tags", () => {
    const { container } = render(
      <Markdown content={"ok <script>alert('x')</script> done"} />,
    );
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders blockquotes and horizontal rules", () => {
    const { container } = render(<Markdown content={"> quoted\n\n---"} />);
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();
  });
});
