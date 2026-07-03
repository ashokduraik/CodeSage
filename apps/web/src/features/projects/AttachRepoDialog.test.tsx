import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/i18n";
import { AttachRepoDialog } from "./AttachRepoDialog";

vi.mock("./useAttachRepo", () => ({
  useAttachRepo: vi.fn(),
}));

vi.mock("./useProbeRepo", () => ({
  useProbeRepo: vi.fn(),
}));

import { useAttachRepo } from "./useAttachRepo";
import { useProbeRepo } from "./useProbeRepo";

const mockUseAttachRepo = vi.mocked(useAttachRepo);
const mockUseProbeRepo = vi.mocked(useProbeRepo);

const attachAsync = vi.fn();
const probeAsync = vi.fn();

const PROBE_OK = {
  provider: "github" as const,
  fullName: "org/repo",
  baseUrl: "https://github.com",
  defaultBranch: "main",
  branches: ["main", "dev"],
  description: "README text",
  isPrivate: false,
  authRequired: false,
  notFound: false,
};

beforeEach(() => {
  attachAsync.mockReset();
  probeAsync.mockReset();
  mockUseAttachRepo.mockReturnValue({
    mutateAsync: attachAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAttachRepo>);
  mockUseProbeRepo.mockReturnValue({
    mutateAsync: probeAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useProbeRepo>);
});

afterEach(cleanup);

describe("AttachRepoDialog", () => {
  it("renders nothing when closed", () => {
    render(<AttachRepoDialog open={false} projectId="p1" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("advances to confirm step for a public repo", async () => {
    probeAsync.mockResolvedValue(PROBE_OK);
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/repository url/i), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => expect(screen.getByText("org/repo")).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
  });

  it("shows token step when auth is required", async () => {
    probeAsync.mockResolvedValue({ ...PROBE_OK, authRequired: true, branches: [] });
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/repository url/i), {
      target: { value: "https://github.com/org/private" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => expect(screen.getByLabelText(/access token/i)).toBeTruthy());
  });

  it("calls attach and closes on confirm", async () => {
    probeAsync.mockResolvedValue(PROBE_OK);
    attachAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    const onClose = vi.fn();
    render(<AttachRepoDialog open projectId="p1" onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/repository url/i), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => screen.getByText("org/repo"), { timeout: 3000 });
    const connectButtons = screen.getAllByRole("button", { name: /^connect$/i });
    fireEvent.click(connectButtons[connectButtons.length - 1]!);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce(), { timeout: 3000 });
    expect(attachAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        body: expect.objectContaining({ repoUrl: "https://github.com/org/repo", branch: "main" }),
      }),
    );
  });
});
