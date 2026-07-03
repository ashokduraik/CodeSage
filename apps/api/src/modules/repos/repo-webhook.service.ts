import { randomBytes } from "node:crypto";
import type { NodeApi } from "@codesage/shared-types";
import { encryptToken, parseEncryptionKey } from "../../platform/encryption";
import type { ParsedRepoUrl } from "./repo-url";
import { PROVIDER_USER_AGENT } from "./repo-url";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];

/** Provider-specific token help content for the connect wizard UI. */
export interface TokenHelpInfo {
  label: string;
  url: string;
  steps: string[];
}

/**
 * Generates a random webhook HMAC secret (32 bytes hex).
 *
 * @returns Hex-encoded secret string.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Returns provider-specific instructions for creating an access token.
 *
 * @param provider - Git host provider.
 * @param baseUrl - Repository origin URL.
 * @param isSelfHosted - Whether GitLab is self-hosted.
 * @returns Help text and official token page URL.
 */
export function tokenHelpInfo(
  provider: RepoProvider,
  baseUrl: string,
  isSelfHosted: boolean,
): TokenHelpInfo {
  if (provider === "github") {
    return {
      label: "GitHub",
      url: "https://github.com/settings/tokens/new",
      steps: [
        "Open GitHub → Settings → Developer settings → Personal access tokens.",
        'Click "Generate new token" (classic) and give it a name.',
        'Select the "repo" scope to read private repositories and manage webhooks.',
        "Generate the token and paste it below — it is only used to connect this repository.",
      ],
    };
  }

  const base = isSelfHosted ? baseUrl : "https://gitlab.com";
  return {
    label: isSelfHosted ? "GitLab (self-hosted)" : "GitLab",
    url: `${base}/-/user_settings/personal_access_tokens`,
    steps: [
      `Open ${base} → your avatar → Edit profile → Access Tokens.`,
      'Give the token a name and select the "api" scope (read repos + manage hooks).',
      "Create the token and paste it below — it is only used to connect this repository.",
    ],
  };
}

/**
 * Registers a GitHub repository webhook for push events.
 *
 * @param info - Parsed repo URL.
 * @param token - Admin PAT with repo scope.
 * @param callbackUrl - Public webhook endpoint URL.
 * @param secret - HMAC secret stored encrypted at rest.
 * @returns Provider-assigned webhook ID.
 */
export async function registerGitHubWebhook(
  info: ParsedRepoUrl,
  token: string,
  callbackUrl: string,
  secret: string,
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${info.owner}/${info.name}/hooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": PROVIDER_USER_AGENT,
    },
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push"],
      config: {
        url: callbackUrl,
        content_type: "json",
        secret,
        insecure_ssl: "0",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub webhook registration failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: number };
  return String(data.id);
}

/**
 * Registers a GitLab project hook for push events.
 *
 * @param info - Parsed repo URL.
 * @param token - PAT with api scope.
 * @param callbackUrl - Public webhook endpoint URL.
 * @param secret - Token header value stored encrypted at rest.
 * @returns Provider-assigned hook ID.
 */
export async function registerGitLabWebhook(
  info: ParsedRepoUrl,
  token: string,
  callbackUrl: string,
  secret: string,
): Promise<string> {
  const projectId = encodeURIComponent(`${info.owner}/${info.name}`);
  const res = await fetch(`${info.baseUrl}/api/v4/projects/${projectId}/hooks`, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
      "User-Agent": PROVIDER_USER_AGENT,
    },
    body: JSON.stringify({
      url: callbackUrl,
      push_events: true,
      enable_ssl_verification: true,
      token: secret,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitLab webhook registration failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: number };
  return String(data.id);
}

/**
 * Deletes a GitHub repository webhook (best-effort).
 *
 * @param info - Parsed repo URL.
 * @param token - Admin PAT.
 * @param webhookId - Provider webhook ID.
 */
export async function deleteGitHubWebhook(
  info: ParsedRepoUrl,
  token: string,
  webhookId: string,
): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${info.owner}/${info.name}/hooks/${webhookId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": PROVIDER_USER_AGENT,
      },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub webhook delete failed (${res.status})`);
  }
}

/**
 * Deletes a GitLab project hook (best-effort).
 *
 * @param info - Parsed repo URL.
 * @param token - PAT with api scope.
 * @param webhookId - Provider hook ID.
 */
export async function deleteGitLabWebhook(
  info: ParsedRepoUrl,
  token: string,
  webhookId: string,
): Promise<void> {
  const projectId = encodeURIComponent(`${info.owner}/${info.name}`);
  const res = await fetch(
    `${info.baseUrl}/api/v4/projects/${projectId}/hooks/${webhookId}`,
    {
      method: "DELETE",
      headers: {
        "PRIVATE-TOKEN": token,
        "User-Agent": PROVIDER_USER_AGENT,
      },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitLab webhook delete failed (${res.status})`);
  }
}

/** Result of a best-effort webhook registration attempt during attach. */
export interface WebhookRegistrationResult {
  webhookId: string | null;
  webhookSecretEnc: string | null;
  webhookEnabled: boolean;
}

/**
 * Attempts to register a push webhook for a newly attached repo.
 * Failures are non-fatal — attach still succeeds with webhookEnabled=false.
 *
 * @param parsed - Parsed clone URL.
 * @param token - Plaintext PAT (required for webhook admin).
 * @param provider - Git host provider.
 * @param webhookBaseUrl - Public base URL of this CodeSage instance.
 * @param encryptionKey - Base64 AES key for encrypting the webhook secret.
 * @returns Registration outcome for DB update.
 */
export async function registerRepoWebhook(
  parsed: ParsedRepoUrl,
  token: string | undefined,
  provider: RepoProvider,
  webhookBaseUrl: string,
  encryptionKey: string,
): Promise<WebhookRegistrationResult> {
  const disabled: WebhookRegistrationResult = {
    webhookId: null,
    webhookSecretEnc: null,
    webhookEnabled: false,
  };

  if (!webhookBaseUrl || !token || !encryptionKey) {
    return disabled;
  }

  try {
    const secret = generateWebhookSecret();
    const callbackUrl = `${webhookBaseUrl.replace(/\/$/, "")}/api/webhooks/${provider}`;
    const webhookId =
      provider === "github"
        ? await registerGitHubWebhook(parsed, token, callbackUrl, secret)
        : await registerGitLabWebhook(parsed, token, callbackUrl, secret);

    const key = parseEncryptionKey(encryptionKey);
    const webhookSecretEnc = encryptToken(secret, key);

    return { webhookId, webhookSecretEnc, webhookEnabled: true };
  } catch {
    return disabled;
  }
}

/**
 * Best-effort deletion of a provider webhook when detaching a repo.
 *
 * @param parsed - Parsed clone URL.
 * @param provider - Git host provider.
 * @param token - Plaintext PAT decrypted from token_enc.
 * @param webhookId - Stored provider webhook ID.
 */
export async function unregisterRepoWebhook(
  parsed: ParsedRepoUrl,
  provider: RepoProvider,
  token: string | undefined,
  webhookId: string | null,
): Promise<void> {
  if (!token || !webhookId) {
    return;
  }
  try {
    if (provider === "github") {
      await deleteGitHubWebhook(parsed, token, webhookId);
    } else {
      await deleteGitLabWebhook(parsed, token, webhookId);
    }
  } catch {
    // Best-effort cleanup; detach proceeds regardless.
  }
}
