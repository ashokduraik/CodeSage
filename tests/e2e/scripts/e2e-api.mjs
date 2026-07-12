/**
 * Shared HTTP helpers for E2E seed and prerequisites scripts.
 */

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function normalizeApiBase(raw) {
  return (raw ?? "http://localhost:3000/api").replace(/\/$/, "");
}

/**
 * @param {string} apiBase
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function apiRequest(apiBase, path, init = {}) {
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

/**
 * @param {string} apiBase
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function login(apiBase, email, password) {
  const body = await apiRequest(apiBase, "/auth/login", {
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
 * @param {string} apiBase
 * @returns {Promise<Array<{ id: string; name: string }>>}
 */
export async function listProjects(jwt, apiBase) {
  const body = await apiRequest(apiBase, "/projects", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return Array.isArray(body) ? body : body?.data ?? [];
}

/**
 * @param {string} jwt
 * @param {string} apiBase
 * @param {string} projectId
 */
export async function getProject(jwt, apiBase, projectId) {
  return apiRequest(apiBase, `/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

/**
 * @param {string} jwt
 * @param {string} apiBase
 * @param {string} name
 */
export async function createProject(jwt, apiBase, name) {
  return apiRequest(apiBase, "/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name }),
  });
}

/**
 * @param {string} jwt
 * @param {string} apiBase
 * @param {string} projectId
 * @param {string} repoUrl
 * @param {{ branch?: string; token?: string }} [options]
 */
export async function attachRepo(jwt, apiBase, projectId, repoUrl, options = {}) {
  const payload = { repoUrl, branch: options.branch ?? "main" };
  if (options.token) {
    payload.token = options.token;
  }
  return apiRequest(apiBase, `/projects/${projectId}/repos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(payload),
  });
}

/**
 * @param {string} jwt
 * @param {string} apiBase
 * @param {string} projectId
 * @returns {Promise<Array<{ lastIndexedAt?: string | null }>>}
 */
export async function listRepos(jwt, apiBase, projectId) {
  const body = await apiRequest(apiBase, `/projects/${projectId}/repos`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return Array.isArray(body) ? body : body?.data ?? [];
}

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} jwt
 * @param {string} apiBase
 * @param {string} projectId
 * @param {{ pollMs?: number; timeoutMs?: number; minRepos?: number }} [options]
 */
export async function waitForIndexed(jwt, apiBase, projectId, options = {}) {
  const pollMs = options.pollMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 900_000;
  const minRepos = options.minRepos ?? 2;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await listRepos(jwt, apiBase, projectId);
    if (rows.length >= minRepos && rows.every((row) => row.lastIndexedAt != null)) {
      return rows;
    }
    console.log(
      `Waiting for indexing… ${rows.filter((r) => r.lastIndexedAt).length}/${rows.length} repos ready`,
    );
    await sleep(pollMs);
  }
  throw new Error(
    `Indexing did not complete within ${timeoutMs}ms — ensure RAG is running (npm run dev:engine).`,
  );
}

/**
 * @param {Array<{ lastIndexedAt?: string | null }>} repos
 * @param {number} [minRepos]
 */
export function reposFullyIndexed(repos, minRepos = 2) {
  return repos.length >= minRepos && repos.every((row) => row.lastIndexedAt != null);
}
