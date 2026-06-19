/**
 * Static mock dataset served when MOCK_MODE=true.
 *
 * Mirrors apps/web/src/shared/mock/data.ts so the frontend receives the same
 * rich sample data whether it is driving the mock API layer or the real API in
 * mock mode. Kept in sync manually — these values are intentionally stable
 * demo/test fixtures, not production data.
 */
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];
type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];

/** Fixed reference instant so seeded relative timestamps stay stable. */
const BASE = Date.parse("2026-06-14T12:00:00.000Z");

/** Returns an ISO-8601 UTC string {@link minutes} before the fixed base instant. */
function minutesAgo(minutes: number): string {
  return new Date(BASE - minutes * 60_000).toISOString();
}

/** Sample projects spanning all indexing lifecycle states. */
export const MOCK_PROJECTS: readonly Project[] = [
  {
    id: "p1",
    name: "acme/storefront",
    status: "indexed",
    repoCount: 3,
    createdAt: minutesAgo(1440),
  },
  {
    id: "p2",
    name: "acme/billing-service",
    status: "indexing",
    repoCount: 1,
    createdAt: minutesAgo(1200),
  },
  {
    id: "p3",
    name: "acme/identity",
    status: "stale",
    repoCount: 2,
    createdAt: minutesAgo(960),
  },
  {
    id: "p4",
    name: "acme/mobile-app",
    status: "connecting",
    repoCount: 1,
    createdAt: minutesAgo(720),
  },
];

/** Sample chat sessions, most-recent first. */
export const MOCK_SESSIONS: readonly ChatSession[] = [
  {
    id: "s1",
    title: "Auth flow questions",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
    messageCount: 4,
    lastMessageAt: minutesAgo(12),
  },
  {
    id: "s2",
    title: "How do I export invoices?",
    mode: "end_user",
    projectId: "p2",
    projectName: "acme/billing-service",
    messageCount: 2,
    lastMessageAt: minutesAgo(180),
  },
  {
    id: "s3",
    title: "General architecture",
    mode: "developer",
    projectId: null,
    projectName: null,
    messageCount: 0,
    lastMessageAt: null,
  },
];

/** Aggregate dashboard counters derived from the sample data. */
export const MOCK_STATS: DashboardStats = {
  projectCount: MOCK_PROJECTS.length,
  indexedProjectCount: MOCK_PROJECTS.filter((p) => p.status === "indexed").length,
  sessionCount: MOCK_SESSIONS.length,
  knowledgeCount: 18,
  pendingReviewCount: 2,
};
