import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepoTokenHelp } from "./RepoTokenHelp";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { provider?: string; returnObjects?: boolean }) => {
      if (key === "projects.repoTokenHelp.title") {
        return `Get a ${opts?.provider ?? ""} access token`;
      }
      if (key === "projects.repoTokenHelp.github.label") {
        return "GitHub";
      }
      if (key.endsWith(".steps") && opts?.returnObjects) {
        return ["step one", "step two"];
      }
      return key;
    },
  }),
}));

describe("RepoTokenHelp", () => {
  it("renders GitHub token help", () => {
    render(<RepoTokenHelp provider="github" />);
    expect(screen.getByText(/GitHub access token/i)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toContain("github.com");
  });
});
