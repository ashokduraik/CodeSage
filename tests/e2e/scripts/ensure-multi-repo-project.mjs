/**
 * Idempotent find-or-create for the Phase 2 multi-repo E2E project.
 */
import {
  attachRepo,
  createProject,
  getProject,
  listProjects,
  listRepos,
  login,
  normalizeApiBase,
  reposFullyIndexed,
  waitForIndexed,
} from "./e2e-api.mjs";

/**
 * @typedef {object} EnsureMultiRepoResult
 * @property {boolean} skipped
 * @property {string} [projectId]
 * @property {string} [projectName]
 * @property {string} [frontendPath]
 * @property {string} [backendPath]
 */

/**
 * Finds an indexed multi-repo project or creates one when fixture URLs are configured.
 *
 * @returns {Promise<EnsureMultiRepoResult>}
 */
export async function ensureMultiRepoProject() {
  const apiBase = normalizeApiBase(process.env.E2E_API_URL);
  const email = process.env.E2E_DEV_EMAIL ?? "dev@codesage.dev";
  const password = process.env.E2E_DEV_PASSWORD ?? "dev123";
  const frontendUrl = process.env.E2E_FRONTEND_REPO_URL;
  const backendUrl = process.env.E2E_BACKEND_REPO_URL;
  const projectName = process.env.E2E_MULTI_REPO_PROJECT_NAME ?? "E2E Multi-Repo";
  const frontendPath = process.env.E2E_MULTI_REPO_FRONTEND_PATH ?? "src/api.ts";
  const backendPath = process.env.E2E_MULTI_REPO_BACKEND_PATH ?? "src/routes.ts";
  const configuredProjectId = process.env.E2E_MULTI_REPO_PROJECT_ID;
  const branch = process.env.E2E_REPO_BRANCH ?? "main";
  const token = process.env.E2E_GITHUB_TOKEN ?? "";
  const pollMs = Number(process.env.E2E_SEED_POLL_MS ?? "5000");
  const timeoutMs = Number(process.env.E2E_SEED_TIMEOUT_MS ?? "900000");

  if (!frontendUrl || !backendUrl) {
    return { skipped: true };
  }

  const jwt = await login(apiBase, email, password);
  const attachOptions = { branch, token: token || undefined };

  /** @type {string | undefined} */
  let projectId = configuredProjectId;

  if (projectId) {
    await getProject(jwt, apiBase, projectId);
    console.log(`Using configured project ${projectId}`);
  } else {
    const projects = await listProjects(jwt, apiBase);
    const existing = projects.find((p) => p.name === projectName);
    if (existing) {
      projectId = existing.id;
      console.log(`Found existing project "${projectName}" (${projectId})`);
    }
  }

  if (!projectId) {
    const created = await createProject(jwt, apiBase, projectName);
    projectId = created.id ?? created.data?.id;
    if (!projectId) {
      throw new Error("Create project response missing id");
    }
    console.log(`Created project "${projectName}" (${projectId})`);
  }

  let repos = await listRepos(jwt, apiBase, projectId);

  if (repos.length < 1) {
    await attachRepo(jwt, apiBase, projectId, frontendUrl, attachOptions);
    console.log(`Attached frontend: ${frontendUrl}`);
    repos = await listRepos(jwt, apiBase, projectId);
  }

  if (repos.length < 2) {
    await attachRepo(jwt, apiBase, projectId, backendUrl, attachOptions);
    console.log(`Attached backend: ${backendUrl}`);
    repos = await listRepos(jwt, apiBase, projectId);
  }

  if (!reposFullyIndexed(repos)) {
    await waitForIndexed(jwt, apiBase, projectId, { pollMs, timeoutMs });
  } else {
    console.log("Multi-repo project already indexed.");
  }

  return {
    skipped: false,
    projectId,
    projectName,
    frontendPath,
    backendPath,
  };
}
