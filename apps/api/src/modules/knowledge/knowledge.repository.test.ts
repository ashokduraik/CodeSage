import { describe, expect, it, vi } from "vitest";
import {
  countAllKnowledgeEntries,
  listDataFlows,
  listPages,
  listPermissions,
  listWorkflows,
  projectExists,
} from "./knowledge.repository";

describe("knowledge.repository", () => {
  it("projectExists returns true when project row is active", async () => {
    const db = vi.fn().mockResolvedValue([{ exists: true }]);
    await expect(projectExists(db as never, "p1")).resolves.toBe(true);
    expect(db).toHaveBeenCalledOnce();
  });

  it("projectExists returns false when no active project", async () => {
    const db = vi.fn().mockResolvedValue([{ exists: false }]);
    await expect(projectExists(db as never, "p1")).resolves.toBe(false);
  });

  it("projectExists returns false when query returns no rows", async () => {
    const db = vi.fn().mockResolvedValue([]);
    await expect(projectExists(db as never, "p1")).resolves.toBe(false);
  });

  it("countAllKnowledgeEntries sums active rows across tables", async () => {
    const db = vi.fn().mockResolvedValue([{ total: 9 }]);
    await expect(countAllKnowledgeEntries(db as never)).resolves.toBe(9);
    expect(db).toHaveBeenCalledOnce();
  });

  it("listWorkflows queries active project workflows", async () => {
    const rows = [{ id: "w1", name: "checkout", steps: [], confidence: "0.5", source_refs: [] }];
    const db = vi.fn().mockResolvedValue(rows);
    await expect(listWorkflows(db as never, "p1")).resolves.toEqual(rows);
  });

  it("listPages queries active project page map rows", async () => {
    const rows = [
      {
        id: "p1",
        route: "/home",
        components: [],
        data_sources: [],
        confidence: "0.5",
        source_refs: [],
      },
    ];
    const db = vi.fn().mockResolvedValue(rows);
    await expect(listPages(db as never, "p1")).resolves.toEqual(rows);
  });

  it("listPermissions queries active permission rules", async () => {
    const rows = [
      {
        id: "r1",
        target: "/admin",
        required_permission: "admin",
        confidence: "0.5",
        source_refs: [],
      },
    ];
    const db = vi.fn().mockResolvedValue(rows);
    await expect(listPermissions(db as never, "p1")).resolves.toEqual(rows);
  });

  it("listDataFlows queries active data flow rows", async () => {
    const rows = [
      {
        id: "f1",
        page_ref: "/orders",
        source_chain: [],
        freshness_type: "cached",
        confidence: "0.5",
        source_refs: [],
      },
    ];
    const db = vi.fn().mockResolvedValue(rows);
    await expect(listDataFlows(db as never, "p1")).resolves.toEqual(rows);
  });
});
