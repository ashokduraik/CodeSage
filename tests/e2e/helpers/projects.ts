import { expect, type Locator, type Page } from "@playwright/test";

import { e2eEnv } from "./env";

/** Options for attaching a repository through the UI. */
export interface AttachRepoViaUiOptions {
  /** Git access token when the repo probe requires authentication. */
  token?: string;
  /** Branch to select on the confirm step (defaults to `E2E_REPO_BRANCH`). */
  branch?: string;
}

/**
 * Builds a unique project name for one E2E run.
 *
 * @returns Name like `E2E-1710000000000`.
 */
export function generateE2eProjectName(): string {
  return `E2E-${Date.now()}`;
}

/**
 * Locates the top-level project card on `/projects`.
 *
 * @param page - Authenticated page.
 * @param projectName - Visible project title.
 */
export function projectCard(page: Page, projectName: string): Locator {
  return page.locator("ul.space-y-3 > li").filter({ hasText: projectName }).first();
}

/**
 * Locates repo cards nested under one project card.
 *
 * @param card - Project card locator.
 */
export function repoCardsInProject(card: Locator): Locator {
  return card.locator("ul.border-t > li");
}

/**
 * Returns the Connect Repository dialog locator.
 *
 * @param page - Authenticated page.
 */
export function attachRepoDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Connect Repository" });
}

/**
 * Navigates using a primary sidebar link.
 *
 * @param page - Authenticated page.
 * @param label - Link text (`Dashboard`, `Projects`, …).
 */
export async function navigateViaSidebar(page: Page, label: string): Promise<void> {
  await page.getByRole("link", { name: label, exact: true }).click();
}

/**
 * Opens the New Project dialog on `/projects`.
 *
 * @param page - Authenticated page.
 */
export async function openNewProjectDialog(page: Page): Promise<void> {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("dialog", { name: "Create Project" })).toBeVisible();
}

/**
 * Asserts the Create Project dialog is still open.
 *
 * @param page - Authenticated page.
 */
export async function expectCreateProjectDialogOpen(page: Page): Promise<void> {
  await expect(page.getByRole("dialog", { name: "Create Project" })).toBeVisible();
}

/**
 * Submits the create-project form (may be empty for negative tests).
 *
 * @param page - Page with create dialog open.
 * @param name - Project name; omit or pass empty to test validation.
 */
export async function submitCreateProject(page: Page, name = ""): Promise<void> {
  await page.locator("#project-name").fill(name);
  if (!name.trim()) {
    await page
      .getByRole("dialog", { name: "Create Project" })
      .locator("form")
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
    return;
  }
  await page.getByRole("button", { name: "Create" }).click();
}

/**
 * Creates a project through the New Project dialog.
 *
 * @param page - Page on or navigable to `/projects`.
 * @param name - Project name to submit.
 * @returns Created project id and name from the API response.
 */
export async function createProjectViaUi(
  page: Page,
  name: string,
): Promise<{ id: string; name: string }> {
  await openNewProjectDialog(page);

  const createResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/projects") &&
      !res.url().includes("/repos"),
  );

  await submitCreateProject(page, name);

  const response = await createResponse;
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { id?: string; data?: { id?: string } };
  const id = body.id ?? body.data?.id;
  if (!id) {
    throw new Error("Create project response missing id");
  }

  await expect(page.getByRole("dialog", { name: "Create Project" })).toBeHidden();
  await expect(projectCard(page, name)).toBeVisible();
  return { id, name };
}

/**
 * Opens Attach Repo for one project.
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 */
export async function openAttachRepoDialog(page: Page, projectName: string): Promise<void> {
  const card = projectCard(page, projectName);
  await card.getByRole("button", { name: "Attach Repo" }).click();
  await expect(attachRepoDialog(page)).toBeVisible();
}

/**
 * Fills the repository URL and clicks Connect on the URL step.
 *
 * @param page - Page with attach dialog open.
 * @param url - Repository clone URL.
 */
export async function submitAttachRepoUrl(page: Page, url: string): Promise<void> {
  const dialog = attachRepoDialog(page);
  await dialog.locator("#repo-url").fill(url);
  if (!url.trim()) {
    await dialog.locator("form").first().evaluate((form) => (form as HTMLFormElement).requestSubmit());
    return;
  }
  await dialog.getByRole("button", { name: "Connect" }).click();
  await waitForAttachProbeSettled(page);
}

/**
 * Waits until the URL-step probe finishes (spinner gone or next step visible).
 *
 * @param page - Page with attach dialog open.
 */
export async function waitForAttachProbeSettled(page: Page): Promise<void> {
  const dialog = attachRepoDialog(page);
  const connecting = dialog.getByRole("button", { name: /Connecting/i });
  if (await connecting.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(connecting).toBeHidden({ timeout: 30_000 });
  }
}

/**
 * Closes the attach-repo dialog (Escape).
 *
 * @param page - Authenticated page.
 */
export async function closeAttachRepoDialog(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(attachRepoDialog(page)).toBeHidden();
}

/**
 * Asserts the attach dialog is still on the URL step (no branch confirm yet).
 *
 * @param page - Authenticated page.
 */
export async function expectAttachRepoUrlStep(page: Page): Promise<void> {
  const dialog = attachRepoDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Repository URL")).toBeVisible();
  await expect(dialog.getByText("Branch")).toHaveCount(0);
}

/**
 * Asserts an error alert is shown in the attach dialog.
 *
 * @param page - Authenticated page.
 * @param pattern - Text or regex expected in the alert.
 */
export async function expectAttachRepoError(
  page: Page,
  pattern: RegExp | string,
): Promise<void> {
  const dialog = attachRepoDialog(page);
  await expect(dialog.getByRole("alert")).toContainText(pattern, { timeout: 30_000 });
}

/**
 * Asserts the attach dialog is on the access-token step.
 *
 * @param page - Authenticated page.
 */
export async function expectAttachTokenStep(page: Page): Promise<void> {
  const dialog = attachRepoDialog(page);
  await expect(dialog.getByLabel("Access Token")).toBeVisible({ timeout: 15_000 });
}

/**
 * Submits the token step (empty token allowed for negative tests).
 *
 * @param page - Page on token step.
 * @param token - Access token text.
 */
export async function submitAttachToken(page: Page, token: string): Promise<void> {
  const dialog = attachRepoDialog(page);
  const tokenInput = dialog.locator("#repo-token");
  if (!token.trim()) {
    // HTML `required` blocks a truly empty submit; whitespace reaches JS trim validation + alert.
    await tokenInput.fill(" ");
  } else {
    await tokenInput.fill(token);
  }
  await dialog.getByRole("button", { name: "Continue" }).click();
}

/**
 * Completes the attach confirm step.
 *
 * @param page - Page on confirm step.
 * @param branch - Optional branch name to select.
 */
export async function completeAttachRepoConfirm(page: Page, branch?: string): Promise<void> {
  const dialog = attachRepoDialog(page);
  await expect(dialog.getByText("Branch")).toBeVisible({ timeout: 30_000 });

  const selectedBranch = branch ?? e2eEnv.repoBranch;
  if (selectedBranch) {
    const branchRadio = dialog.getByRole("radio", { name: selectedBranch });
    if (await branchRadio.isVisible().catch(() => false)) {
      await branchRadio.check();
    }
  }

  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/**
 * Runs probe + optional token + confirm for one repository URL.
 *
 * @param page - Page on `/projects` with project visible.
 * @param repoUrl - Clone URL.
 * @param options - Token and branch overrides.
 */
export async function runAttachRepoFlow(
  page: Page,
  repoUrl: string,
  options: AttachRepoViaUiOptions = {},
): Promise<void> {
  await submitAttachRepoUrl(page, repoUrl);

  const dialog = attachRepoDialog(page);
  const tokenInput = dialog.locator("#repo-token");
  if (await tokenInput.isVisible({ timeout: 15_000 }).catch(() => false)) {
    const token = options.token ?? e2eEnv.githubToken;
    if (!token) {
      throw new Error("Repository requires a token — set E2E_GITHUB_TOKEN in tests/e2e/.env");
    }
    await submitAttachToken(page, token);
  }

  await completeAttachRepoConfirm(page, options.branch);
}

/**
 * Attaches one repository to a project via the Connect Repository dialog.
 *
 * @param page - Page on `/projects` with the project visible.
 * @param projectName - Project card title.
 * @param repoUrl - Clone URL to attach.
 * @param options - Optional token and branch override.
 */
export async function attachRepoViaUi(
  page: Page,
  projectName: string,
  repoUrl: string,
  options: AttachRepoViaUiOptions = {},
): Promise<void> {
  await openAttachRepoDialog(page, projectName);
  await runAttachRepoFlow(page, repoUrl, options);
}

/**
 * Attaches the default public repository (no token).
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 */
export async function attachPublicRepoViaUi(page: Page, projectName: string): Promise<void> {
  await attachRepoViaUi(page, projectName, e2eEnv.publicRepoUrl);
}

/**
 * Attaches the configured private repository with token.
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 */
export async function attachPrivateRepoViaUi(page: Page, projectName: string): Promise<void> {
  await attachRepoViaUi(page, projectName, e2eEnv.privateRepoUrl, {
    token: e2eEnv.githubToken,
  });
}

/**
 * Asserts a project lists the expected number of attached repos with live status badges.
 *
 * @param page - Authenticated page.
 * @param projectName - Project card title.
 * @param repoCount - Expected repo card count.
 */
export async function expectProjectReposAttached(
  page: Page,
  projectName: string,
  repoCount: number,
): Promise<void> {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  const card = projectCard(page, projectName);
  await expect(card).toBeVisible();

  const repos = repoCardsInProject(card);
  await expect(repos).toHaveCount(repoCount);

  for (let i = 0; i < repoCount; i += 1) {
    const repo = repos.nth(i);
    await expect(repo.getByText(/Connected|Indexing/).first()).toBeVisible();
  }
}

/**
 * Opens the indexing logs dialog for one repo under a project.
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 * @param repoIndex - Zero-based repo index under the project.
 */
export async function openIndexingLogsForRepo(
  page: Page,
  projectName: string,
  repoIndex: number,
): Promise<void> {
  const card = projectCard(page, projectName);
  const repo = repoCardsInProject(card).nth(repoIndex);
  await repo.getByRole("button", { name: "Indexing logs" }).click();
}

/**
 * Asserts the indexing logs dialog is open for the given repo.
 *
 * @param page - Page with logs dialog open.
 * @param repoNameOrUrl - Substring expected in the dialog subtitle.
 */
export async function expectIndexingLogsDialog(
  page: Page,
  repoNameOrUrl: string,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Indexing Logs" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(repoNameOrUrl)).toBeVisible();

  const empty = dialog.getByText(/No indexing activity yet/i);
  const logRow = dialog.locator("article").first();
  await expect(empty.or(logRow)).toBeVisible({ timeout: 15_000 });
}

/**
 * Closes the indexing logs dialog.
 *
 * @param page - Page with logs dialog open.
 */
export async function closeIndexingLogsDialog(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Indexing Logs" });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Clicks Re-index on one repo card.
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 * @param repoIndex - Zero-based repo index.
 */
export async function clickReindexForRepo(
  page: Page,
  projectName: string,
  repoIndex: number,
): Promise<void> {
  const card = projectCard(page, projectName);
  const repo = repoCardsInProject(card).nth(repoIndex);
  await repo.getByRole("button", { name: "Re-index" }).click();
}

/**
 * Asserts the open-repository link on a repo card points at the expected URL.
 *
 * @param page - Page on `/projects`.
 * @param projectName - Project card title.
 * @param repoIndex - Zero-based repo index.
 * @param expectedUrl - Expected clone URL (normalized comparison).
 */
export async function expectOpenRepoLink(
  page: Page,
  projectName: string,
  repoIndex: number,
  expectedUrl: string,
): Promise<void> {
  const card = projectCard(page, projectName);
  const repo = repoCardsInProject(card).nth(repoIndex);
  const link = repo.getByRole("link", { name: "Open repository" });
  const href = await link.getAttribute("href");
  expect(normalizeRepoUrl(href ?? "")).toBe(normalizeRepoUrl(expectedUrl));
}

/**
 * Asserts the dashboard lists a project in Recent Projects with the repo count.
 *
 * @param page - Authenticated page.
 * @param projectName - Project title.
 * @param repoCount - Expected attached repo count.
 */
export async function expectProjectOnDashboard(
  page: Page,
  projectName: string,
  repoCount: number,
): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const recentSection = page
    .locator("div.rounded-xl.border")
    .filter({ has: page.getByRole("heading", { name: "Recent Projects" }) });
  await expect(recentSection.getByText(projectName)).toBeVisible();
  await expect(recentSection.getByText(new RegExp(`${repoCount}\\s+repos?`, "i"))).toBeVisible();
}

/**
 * Strips trailing `.git` for stable URL comparison.
 *
 * @param url - Repository clone URL.
 */
function normalizeRepoUrl(url: string): string {
  return url.replace(/\.git\/?$/, "");
}
