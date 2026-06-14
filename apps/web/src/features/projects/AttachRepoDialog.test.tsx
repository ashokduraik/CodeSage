import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/i18n";
import { AttachRepoDialog } from "./AttachRepoDialog";

vi.mock("./useAttachRepo", () => ({
  useAttachRepo: vi.fn(),
}));

import { useAttachRepo } from "./useAttachRepo";
const mockUseAttachRepo = vi.mocked(useAttachRepo);

const mutateAsync = vi.fn();

beforeEach(() => {
  mutateAsync.mockReset();
  mockUseAttachRepo.mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useAttachRepo>);
});

afterEach(cleanup);

describe("AttachRepoDialog", () => {
  it("renders nothing when closed", () => {
    render(<AttachRepoDialog open={false} projectId="p1" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the form when open", () => {
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText(/url/i)).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<AttachRepoDialog open projectId="p1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits with the correct payload and calls onClose on success", async () => {
    mutateAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    const onClose = vi.fn();
    render(<AttachRepoDialog open projectId="p1" onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        body: expect.objectContaining({ repoUrl: "https://github.com/org/repo" }),
      }),
    );
  });

  it("does not submit when repoUrl is blank", async () => {
    const onClose = vi.fn();
    render(<AttachRepoDialog open projectId="p1" onClose={onClose} />);
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it("includes the token in the payload when provided", async () => {
    mutateAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "https://github.com/org/private" },
    });
    fireEvent.change(screen.getByLabelText(/deploy token/i), {
      target: { value: "ghp_secret" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ token: "ghp_secret" }) }),
      ),
    );
  });

  it("shows an error message when the mutation fails", () => {
    mockUseAttachRepo.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useAttachRepo>);
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("disables the submit button while pending", () => {
    mockUseAttachRepo.mockReturnValue({
      mutateAsync,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useAttachRepo>);
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /attaching/i });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("changes provider via the select", async () => {
    mutateAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "gitlab" } });
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "https://gitlab.com/org/repo" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ provider: "gitlab" }) }),
      ),
    );
  });

  it("changes role via the select and submits with the chosen role", async () => {
    mutateAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: "frontend" } });
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "https://github.com/org/frontend" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ role: "frontend" }) }),
      ),
    );
  });

  it("defaults branch to 'main' when the branch field is cleared", async () => {
    mutateAsync.mockResolvedValue({ repo: {}, jobId: "j1" });
    render(<AttachRepoDialog open projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.change(screen.getByLabelText(/branch/i), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: /attach/i }).closest("form")!);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ branch: "main" }) }),
      ),
    );
  });
});
