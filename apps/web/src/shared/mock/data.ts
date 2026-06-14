import type { ChatMessage, ChatSession, DashboardStats, Project } from "./types";

/** Fixed reference instant so seeded relative timestamps stay stable in stories/tests. */
const BASE = Date.parse("2026-06-14T12:00:00.000Z");

/** Returns an ISO-8601 UTC string `minutes` before the fixed base instant. */
function minutesAgo(minutes: number): string {
  return new Date(BASE - minutes * 60_000).toISOString();
}

/** Seed projects spanning the indexing lifecycle states. */
export const SEED_PROJECTS: readonly Project[] = [
  { id: "p1", name: "acme/storefront", status: "indexed", repoCount: 3, language: "TypeScript" },
  { id: "p2", name: "acme/billing-service", status: "indexing", repoCount: 1, language: "Python" },
  { id: "p3", name: "acme/identity", status: "stale", repoCount: 2, language: "Go" },
  { id: "p4", name: "acme/mobile-app", status: "connecting", repoCount: 1, language: null },
];

/** Seed chat sessions, most-recent first. */
export const SEED_SESSIONS: readonly ChatSession[] = [
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

/** Seed messages keyed by session id. */
export const SEED_MESSAGES: Readonly<Record<string, readonly ChatMessage[]>> = {
  s1: [
    { id: "m1", sessionId: "s1", role: "user", content: "Where is the login handler defined?" },
    {
      id: "m2",
      sessionId: "s1",
      role: "assistant",
      content: "The login handler lives in the auth module and validates credentials before issuing a session token.",
      confidence: 0.9,
      sources: ["acme/storefront/src/auth/login.ts", "acme/storefront/src/auth/session.ts"],
      needsReview: false,
    },
  ],
  s2: [
    { id: "m3", sessionId: "s2", role: "user", content: "How do I export invoices?" },
    {
      id: "m4",
      sessionId: "s2",
      role: "assistant",
      content: "Open Billing, choose a date range, then use Export. A CSV is generated within a few minutes.",
      confidence: 0.6,
      sources: [],
      needsReview: true,
    },
  ],
};

/** Aggregate dashboard counters derived from (and beyond) the seed data. */
export const SEED_STATS: DashboardStats = {
  projectCount: SEED_PROJECTS.length,
  indexedProjectCount: SEED_PROJECTS.filter((p) => p.status === "indexed").length,
  sessionCount: SEED_SESSIONS.length,
  knowledgeCount: 18,
  pendingReviewCount: 2,
};
