import { describe, it, expect, vi } from "vitest";
import {
  findReposByProject,
  findRepoByUrl,
  insertRepo,
  updateRepoWebhook,
  softDeleteRepo,
  setRepoConnecting,
} from "./repos.repository";
import type { Sql } from "../../platform/db";

function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
    unsafe: (v: unknown) => v,
  }) as unknown as Sql;
}

const MOCK_ROW = {
  id: "r1",
  project_id: "p1",
  repo_url: "https://github.com/org/repo",
  provider: "github",
  branch: "main",
  full_name: "org/repo",
  description: null,
  base_url: null,
  is_private: false,
  connection_status: "connecting",
  last_error: null,
  last_error_at: null,
  webhook_id: null,
  webhook_enabled: false,
  last_indexed_sha: null,
  last_indexed_at: null,
  primary_language: "TypeScript",
  status: "A",
  created_at: new Date(),
};

describe("findReposByProject", () => {
  it("returns repos with indexed file counts for the project", async () => {
    const db = makeMockSql([{ ...MOCK_ROW, indexed_file_count: 12 }]);
    const rows = await findReposByProject(db, "p1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexed_file_count).toBe(12);
  });
});

describe("insertRepo", () => {
  it("returns the created row", async () => {
    const db = makeMockSql([MOCK_ROW]);
    const result = await insertRepo(db, {
      projectId: "p1",
      repoUrl: "https://github.com/o/r",
      provider: "github",
      branch: "main",
      fullName: "o/r",
      description: null,
      baseUrl: null,
      isPrivate: false,
      tokenEnc: null,
      primaryLanguage: "Python",
    });
    expect(result.id).toBe("r1");
  });

  it("throws when INSERT returns no rows", async () => {
    const db = makeMockSql([]);
    await expect(
      insertRepo(db, {
        projectId: "p1",
        repoUrl: "https://github.com/o/r",
        provider: "github",
        branch: "main",
        fullName: "o/r",
        description: null,
        baseUrl: null,
        isPrivate: false,
        tokenEnc: null,
        primaryLanguage: null,
      }),
    ).rejects.toThrow("Unexpected empty result");
  });
});

describe("findRepoByUrl", () => {
  it("returns repo with secrets when found", async () => {
    const db = makeMockSql([{ ...MOCK_ROW, token_enc: null, webhook_secret_enc: null }]);
    const row = await findRepoByUrl(db, "https://github.com/org/repo");
    expect(row?.repo_url).toBe("https://github.com/org/repo");
  });
});

describe("updateRepoWebhook", () => {
  it("executes update without throwing", async () => {
    const db = makeMockSql([]);
    await expect(updateRepoWebhook(db, "r1", "99", "enc")).resolves.toBeUndefined();
  });
});

describe("setRepoConnecting", () => {
  it("executes update without throwing", async () => {
    const db = makeMockSql([]);
    await expect(setRepoConnecting(db, "r1")).resolves.toBeUndefined();
  });
});

describe("softDeleteRepo", () => {
  it("returns true when a row was soft-deleted", async () => {
    const db = makeMockSql([{ id: "r1" }]);
    expect(await softDeleteRepo(db, "p1", "r1")).toBe(true);
  });
});
