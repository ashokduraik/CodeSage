import { expect, type Page } from "@playwright/test";

import { e2eEnv } from "./env";

/**
 * Signs in through the login page and waits for the dashboard.
 *
 * @param page - Playwright page (uses configured `baseURL`).
 */
export async function loginViaUi(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(e2eEnv.devEmail);
  await page.getByLabel("Password").fill(e2eEnv.devPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/**
 * Reads the JWT stored by the web app after login.
 *
 * @param page - Authenticated page.
 * @returns Bearer token from `localStorage`.
 */
export async function getAuthToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("codesage_token"));
  if (!token) {
    throw new Error("Missing codesage_token after login");
  }
  return token;
}
