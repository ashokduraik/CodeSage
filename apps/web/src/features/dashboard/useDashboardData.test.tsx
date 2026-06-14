import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import { resetMockStore } from "@/shared/mock";
import { useDashboardData } from "./useDashboardData";

beforeEach(() => resetMockStore());
afterEach(() => resetMockStore());

describe("useDashboardData", () => {
  it("aggregates projects, sessions and stats", async () => {
    const { result } = renderHook(() => useDashboardData(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.projects.length).toBeGreaterThan(0);
    expect(result.current.data?.sessions.length).toBeGreaterThan(0);
    expect(result.current.data?.stats.projectCount).toBe(result.current.data?.projects.length);
  });
});
