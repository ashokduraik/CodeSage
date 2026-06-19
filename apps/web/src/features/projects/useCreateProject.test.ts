import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useCreateProject } from "./useCreateProject";
import { HookWrapper } from "@/test/utils";

vi.mock("./projectsClient", () => ({
  createProjectRequest: vi.fn(),
}));

import { createProjectRequest } from "./projectsClient";

const mockCreate = vi.mocked(createProjectRequest);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useCreateProject", () => {
  it("calls createProjectRequest and returns the created project", async () => {
    const project = { id: "p1", name: "Acme", status: "active" as const, repoCount: 0, createdAt: "2026-01-01T00:00:00.000Z" };
    mockCreate.mockResolvedValue(project);
    const { result } = renderHook(() => useCreateProject(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate({ name: "Acme" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(project);
    expect(mockCreate).toHaveBeenCalledWith({ name: "Acme" });
  });

  it("exposes an error state when the mutation fails", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));
    const { result } = renderHook(() => useCreateProject(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate({ name: "Bad" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("API error");
  });
});
