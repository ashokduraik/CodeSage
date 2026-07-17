/** Stable public GitHub repo for attach-without-token. Override via E2E_PUBLIC_REPO_URL. */
export const DEFAULT_PUBLIC_REPO_URL = "https://github.com/octocat/Hello-World.git";

/**
 * Probe target for invalid-URL attach tests.
 * Uses an unreachable host so probe fails without a token (GitHub 404 without
 * auth is treated as private → token step, not an error alert).
 */
export const INVALID_REPO_URL =
  "https://gitlab.invalid/codesage-e2e-does-not-exist/invalid-repo.git";

/** Shared E2E environment variables. */
export const e2eEnv = {
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:5173",
  apiUrl: process.env.E2E_API_URL ?? "http://localhost:3000/api",
  engineUrl: process.env.E2E_ENGINE_URL?.trim() || "http://127.0.0.1:8001",
  devEmail: process.env.E2E_DEV_EMAIL ?? "dev@codesage.dev",
  devPassword: process.env.E2E_DEV_PASSWORD ?? "dev123",
  publicRepoUrl: process.env.E2E_PUBLIC_REPO_URL?.trim() || DEFAULT_PUBLIC_REPO_URL,
  privateRepoUrl: process.env.E2E_PRIVATE_REPO_URL?.trim() ?? "",
  githubToken: process.env.E2E_GITHUB_TOKEN?.trim() ?? "",
  repoBranch: process.env.E2E_REPO_BRANCH ?? "main",
} as const;

/** When set, journey specs are skipped (stack checks still optional in global-setup). */
export const skipLiveStack = process.env.E2E_SKIP === "1";
