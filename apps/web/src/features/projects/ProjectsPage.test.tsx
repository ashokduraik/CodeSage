import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { ProjectsPage } from "./ProjectsPage";

vi.mock("./useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("./CreateProjectDialog", () => ({
  CreateProjectDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog" data-testid="create-dialog"><button onClick={onClose}>close-create</button></div> : null,
}));
vi.mock("./AttachRepoDialog", () => ({
  AttachRepoDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog" data-testid="attach-dialog"><button onClick={onClose}>close-attach</button></div> : null,
}));

import { useProjects } from "./useProjects";
const mockUseProjects = vi.mocked(useProjects);

const PROJECTS = [
  { id: "p1", name: "Acme Frontend", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "p2", name: "Acme API", status: "indexing", createdAt: "2026-01-02T00:00:00.000Z" },
];

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProjectsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ProjectsPage", () => {
  it("shows a spinner while loading", () => {
    mockUseProjects.mockReturnValue({ isPending: true, isError: false, data: undefined } as ReturnType<typeof useProjects>);
    renderPage();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows an error message when the query fails", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: true, data: undefined } as ReturnType<typeof useProjects>);
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows an empty state when there are no projects", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: [] } as ReturnType<typeof useProjects>);
    renderPage();
    expect(screen.getByText("No projects yet. Connect your first repository.")).toBeTruthy();
  });

  it("renders the list of projects when data is available", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: PROJECTS } as ReturnType<typeof useProjects>);
    renderPage();
    expect(screen.getByText("Acme Frontend")).toBeTruthy();
    expect(screen.getByText("Acme API")).toBeTruthy();
  });

  it("opens the create dialog when New Project is clicked", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: [] } as ReturnType<typeof useProjects>);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByTestId("create-dialog")).toBeTruthy();
  });

  it("closes the create dialog when onClose is called", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: [] } as ReturnType<typeof useProjects>);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.click(screen.getByRole("button", { name: "close-create" }));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it("opens the attach repo dialog when Attach Repo is clicked", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: PROJECTS } as ReturnType<typeof useProjects>);
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /attach repo/i })[0]!);
    expect(screen.getByTestId("attach-dialog")).toBeTruthy();
  });

  it("closes the attach dialog when onClose is called", () => {
    mockUseProjects.mockReturnValue({ isPending: false, isError: false, data: PROJECTS } as ReturnType<typeof useProjects>);
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /attach repo/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "close-attach" }));
    expect(screen.queryByTestId("attach-dialog")).toBeNull();
  });
});
