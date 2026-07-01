import { describe, it, expect, vi, afterEach } from "vitest";
import { postRagQueryStream } from "./ragClient";
import type { AppConfig } from "./config";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "test",
  logger: false,
  databaseUrl: "",
  jwtSecret: "secret",
  jwtTtl: "1h",
  encryptionKey: "",
  mockMode: false,
  ragBaseUrl: "http://rag.test",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postRagQueryStream", () => {
  it("posts to the RAG query endpoint and returns the response", async () => {
    const body = new ReadableStream();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const result = await postRagQueryStream(CONFIG, {
      question: "where?",
      projectId: "11111111-1111-1111-1111-111111111111",
      audience: "developer",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://rag.test/rag/query",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
  });

  it("throws when RAG returns a non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fail", { status: 503 }));
    await expect(
      postRagQueryStream(CONFIG, {
        question: "where?",
        projectId: "11111111-1111-1111-1111-111111111111",
        audience: "developer",
      }),
    ).rejects.toThrow("RAG query failed");
  });
});
