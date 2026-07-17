import { expect, type Page } from "@playwright/test";

/** Locator for assistant message bubbles in the chat transcript. */
function assistantBubbles(page: Page) {
  return page.locator("div.rounded-bl-md.bg-muted");
}

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
 * @param timeoutMs - Maximum wait for streaming + retrieval (agent QA is slower).
 */
export async function expectCitation(
  page: Page,
  filePath: string,
  timeoutMs = 120_000,
): Promise<void> {
  await expect(page.locator("span.font-mono").filter({ hasText: filePath })).toBeVisible({
    timeout: timeoutMs,
  });
}

/**
 * Waits until the in-flight assistant reply finishes and shows content.
 *
 * Streaming is done when the Send control returns (Stop is gone). Agent QA can
 * take longer than the legacy pipeline, so the default timeout is 120s.
 *
 * @param page - Chat page after {@link sendChatMessage}.
 * @param timeoutMs - Maximum wait for the agent loop + final answer.
 */
export async function expectAssistantReply(page: Page, timeoutMs = 120_000): Promise<void> {
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: timeoutMs,
  });
  await expect(assistantBubbles(page).last()).not.toBeEmpty();
  await expect(page.getByRole("alert")).toHaveCount(0);
}

/**
 * Asserts the latest assistant turn was routed to expert review / abstain (NFR-7).
 *
 * Matches MessageBubble low-confidence copy or abstain body text from the engine.
 *
 * @param page - Chat page after a nonsense or ungrounded question.
 * @param timeoutMs - Maximum wait for the agent loop to abstain.
 */
export async function expectNeedsReview(page: Page, timeoutMs = 120_000): Promise<void> {
  await expect(
    page.getByText(
      /Low confidence|couldn't find enough evidence|Not certain/i,
    ),
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * Returns the number of assistant message bubbles currently in the transcript.
 *
 * @param page - Chat page with one or more replies.
 */
export async function countAssistantReplies(page: Page): Promise<number> {
  return assistantBubbles(page).count();
}
