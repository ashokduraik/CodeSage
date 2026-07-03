/**
 * Phase 1 smoke tests — require a running stack (`npm run dev` + `dev:rag` + seeded DB).
 * Skip in CI unless E2E_BASE_URL is set.
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api";
const skipE2e = process.env.E2E_BASE_URL === undefined;

test.describe("Phase 1 code QA smoke", () => {
  test.skip(skipE2e, "Set E2E_BASE_URL to run against a live stack");

  test("login, open chat, and start a project-scoped conversation", async ({ page }) => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel(/email/i).fill("dev@codesage.local");
    await page.getByLabel(/password/i).fill("dev-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    await page.goto(`${baseUrl}/chat`);
    await page.getByRole("button", { name: /start a conversation/i }).click();
    await expect(page.getByText("New Conversation")).toBeVisible();
  });

  test("RAG health is reachable from the API host", async ({ request }) => {
    const health = await request.get(`${apiUrl.replace(/\/api$/, "")}/api/health`);
    expect(health.ok()).toBeTruthy();
  });
});
