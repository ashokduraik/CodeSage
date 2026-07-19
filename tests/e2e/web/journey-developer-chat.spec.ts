import { expect, test } from "@playwright/test";

import { loginViaUi } from "../helpers/auth";
import {
  countAssistantReplies,
  expectAssistantReply,
  expectCitation,
  expectNeedsReview,
  sendChatMessage,
  startDeveloperChat,
} from "../helpers/chat";
import { e2eEnv, skipLiveStack } from "../helpers/env";
import {
  attachPublicRepoViaUi,
  createProjectViaUi,
  deleteProjectViaUi,
  generateE2eProjectName,
  navigateViaSidebar,
  waitForRepoIndexed,
} from "../helpers/projects";
import { fetchPlannerToolsOk } from "../helpers/validate-e2e-env";

/** Soft-skip when the live LLM rejects OpenAI-compatible tool schemas. */
const plannerToolsOk = skipLiveStack
  ? false
  : await fetchPlannerToolsOk(e2eEnv.engineUrl).catch(() => false);

test.describe("Journey: developer chat (agent QA)", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(skipLiveStack, "E2E_SKIP=1 — live-stack journey specs disabled");
  test.skip(
    !skipLiveStack && !plannerToolsOk,
    "LLM lacks tool calling (plannerTools unsupported) — see apps/engine/README.md",
  );

  let projectId: string;
  let projectName: string;

  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
  });

  test("creates project and waits for public repo Indexed", async ({ page }) => {
    test.setTimeout(360_000);

    await navigateViaSidebar(page, "Projects");
    await expect(page).toHaveURL("/projects");

    projectName = generateE2eProjectName();
    const created = await createProjectViaUi(page, projectName);
    projectId = created.id;

    await attachPublicRepoViaUi(page, projectName);
    await waitForRepoIndexed(page, projectName, 300_000);
  });

  test("starts developer chat", async ({ page }) => {
    await startDeveloperChat(page, projectId);
    await expect(page.getByLabel("Ask about your codebase…")).toBeVisible();
  });

  test("asks code question and shows citation", async ({ page }) => {
    test.setTimeout(180_000);

    // Default octocat/Hello-World has no indexable .ts/.js — citations cannot appear.
    test.skip(
      /hello-world/i.test(e2eEnv.publicRepoUrl),
      "Set E2E_PUBLIC_REPO_URL to a small public JS/TS repo for citation assertions (Hello-World is README-only)",
    );

    await startDeveloperChat(page, projectId);
    await sendChatMessage(page, "What files are in this repository?");
    await expectCitation(page, ".", 120_000);
  });

  test("follow-up turn keeps the same conversation", async ({ page }) => {
    test.setTimeout(180_000);

    await startDeveloperChat(page, projectId);
    await sendChatMessage(page, "What files are in this repository?");
    await expectAssistantReply(page, 120_000);

    await sendChatMessage(page, "Summarize the main purpose of those files.");
    await expectAssistantReply(page, 120_000);

    expect(await countAssistantReplies(page)).toBeGreaterThanOrEqual(2);
  });

  test("vague follow-up after cited answer does not abstain", async ({ page }) => {
    test.setTimeout(240_000);

    await startDeveloperChat(page, projectId);
    await sendChatMessage(page, "What files are in this repository?");
    await expectCitation(page, ".", 120_000);
    await expectAssistantReply(page, 120_000);

    await sendChatMessage(page, "I don't understand the second point from above");
    await expectAssistantReply(page, 120_000);

    expect(await countAssistantReplies(page)).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/Low confidence|needs review|couldn't find enough evidence/i)).toHaveCount(
      0,
    );
  });

  test("nonsense question shows review or abstain", async ({ page }) => {
    test.setTimeout(180_000);

    await startDeveloperChat(page, projectId);
    await sendChatMessage(
      page,
      "What is the quantum flux capacitor voltage in xyzzy-cobol-module-999?",
    );
    await expectNeedsReview(page);
  });

  test("greeting replies without error", async ({ page }) => {
    test.setTimeout(180_000);

    await startDeveloperChat(page, projectId);
    await sendChatMessage(page, "hi");
    await expectAssistantReply(page, 120_000);
  });

  test("deletes created project", async ({ page }) => {
    await navigateViaSidebar(page, "Projects");
    await deleteProjectViaUi(page, projectName);
  });
});
