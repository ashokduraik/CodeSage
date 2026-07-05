/**
 * Phase 2 E2E — multi-repo cross-linking and cross-repo citations.
 *
 * Requires a live stack and a project that already has two indexed repos linked by xrepo.
 * See docs/plans/phase-2-e2e.md for fixture + seed setup.
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api";
const projectId = process.env.E2E_MULTI_REPO_PROJECT_ID;
const frontendPath = process.env.E2E_MULTI_REPO_FRONTEND_PATH ?? "src/api.ts";
const backendPath = process.env.E2E_MULTI_REPO_BACKEND_PATH ?? "src/routes.ts";

const skipE2e =
  process.env.E2E_BASE_URL === undefined || projectId === undefined;

test.describe("Phase 2 multi-repo linking", () => {
  test.skip(
    skipE2e,
    "Set E2E_BASE_URL and E2E_MULTI_REPO_PROJECT_ID (see docs/plans/phase-2-e2e.md)",
  );

  test("project lists at least two indexed repos", async ({ page, request }) => {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel(/email/i).fill("dev@codesage.local");
    await page.getByLabel(/password/i).fill("dev-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem("codesage_token"));
    expect(token).toBeTruthy();

    const reposRes = await request.get(`${apiUrl}/projects/${projectId}/repos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reposRes.ok()).toBeTruthy();
    const repos = (await reposRes.json()) as Array<{ lastIndexedAt?: string | null }>;
    expect(repos.length).toBeGreaterThanOrEqual(2);
    expect(repos.every((repo) => repo.lastIndexedAt != null)).toBeTruthy();
  });

  test("developer chat cites files from more than one repo", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`${baseUrl}/login`);
    await page.getByLabel(/email/i).fill("dev@codesage.local");
    await page.getByLabel(/password/i).fill("dev-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.goto(`${baseUrl}/chat`);
    await page.getByRole("button", { name: /start a conversation/i }).click();

    const projectSelect = page.getByLabel(/project/i);
    if (await projectSelect.isVisible()) {
      await projectSelect.selectOption({ value: projectId! });
    }

    await page.getByPlaceholder(/ask/i).fill(
      "Where is the GET /api/login API call handled in the backend?",
    );
    await page.getByRole("button", { name: /send/i }).click();

    await expect(page.getByText(frontendPath)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(backendPath)).toBeVisible({ timeout: 90_000 });
  });
});
