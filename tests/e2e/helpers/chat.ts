import { expect, type Page } from "@playwright/test";

/**
 * Opens the new-conversation dialog and starts a developer chat for one project.
 *
 * @param page - Authenticated page.
 * @param projectId - Project UUID to scope the session.
 */
export async function startDeveloperChat(page: Page, projectId: string): Promise<void> {
  await page.goto("/chat");
  await page.getByRole("button", { name: "Start a Conversation" }).click();
  await expect(page.getByRole("heading", { name: "New Conversation" })).toBeVisible();

  const projectSelect = page.getByLabel("Project");
  await expect(projectSelect).toBeEnabled();
  await projectSelect.selectOption(projectId);

  await page.getByRole("button", { name: "Start Chat" }).click();
  await expect(page.getByLabel("Ask about your codebase…")).toBeVisible();
}

/**
 * Sends one message in the active chat thread.
 *
 * @param page - Page on `/chat/:sessionId` with composer visible.
 * @param text - User question text.
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.getByLabel("Ask about your codebase…");
  await input.fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

/**
 * Waits until a citation chip shows the given repo-relative file path.
 *
 * @param page - Chat page with an assistant reply in flight or complete.
 * @param filePath - Path substring rendered in citation chips.
 * @param timeoutMs - Maximum wait for streaming + retrieval.
 */
export async function expectCitation(
  page: Page,
  filePath: string,
  timeoutMs = 90_000,
): Promise<void> {
  await expect(page.locator("span.font-mono").filter({ hasText: filePath })).toBeVisible({
    timeout: timeoutMs,
  });
}
