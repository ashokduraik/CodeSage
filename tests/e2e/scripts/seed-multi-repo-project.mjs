#!/usr/bin/env node
/**
 * Creates a multi-repo E2E project, attaches fixture repos, and polls until indexed.
 *
 * Requires a running CodeSage stack and hosted clone URLs for the fixture trees.
 * See tests/e2e/fixtures/README.md.
 */
import process from "node:process";

const apiBase = (process.env.E2E_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const email = process.env.E2E_DEV_EMAIL ?? "dev@codesage.local";
const password = process.env.E2E_DEV_PASSWORD ?? "dev-password";
const frontendUrl = process.env.E2E_FRONTEND_REPO_URL;
const backendUrl = process.env.E2E_BACKEND_REPO_URL;
const branch = process.env.E2E_REPO_BRANCH ?? "main";
const token = process.env.E2E_GITHUB_TOKEN ?? "";
const pollMs = Number(process.env.E2E_SEED_POLL_MS ?? "5000");
const timeoutMs = Number(process.env.E2E_SEED_TIMEOUT_MS ?? "900000");

if (!frontendUrl || !backendUrl) {
  console.error(
    "Set E2E_FRONTEND_REPO_URL and E2E_BACKEND_REPO_URL (hosted Git clone URLs).",
  );
  process.exit(1);
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return body;
}

async function login() {
  const body = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!body?.token) {
    throw new Error("Login response missing token");
  }
  return body.token;
}

/**
 * @param {string} jwt
 * @param {string} name
 */
async function createProject(jwt, name) {
  return api("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name }),
  });
}

/**
 * @param {string} jwt
 * @param {string} projectId
 * @param {string} repoUrl
 */
async function attachRepo(jwt, projectId, repoUrl) {
  const payload = { repoUrl, branch };
  if (token) {
    payload.token = token;
  }
  return api(`/projects/${projectId}/repos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(payload),
  });
}

/**
 * @param {string} jwt
 * @param {string} projectId
 */
async function listRepos(jwt, projectId) {
  return api(`/projects/${projectId}/repos`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIndexed(jwt, projectId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const repos = await listRepos(jwt, projectId);
    const rows = Array.isArray(repos) ? repos : repos?.data ?? [];
    if (rows.length >= 2 && rows.every((row) => row.lastIndexedAt != null)) {
      return rows;
    }
    console.log(
      `Waiting for indexing… ${rows.filter((r) => r.lastIndexedAt).length}/${rows.length} repos ready`,
    );
    await sleep(pollMs);
  }
  throw new Error(`Indexing did not complete within ${timeoutMs}ms`);
}

async function main() {
  console.log(`API: ${apiBase}`);
  const jwt = await login();
  console.log("Logged in as dev user");

  const project = await createProject(jwt, "E2E Multi-Repo");
  const projectId = project.id ?? project.data?.id;
  if (!projectId) {
    throw new Error("Create project response missing id");
  }
  console.log(`Created project ${projectId}`);

  await attachRepo(jwt, projectId, frontendUrl);
  console.log(`Attached frontend: ${frontendUrl}`);
  await attachRepo(jwt, projectId, backendUrl);
  console.log(`Attached backend: ${backendUrl}`);

  await waitForIndexed(jwt, projectId);
  console.log("Both repos indexed (xrepo should have run for multi-repo projects).");
  console.log("");
  console.log(`E2E_MULTI_REPO_PROJECT_ID=${projectId}`);
  console.log("E2E_MULTI_REPO_FRONTEND_PATH=src/api.ts");
  console.log("E2E_MULTI_REPO_BACKEND_PATH=src/routes.ts");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
