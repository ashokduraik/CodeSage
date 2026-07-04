import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  API_SYSTEM_USER_ID,
  RAG_WORKER_USER_ID,
  WEBHOOK_HANDLER_USER_ID,
  actorIdFromRequest,
  assertServiceUsersExist,
  isServiceUserId,
  isServiceUserRole,
  resolveActorId,
  resolveServiceUser,
} from "./serviceUsers";
import type { Sql } from "./db";

function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

describe("serviceUsers", () => {
  it("resolveServiceUser returns distinct fixed UUIDs per component", () => {
    expect(resolveServiceUser("api")).toBe(API_SYSTEM_USER_ID);
    expect(resolveServiceUser("rag")).toBe(RAG_WORKER_USER_ID);
    expect(resolveServiceUser("webhook")).toBe(WEBHOOK_HANDLER_USER_ID);
  });

  it("isServiceUserId recognizes seeded service account ids", () => {
    expect(isServiceUserId(API_SYSTEM_USER_ID)).toBe(true);
    expect(isServiceUserId("00000000-0000-0000-0000-000000000099")).toBe(false);
  });

  it("isServiceUserRole matches system role only", () => {
    expect(isServiceUserRole("system")).toBe(true);
    expect(isServiceUserRole("admin")).toBe(false);
  });

  it("resolveActorId prefers human actor over service fallback", () => {
    const human = "11111111-1111-4111-a111-111111111111";
    expect(resolveActorId(human)).toBe(human);
    expect(resolveActorId(undefined, "webhook")).toBe(WEBHOOK_HANDLER_USER_ID);
    expect(resolveActorId(undefined, "api")).toBe(API_SYSTEM_USER_ID);
  });

  it("actorIdFromRequest returns sub when JWT is present", () => {
    const request = { user: { sub: "u1", email: "a@b.com", role: "admin" } } as FastifyRequest;
    expect(actorIdFromRequest(request)).toBe("u1");
    expect(actorIdFromRequest(undefined)).toBeUndefined();
  });

  it("assertServiceUsersExist passes when all service users exist", async () => {
    const db = makeMockSql([
      { id: API_SYSTEM_USER_ID, role: "system" },
      { id: RAG_WORKER_USER_ID, role: "system" },
      { id: WEBHOOK_HANDLER_USER_ID, role: "system" },
    ]);
    await expect(assertServiceUsersExist(db)).resolves.toBeUndefined();
  });

  it("assertServiceUsersExist throws when a service user is missing", async () => {
    const db = makeMockSql([{ id: API_SYSTEM_USER_ID, role: "system" }]);
    await expect(assertServiceUsersExist(db)).rejects.toThrow(/missing after migration/);
  });

  it("assertServiceUsersExist throws when role is not system", async () => {
    const db = makeMockSql([
      { id: API_SYSTEM_USER_ID, role: "admin" },
      { id: RAG_WORKER_USER_ID, role: "system" },
      { id: WEBHOOK_HANDLER_USER_ID, role: "system" },
    ]);
    await expect(assertServiceUsersExist(db)).rejects.toThrow(/expected system/);
  });
});
