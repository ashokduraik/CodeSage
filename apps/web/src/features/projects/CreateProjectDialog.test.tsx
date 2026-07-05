import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/i18n";
import { CreateProjectDialog } from "./CreateProjectDialog";

vi.mock("./useCreateProject", () => ({
  useCreateProject: vi.fn(),
}));

import { useCreateProject } from "./useCreateProject";
const mockUseCreateProject = vi.mocked(useCreateProject);

const mutateAsync = vi.fn();

beforeEach(() => {
  mutateAsync.mockReset();
  mockUseCreateProject.mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCreateProject>);
});

afterEach(cleanup);

describe("CreateProjectDialog", () => {
  it("renders nothing when closed", () => {
    render(<CreateProjectDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the form when open", async () => {
    render(<CreateProjectDialog open onClose={vi.fn()} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(await screen.findByLabelText(/name/i)).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<CreateProjectDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits the form and calls onClose on success", async () => {
    mutateAsync.mockResolvedValue({
      id: "p1",
      name: "Acme",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const onClose = vi.fn();
    render(<CreateProjectDialog open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Acme" } });
    fireEvent.submit(screen.getByRole("button", { name: /create/i }).closest("form")!);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mutateAsync).toHaveBeenCalledWith({ name: "Acme" });
  });

  it("does not submit when the name is blank", async () => {
    const onClose = vi.fn();
    render(<CreateProjectDialog open onClose={onClose} />);
    fireEvent.submit(screen.getByRole("button", { name: /create/i }).closest("form")!);
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });

  it("shows an error message when the mutation fails", () => {
    mockUseCreateProject.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useCreateProject>);
    render(<CreateProjectDialog open onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("disables the submit button while pending", () => {
    mockUseCreateProject.mockReturnValue({
      mutateAsync,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useCreateProject>);
    render(<CreateProjectDialog open onClose={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /creating/i });
    expect(btn).toHaveProperty("disabled", true);
  });
});
