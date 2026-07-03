import type { NodeApi } from "@codesage/shared-types";
import { ApiError } from "../../platform/errors";
import { extractReadmeFirstSection } from "./readme-excerpt";
import {
  decodeBase64Utf8,
  parseRepoUrl,
  PROVIDER_USER_AGENT,
  type ParsedRepoUrl,
} from "./repo-url";

type ProbeRepoResponse = NodeApi.components["schemas"]["ProbeRepoResponse"];

/** Result shape returned by individual provider probe functions. */
interface ProviderProbeResult {
  authRequired?: boolean;
  notFound?: boolean;
  branches?: string[];
  defaultBranch?: string;
  description?: string;
  isPrivate?: boolean;
  primaryLanguage?: string;
}

/**
 * Picks the language with the highest percentage from a GitLab languages map.
 *
 * @param languages - Provider language name to percentage map.
 * @returns Top language name, or empty string when none.
 */
function topGitlabLanguage(languages: Record<string, number>): string {
  let top = "";
  let maxPct = 0;
  for (const [name, pct] of Object.entries(languages)) {
    if (pct > maxPct) {
      maxPct = pct;
      top = name;
    }
  }
  return top;
}

/**
 * Probes a GitHub repository via the REST API.
 *
 * @param info - Parsed URL metadata.
 * @param token - Optional personal access token.
 * @returns Probe fields or auth/not-found markers.
 */
export async function probeGithubRepo(
  info: ParsedRepoUrl,
  token?: string,
): Promise<ProviderProbeResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": PROVIDER_USER_AGENT,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const repoRes = await fetch(`https://api.github.com/repos/${info.owner}/${info.name}`, {
    headers,
  });
  if (repoRes.status === 401 || repoRes.status === 403) {
    return { authRequired: true };
  }
  if (repoRes.status === 404) {
    return token ? { notFound: true } : { authRequired: true };
  }
  if (!repoRes.ok) {
    return { notFound: true };
  }

  const repoData = (await repoRes.json()) as {
    default_branch?: string;
    description?: string | null;
    private?: boolean;
    language?: string | null;
  };

  const branchesRes = await fetch(
    `https://api.github.com/repos/${info.owner}/${info.name}/branches?per_page=5`,
    { headers },
  );
  const branches = branchesRes.ok
    ? ((await branchesRes.json()) as Array<{ name: string }>).map((b) => b.name)
    : [repoData.default_branch ?? "main"];

  let description = (repoData.description ?? "").trim();
  if (!description) {
    const readmeRes = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.name}/readme`,
      { headers },
    );
    if (readmeRes.ok) {
      const readmeData = (await readmeRes.json()) as { content?: string };
      if (readmeData.content) {
        description = extractReadmeFirstSection(decodeBase64Utf8(readmeData.content));
      }
    }
  }

  const defaultBranch = repoData.default_branch ?? "main";
  return {
    branches: branches.length > 0 ? branches : [defaultBranch],
    defaultBranch,
    description,
    isPrivate: Boolean(repoData.private),
    primaryLanguage: repoData.language ?? undefined,
  };
}

/**
 * Probes a GitLab repository (gitlab.com or self-hosted) via REST v4.
 *
 * @param info - Parsed URL metadata.
 * @param token - Optional personal access token.
 * @returns Probe fields or auth/not-found markers.
 */
export async function probeGitlabRepo(
  info: ParsedRepoUrl,
  token?: string,
): Promise<ProviderProbeResult> {
  const headers: Record<string, string> = { "User-Agent": PROVIDER_USER_AGENT };
  if (token) {
    headers["PRIVATE-TOKEN"] = token;
  }

  const projectId = encodeURIComponent(`${info.owner}/${info.name}`);
  const projRes = await fetch(`${info.baseUrl}/api/v4/projects/${projectId}`, { headers });
  if (projRes.status === 401 || projRes.status === 403) {
    return { authRequired: true };
  }
  if (projRes.status === 404) {
    return token ? { notFound: true } : { authRequired: true };
  }
  if (!projRes.ok) {
    return { notFound: true };
  }

  const projData = (await projRes.json()) as {
    default_branch?: string;
    description?: string | null;
    visibility?: string;
  };

  const branchesRes = await fetch(
    `${info.baseUrl}/api/v4/projects/${projectId}/repository/branches?per_page=5`,
    { headers },
  );
  const branches = branchesRes.ok
    ? ((await branchesRes.json()) as Array<{ name: string }>).map((b) => b.name)
    : [projData.default_branch ?? "main"];

  let description = (projData.description ?? "").trim();
  const defaultBranch = projData.default_branch ?? "main";
  if (!description) {
    for (const filename of ["README.md", "README", "readme.md"]) {
      const readmeRes = await fetch(
        `${info.baseUrl}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filename)}/raw?ref=${defaultBranch}`,
        { headers },
      );
      if (readmeRes.ok) {
        const text = await readmeRes.text();
        if (text) {
          description = extractReadmeFirstSection(text);
          break;
        }
      }
    }
  }

  let primaryLanguage: string | undefined;
  const langRes = await fetch(
    `${info.baseUrl}/api/v4/projects/${projectId}/languages`,
    { headers },
  );
  if (langRes.ok) {
    const langs = (await langRes.json()) as Record<string, number>;
    const top = topGitlabLanguage(langs);
    if (top) {
      primaryLanguage = top;
    }
  }

  return {
    branches: branches.length > 0 ? branches : [defaultBranch],
    defaultBranch,
    description,
    isPrivate: projData.visibility === "private",
    primaryLanguage,
  };
}

/**
 * Probes a repository URL and returns metadata for the connect wizard.
 *
 * @param repoUrl - HTTPS clone URL.
 * @param token - Optional access token (never logged or stored).
 * @returns {@link ProbeRepoResponse} for the UI.
 * @throws {@link ApiError} 400 when the URL is invalid.
 */
export async function probeRepo(repoUrl: string, token?: string): Promise<ProbeRepoResponse> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Enter a valid HTTPS repository URL, e.g. https://github.com/org/repo",
    );
  }

  const result =
    parsed.provider === "github"
      ? await probeGithubRepo(parsed, token)
      : await probeGitlabRepo(parsed, token);

  if (result.authRequired) {
    return {
      provider: parsed.provider,
      fullName: parsed.fullName,
      baseUrl: parsed.baseUrl,
      defaultBranch: "main",
      branches: [],
      description: "",
      isPrivate: true,
      authRequired: true,
      notFound: false,
    };
  }

  if (result.notFound) {
    return {
      provider: parsed.provider,
      fullName: parsed.fullName,
      baseUrl: parsed.baseUrl,
      defaultBranch: "main",
      branches: [],
      description: "",
      isPrivate: false,
      authRequired: false,
      notFound: true,
    };
  }

  return {
    provider: parsed.provider,
    fullName: parsed.fullName,
    baseUrl: parsed.baseUrl,
    defaultBranch: result.defaultBranch ?? "main",
    branches: (result.branches ?? ["main"]).slice(0, 5),
    description: result.description ?? "",
    isPrivate: result.isPrivate ?? Boolean(token),
    authRequired: false,
    notFound: false,
    primaryLanguage: result.primaryLanguage,
  };
}
