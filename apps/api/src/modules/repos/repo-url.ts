import type { NodeApi } from "@codesage/shared-types";

/** Parsed repository URL metadata used by probe, attach, and webhook services. */
export interface ParsedRepoUrl {
  provider: NodeApi.components["schemas"]["RepoProvider"];
  owner: string;
  name: string;
  fullName: string;
  baseUrl: string;
  isSelfHosted: boolean;
  normalizedUrl: string;
}

/**
 * Parses an HTTPS Git clone URL into provider metadata.
 * GitHub is detected by github.com hostname; all other hosts are treated as GitLab
 * (including gitlab.com and self-hosted instances).
 *
 * @param rawUrl - User-supplied clone URL.
 * @returns Parsed metadata, or `null` when the URL is invalid.
 */
export function parseRepoUrl(rawUrl: string): ParsedRepoUrl | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const path = url.pathname.replace(/\.git$/i, "").replace(/^\//, "").replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const owner = parts[0]!;
  const name = parts[1]!;
  const host = url.hostname.toLowerCase();
  const provider: ParsedRepoUrl["provider"] =
    host === "github.com" || host === "www.github.com" ? "github" : "gitlab";
  const baseUrl = url.origin;
  const isSelfHosted = provider === "gitlab" && host !== "gitlab.com";

  return {
    provider,
    owner,
    name,
    fullName: `${owner}/${name}`,
    baseUrl,
    isSelfHosted,
    normalizedUrl: `${baseUrl}/${owner}/${name}`,
  };
}

/**
 * Decodes a base64 GitHub API README `content` field to UTF-8 text.
 *
 * @param b64 - Base64-encoded README body from the GitHub API.
 * @returns Decoded string.
 */
export function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\n/g, "");
  try {
    return decodeURIComponent(escape(Buffer.from(cleaned, "base64").toString("binary")));
  } catch {
    return Buffer.from(cleaned, "base64").toString("utf8");
  }
}

/** Maximum README excerpt length stored as description. */
export const README_EXCERPT_MAX = 3000;

/** User-Agent sent on outbound provider API calls. */
export const PROVIDER_USER_AGENT = "CodeSage/1.0";
