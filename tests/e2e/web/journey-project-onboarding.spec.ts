import { expect, test } from "@playwright/test";

import { loginViaUi } from "../helpers/auth";
import { e2eEnv, INVALID_REPO_URL, skipLiveStack } from "../helpers/env";
import {
  attachPrivateRepoViaUi,
  attachPublicRepoViaUi,
  clickReindexForRepo,
  closeIndexingLogsDialog,
  closeAttachRepoDialog,
  createProjectViaUi,
  deleteProjectViaUi,
  expectAttachRepoError,
  expectAttachRepoUrlStep,
  expectAttachTokenStep,
  expectCreateProjectDialogOpen,
  expectIndexingLogsDialog,
  expectOpenRepoLink,
  expectProjectOnDashboard,
  expectProjectReposAttached,
  generateE2eProjectName,
  navigateViaSidebar,
  openAttachRepoDialog,
  openIndexingLogsForRepo,
  openNewProjectDialog,
  projectCard,
  repoCardsInProject,
  repoSubtitleFromUrl,
  submitAttachRepoUrl,
  submitAttachToken,
  submitCreateProject,
} from "../helpers/projects";

test.describe("Journey: project onboarding via UI", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(skipLiveStack, "E2E_SKIP=1 — live-stack journey specs disabled");

  let projectName: string;

  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await navigateViaSidebar(page, "Projects");
    await expect(page).toHaveURL("/projects");
  });

  test("project creation rejects empty name", async ({ page }) => {
    await openNewProjectDialog(page);
    await submitCreateProject(page, "");
    await expectCreateProjectDialogOpen(page);
    await expect(page.getByRole("dialog", { name: "Create Project" })).toBeVisible();
  });

  test("project creation succeeds", async ({ page }) => {
    projectName = generateE2eProjectName();
    await createProjectViaUi(page, projectName);
    await expect(projectCard(page, projectName)).toBeVisible();
  });

  test("attach rejects empty repository URL", async ({ page }) => {
    await openAttachRepoDialog(page, projectName);
    await submitAttachRepoUrl(page, "");
    await expectAttachRepoUrlStep(page);
  });

  test("attach rejects invalid repository URL", async ({ page }) => {
    await openAttachRepoDialog(page, projectName);
    await submitAttachRepoUrl(page, INVALID_REPO_URL);
    await expectAttachRepoError(
      page,
      /Repository not found|Could not reach the repository/i,
    );
    await expectAttachRepoUrlStep(page);
    await closeAttachRepoDialog(page);
  });

  test("attach public repo succeeds", async ({ page }) => {
    await attachPublicRepoViaUi(page, projectName);
    await expectProjectReposAttached(page, projectName, 1);
  });

  test("private attach rejects missing token", async ({ page }) => {
    await openAttachRepoDialog(page, projectName);
    await submitAttachRepoUrl(page, e2eEnv.privateRepoUrl);
    await expectAttachTokenStep(page);
    await submitAttachToken(page, "");
    await expectAttachRepoError(page, /Enter an access token/i);
    await expectAttachTokenStep(page);
    await closeAttachRepoDialog(page);
  });

  test("attach private repo succeeds", async ({ page }) => {
    await attachPrivateRepoViaUi(page, projectName);
    await expectProjectReposAttached(page, projectName, 2);
  });

  test("repo actions and dashboard", async ({ page }) => {
    test.setTimeout(180_000);

    const publicUrl = e2eEnv.publicRepoUrl;

    await openIndexingLogsForRepo(page, projectName, 0);
    await expectIndexingLogsDialog(page, repoSubtitleFromUrl(publicUrl));
    await closeIndexingLogsDialog(page);

    await clickReindexForRepo(page, projectName, 0);
    const card = projectCard(page, projectName);
    const firstRepo = repoCardsInProject(card).nth(0);
    const reindexAlert = firstRepo.getByRole("alert");
    if (await reindexAlert.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(reindexAlert).toContainText(/progress|try again|Could not/i);
    }

    await expectOpenRepoLink(page, projectName, 0, publicUrl);

    await navigateViaSidebar(page, "Dashboard");
    await expectProjectOnDashboard(page, projectName, 2);

    await navigateViaSidebar(page, "Projects");
    await expect(projectCard(page, projectName)).toBeVisible();
    await expect(repoCardsInProject(projectCard(page, projectName))).toHaveCount(2);
  });

  test("deletes created project", async ({ page }) => {
    await deleteProjectViaUi(page, projectName);
  });
});
