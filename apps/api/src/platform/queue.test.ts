import { describe, it, expect, vi } from "vitest";
import {
  cancelPendingJobsForProject,
  cancelPendingJobsForRepo,
  enqueueJob,
  findActiveJobsForRepo,
  hasActiveJobsWithinStaleWindow,
  isJobYoungerThanStaleThreshold,
  SUPERSEDED_JOB_MESSAGE,
} from "./queue";
import { API_SYSTEM_USER_ID } from "./serviceUsers";
import type { Sql } from "./db";

/** Builds a tagged-template-compatible mock that returns the provided rows. */
function makeMockSql(rows: unknown[]): Sql {
  const sql = Object.assign(
    vi.fn().mockResolvedValue(rows),
    {
      end: vi.fn(),
      json: (v: unknown) => v,
    },
  ) as unknown as Sql;
  return sql;
}

describe("enqueueJob", () => {
  it("inserts a job row and returns its id", async () => {
    const db = makeMockSql([{ id: "abc-123" }]);
    const id = await enqueueJob(db, "sync", { repoId: "repo-1" }, API_SYSTEM_USER_ID);
    expect(id).toBe("abc-123");
    expect(db).toHaveBeenCalledOnce();
  });

  it("passes the json-encoded payload to postgres", async () => {
    const payload = { repoId: "r1", sinceSha: "abc" };
    const db = makeMockSql([{ id: "job-1" }]);
    await enqueueJob(db, "parse", payload, API_SYSTEM_USER_ID);
    expect(db).toHaveBeenCalledOnce();
  });

  it("throws when the INSERT returns an empty result set", async () => {
    const db = makeMockSql([]);
    await expect(
      enqueueJob(db, "embed", { repoId: "r1", chunkIds: [] }, API_SYSTEM_USER_ID),
    ).rejects.toThrow("Unexpected empty result");
  });
});

describe("findActiveJobsForRepo", () => {
  it("returns pending and running rows for a repository", async () => {
    const rows = [
      {
        id: "j1",
        job_status: "pending",
        created_at: new Date("2026-01-01T00:00:00Z"),
        locked_at: null,
      },
    ];
    const db = makeMockSql(rows);
    const result = await findActiveJobsForRepo(db, "repo-1");
    expect(result).toEqual(rows);
    expect(db).toHaveBeenCalledOnce();
  });
});

describe("cancelPendingJobsForRepo", () => {
  it("soft-deletes pending rows for repoId", async () => {
    const db = makeMockSql([{ id: "j1" }, { id: "j2" }]);
    const count = await cancelPendingJobsForRepo(db, "repo-1", API_SYSTEM_USER_ID);
    expect(count).toBe(2);
    expect(db).toHaveBeenCalledOnce();
    expect(SUPERSEDED_JOB_MESSAGE).toContain("Superseded");
  });
});

describe("cancelPendingJobsForProject", () => {
  it("soft-deletes pending xrepo and distill rows for projectId", async () => {
    const db = makeMockSql([{ id: "j1" }]);
    const count = await cancelPendingJobsForProject(db, "project-1", API_SYSTEM_USER_ID);
    expect(count).toBe(1);
    expect(db).toHaveBeenCalledOnce();
  });
});

describe("re-index stale window helpers", () => {
  it("isJobYoungerThanStaleThreshold uses created_at when locked_at is null", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    const job = {
      id: "j1",
      job_status: "pending",
      created_at: new Date("2026-07-04T11:55:00Z"),
      locked_at: null,
    };
    expect(isJobYoungerThanStaleThreshold(job, 600, now)).toBe(true);
    expect(isJobYoungerThanStaleThreshold(job, 60, now)).toBe(false);
  });

  it("hasActiveJobsWithinStaleWindow returns false when jobs are old enough", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    const jobs = [
      {
        id: "j1",
        job_status: "running",
        created_at: new Date("2026-07-04T11:00:00Z"),
        locked_at: new Date("2026-07-04T11:00:00Z"),
      },
    ];
    expect(hasActiveJobsWithinStaleWindow(jobs, 600, now)).toBe(false);
  });
});
