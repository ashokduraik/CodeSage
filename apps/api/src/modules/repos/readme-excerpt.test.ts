import { describe, it, expect } from "vitest";
import { extractReadmeFirstSection } from "./readme-excerpt";

describe("extractReadmeFirstSection", () => {
  it("returns the paragraph after the title until the next heading", () => {
    const readme = `# Prepayment Advisor

A personal side project for loan EMI tracking.

## Features

- Item one`;

    expect(extractReadmeFirstSection(readme)).toBe(
      "A personal side project for loan EMI tracking.",
    );
  });

  it("strips HTML markup and keeps the intro text", () => {
    const readme = `<p align="center">
  <img width="100px" src="splash_land.png">
</p>

<h1 align="center">Prepayment Advisor</h1>

<p align="center">
  A personal side project — cross-platform app for loan EMI tracking.
</p>

<h2>Features</h2>
<p>More content here.</p>`;

    expect(extractReadmeFirstSection(readme)).toBe(
      "A personal side project — cross-platform app for loan EMI tracking.",
    );
  });

  it("returns empty string for image-only README openings", () => {
    const readme = `![badge](https://img.shields.io/badge/x-y)

## Features`;

    expect(extractReadmeFirstSection(readme)).toBe("");
  });
});
