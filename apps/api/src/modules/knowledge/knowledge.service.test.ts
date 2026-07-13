import { describe, expect, it, vi } from "vitest";
import {
  getDataFlows,
  getPages,
  getPermissions,
  getWorkflows,
} from "./knowledge.service";

vi.mock("./knowledge.repository", () => ({
  projectExists: vi.fn(),
  listWorkflows: vi.fn(),
  listPages: vi.fn(),
  listPermissions: vi.fn(),
  listDataFlows: vi.fn(),
}));

import {
  listDataFlows,
  listPages,
  listPermissions,
  listWorkflows,
  projectExists,
} from "./knowledge.repository";

const mockProjectExists = vi.mocked(projectExists);
const mockListWorkflows = vi.mocked(listWorkflows);
const mockListPages = vi.mocked(listPages);
const mockListPermissions = vi.mocked(listPermissions);
const mockListDataFlows = vi.mocked(listDataFlows);

const PROJECT_ID = "a0000001-0000-4000-8000-000000000001";
const DB = {} as never;

describe("knowledge.service", () => {
  it("getWorkflows maps database rows to API shape", async () => {
    mockProjectExists.mockResolvedValue(true);
    mockListWorkflows.mockResolvedValue([
      {
        id: "a0000001-0000-4000-8000-000000000099",
        name: "checkout",
        steps: [{ order: 1 }],
        confidence: "0.75",
        source_refs: [{ kind: "file", path: "src/checkout.ts" }],
      },
    ]);

    const rows = await getWorkflows(DB, PROJECT_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("checkout");
    expect(rows[0]?.confidence).toBe(0.75);
    expect(rows[0]?.sourceRefs).toEqual([{ kind: "file", path: "src/checkout.ts" }]);
  });

  it("getPages maps database rows to API shape", async () => {
    mockProjectExists.mockResolvedValue(true);
    mockListPages.mockResolvedValue([
      {
        id: "a0000001-0000-4000-8000-000000000098",
        route: "/checkout",
        components: [{ name: "CheckoutPage" }],
        data_sources: [{ method_path: "GET /api/checkout" }],
        confidence: "0.7",
        source_refs: [{ kind: "file", path: "src/pages/checkout.tsx" }],
      },
    ]);

    const rows = await getPages(DB, PROJECT_ID);
    expect(rows[0]?.route).toBe("/checkout");
    expect(rows[0]?.dataSources).toEqual([{ method_path: "GET /api/checkout" }]);
  });

  it("getPermissions maps database rows to API shape", async () => {
    mockProjectExists.mockResolvedValue(true);
    mockListPermissions.mockResolvedValue([
      {
        id: "a0000001-0000-4000-8000-000000000097",
        target: "/admin",
        required_permission: "admin",
        confidence: "0.8",
        source_refs: [{ kind: "file", path: "src/guards/admin.ts" }],
      },
    ]);

    const rows = await getPermissions(DB, PROJECT_ID);
    expect(rows[0]?.requiredPermission).toBe("admin");
  });

  it("getDataFlows maps database rows to API shape", async () => {
    mockProjectExists.mockResolvedValue(true);
    mockListDataFlows.mockResolvedValue([
      {
        id: "a0000001-0000-4000-8000-000000000096",
        page_ref: "/orders",
        source_chain: [{ hop: "GET /api/orders" }],
        freshness_type: "cached",
        confidence: "0.65",
        source_refs: [{ kind: "file", path: "src/orders.ts" }],
      },
    ]);

    const rows = await getDataFlows(DB, PROJECT_ID);
    expect(rows[0]?.pageRef).toBe("/orders");
    expect(rows[0]?.freshnessType).toBe("cached");
  });

  it("getWorkflows throws when project is missing", async () => {
    mockProjectExists.mockResolvedValue(false);
    await expect(getWorkflows(DB, PROJECT_ID)).rejects.toThrow("PROJECT_NOT_FOUND");
  });

  it("getPages throws when project is missing", async () => {
    mockProjectExists.mockResolvedValue(false);
    await expect(getPages(DB, PROJECT_ID)).rejects.toThrow("PROJECT_NOT_FOUND");
  });
});
