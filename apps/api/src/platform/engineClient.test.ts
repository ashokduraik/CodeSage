import { describe, it, expect, vi, afterEach } from "vitest";
import { postEngineQueryStream } from "./engineClient";
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
  engineBaseUrl: "http://engine.test",
  webhookBaseUrl: "",
  workerStaleJobSeconds: 600,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postEngineQueryStream", () => {
  it("posts to the engine query endpoint and returns the response", async () => {
    const body = new ReadableStream();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const result = await postEngineQueryStream(CONFIG, {
      question: "where?",
      projectId: "11111111-1111-1111-1111-111111111111",
      audience: "developer",
      generateTitle: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://engine.test/engine/query",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
  });

  it("throws when the engine returns a non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fail", { status: 503 }));
    await expect(
      postEngineQueryStream(CONFIG, {
        question: "where?",
        projectId: "11111111-1111-1111-1111-111111111111",
        audience: "developer",
        generateTitle: false,
      }),
    ).rejects.toThrow("Engine query failed");
  });
});
