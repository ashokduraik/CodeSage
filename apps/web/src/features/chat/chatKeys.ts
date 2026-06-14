/** Query-key factory for chat data, keeping cache keys consistent across hooks. */
export const chatKeys = {
  sessions: ["chat", "sessions"] as const,
  session: (id: string) => ["chat", "session", id] as const,
  messages: (id: string) => ["chat", "messages", id] as const,
  projects: ["chat", "projects"] as const,
};
