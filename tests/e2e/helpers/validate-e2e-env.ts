/** Required E2E env keys and human-readable descriptions for error output. */
const REQUIRED_ENV: ReadonlyArray<{ key: string; description: string }> = [
  {
    key: "E2E_PRIVATE_REPO_URL",
    description: "Private Git clone URL for attach tests (your private repo)",
  },
  {
    key: "E2E_GITHUB_TOKEN",
    description: "Read-only token for the private repo",
  },
];

/** Default engine base URL (matches apps/api ENGINE_BASE_URL). */
export const DEFAULT_E2E_ENGINE_URL = "http://127.0.0.1:8001";

/**
 * Returns env var names that are missing or blank.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function missingRequiredE2eEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.E2E_SKIP === "1") {
    return [];
  }

  return REQUIRED_ENV.filter(({ key }) => !env[key]?.trim()).map(({ key }) => key);
}

/**
 * Whether global-setup must fail when the engine reports no planner tool support.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function isAgentQaRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.E2E_AGENT_QA_REQUIRED === "1";
}

/**
 * Resolves the engine origin used for `/health` plannerTools checks.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function e2eEngineUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.E2E_ENGINE_URL?.trim() || DEFAULT_E2E_ENGINE_URL;
}

/**
 * Validates required E2E variables. Prints a clear error block and throws when incomplete.
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export function validateE2eEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.E2E_SKIP === "1") {
    console.log("E2E skipped (E2E_SKIP=1)");
    return;
  }

  const missing = missingRequiredE2eEnv(env);
  if (missing.length === 0) {
    return;
  }

  const lines = [
    "",
    "E2E configuration error — missing required variables in tests/e2e/.env:",
    "",
  ];

  for (const { key, description } of REQUIRED_ENV) {
    if (missing.includes(key)) {
      lines.push(`  ${key.padEnd(22)} ${description}`);
    }
  }

  lines.push(
    "",
    "Copy tests/e2e/.env.example → tests/e2e/.env and set both values.",
    "Public repo uses built-in default (octocat/Hello-World); override with E2E_PUBLIC_REPO_URL if needed.",
    "",
    "See tests/e2e/README.md",
    "",
  );

  console.error(lines.join("\n"));
  throw new Error("E2E env incomplete");
}

/**
 * Fetches engine `/health` and returns whether planner tool calling is supported.
 *
 * @param engineUrl - Engine base URL (no trailing path required).
 * @returns `true` when `plannerTools` is `ok`.
 */
export async function fetchPlannerToolsOk(engineUrl: string): Promise<boolean> {
  const url = `${engineUrl.replace(/\/$/, "")}/health`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Engine health HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { plannerTools?: string };
  return body.plannerTools === "ok";
}

/**
 * When `E2E_AGENT_QA_REQUIRED=1`, fails fast if the engine lacks tool-calling support.
 *
 * Soft-skips are handled in journey specs when this flag is unset (default).
 *
 * @param env - Environment map (defaults to `process.env`).
 */
export async function validateAgentQaToolSupport(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.E2E_SKIP === "1" || !isAgentQaRequired(env)) {
    return;
  }

  const engineUrl = e2eEngineUrl(env);
  let toolsOk = false;
  try {
    toolsOk = await fetchPlannerToolsOk(engineUrl);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      [
        "",
        "E2E_AGENT_QA_REQUIRED=1 — engine health check failed:",
        `  ${engineUrl}/health (${detail})`,
        "",
        "Start the engine (`npm run dev:engine`) with a tool-calling LLM.",
        "See apps/engine/README.md (planner tool calling / plannerTools).",
        "",
      ].join("\n"),
    );
    throw new Error("E2E agent QA required but engine health failed");
  }

  if (!toolsOk) {
    console.error(
      [
        "",
        "E2E_AGENT_QA_REQUIRED=1 — engine reports plannerTools: unsupported.",
        "",
        "Agent QA E2E needs an OpenAI-compatible model that accepts `tools`.",
        "See apps/engine/README.md (planner tool calling).",
        `Health: ${engineUrl}/health`,
        "",
      ].join("\n"),
    );
    throw new Error("E2E agent QA required but planner tools unsupported");
  }
}
