import { ExternalLink, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NodeApi } from "@codesage/shared-types";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];

interface Props {
  provider: RepoProvider;
  baseUrl?: string;
  isSelfHosted?: boolean;
}

/**
 * Provider-specific instructions for creating a repository access token.
 */
export function RepoTokenHelp({ provider, baseUrl, isSelfHosted }: Props): JSX.Element {
  const { t } = useTranslation();
  const key =
    provider === "github"
      ? "github"
      : isSelfHosted
        ? "gitlabSelfHosted"
        : "gitlab";

  const label = t(`projects.repoTokenHelp.${key}.label`);
  const steps = t(`projects.repoTokenHelp.${key}.steps`, { returnObjects: true }) as string[];
  const url =
    provider === "github"
      ? "https://github.com/settings/tokens/new"
      : `${isSelfHosted && baseUrl ? baseUrl : "https://gitlab.com"}/-/user_settings/personal_access_tokens`;

  return (
    <div className="rounded-lg border border-border bg-accent/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-accent-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          {t("projects.repoTokenHelp.title", { provider: label })}
        </p>
      </div>
      <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        {t("projects.repoTokenHelp.openTokenPage")}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}
