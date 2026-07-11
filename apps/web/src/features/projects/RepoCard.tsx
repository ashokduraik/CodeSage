import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw, RefreshCwOff, ScrollText, Trash2 } from "lucide-react";
import { RepoProviderIcon } from "@/shared/ui/RepoProviderIcon";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { formatRelativeTime } from "@/shared/lib";
import { cn } from "@/shared/lib/cn";
import { isApiClientError } from "@/shared/lib/apiClient";
import { useSyncRepo } from "./useSyncRepo";
import { useDeleteRepo } from "./useDeleteRepo";
import { IndexingLogsDialog } from "./IndexingLogsDialog";
import type { NodeApi } from "@codesage/shared-types";

type Repo = NodeApi.components["schemas"]["Repo"];

interface Props {
  projectId: string;
  repo: Repo;
}

/**
 * Derives the display status label key for a repository card badge.
 *
 * @param repo - Repository API response.
 * @returns i18n key suffix under projects.repoCard.status.
 */
function repoStatusKey(repo: Repo): string {
  if (repo.connectionStatus === "connecting") {
    return "indexing";
  }
  if (repo.connectionStatus === "error") {
    return "error";
  }
  if (repo.lastIndexedAt) {
    return "indexed";
  }
  return "connected";
}

const STATUS_CLASSES: Record<string, string> = {
  indexing: "bg-amber-50 text-amber-700 border-amber-200",
  indexed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Maps a sync mutation failure to a user-facing message.
 *
 * @param error - Error from {@link useSyncRepo}.
 * @param t - i18n translate function.
 * @returns Localized or API-provided message.
 */
function reindexErrorMessage(error: unknown, t: (key: string) => string): string {
  if (isApiClientError(error) && error.status === 409) {
    return t("projects.repoCard.reindexInProgress");
  }
  if (isApiClientError(error)) {
    return error.message;
  }
  return t("projects.repoCard.reindexError");
}

/**
 * Rich repository card with metadata, status, and management actions.
 */
export function RepoCard({ projectId, repo }: Props): JSX.Element {
  const { t, i18n } = useTranslation();
  const { mutateAsync: syncAsync, isPending: isSyncing, error: syncError, reset: resetSync } =
    useSyncRepo();
  const { mutateAsync: deleteAsync, isPending: isDeleting } = useDeleteRepo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const statusKey = repoStatusKey(repo);
  const metaParts: string[] = [
    t(`projects.repoCard.providers.${repo.provider}`),
    repo.branch,
  ];
  if (repo.primaryLanguage) {
    metaParts.push(repo.primaryLanguage);
  }
  if (repo.indexedFileCount !== undefined && repo.indexedFileCount > 0) {
    metaParts.push(t("projects.repoCard.fileCount", { count: repo.indexedFileCount }));
  }

  const handleReindex = async (): Promise<void> => {
    resetSync();
    try {
      await syncAsync({ projectId, repoId: repo.id });
    } catch {
      // Sync errors are shown from mutation.error (syncError).
    }
  };

  const handleDelete = async (): Promise<void> => {
    setActionError("");
    try {
      await deleteAsync({ projectId, repoId: repo.id });
      setConfirmOpen(false);
    } catch {
      setActionError(t("projects.repoCard.deleteError"));
    }
  };

  const isBusy = isSyncing || isDeleting;

  return (
    <>
      <li className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
              <RepoProviderIcon provider={repo.provider} className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold">
                  {repo.fullName || repo.repoUrl}
                </span>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    STATUS_CLASSES[statusKey],
                  )}
                >
                  {t(`projects.repoCard.status.${statusKey}`)}
                </span>
                <Tooltip
                  content={t(
                    repo.webhookEnabled
                      ? "projects.repoCard.webhookOnTooltip"
                      : "projects.repoCard.webhookOffTooltip",
                  )}
                >
                  <span
                    role="img"
                    aria-label={t(
                      repo.webhookEnabled
                        ? "projects.repoCard.webhookOn"
                        : "projects.repoCard.webhookOff",
                    )}
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                      repo.webhookEnabled
                        ? "bg-sky-50 text-sky-700 border-sky-200"
                        : "bg-slate-50 text-slate-600 border-slate-200",
                    )}
                  >
                    {repo.webhookEnabled ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <RefreshCwOff className="h-3.5 w-3.5" />
                    )}
                  </span>
                </Tooltip>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
              {repo.description ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {repo.description}
                </p>
              ) : null}
              {repo.lastIndexedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("projects.repoCard.lastIndexed", {
                    time: formatRelativeTime(repo.lastIndexedAt, { locale: i18n.language }),
                  })}
                </p>
              ) : null}
              {repo.connectionStatus === "error" && repo.lastError ? (
                <p className="mt-2 text-xs text-destructive line-clamp-2">{repo.lastError}</p>
              ) : null}
              {actionError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 self-end sm:self-start">
            <div className="flex items-center gap-2">
              <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => setLogsOpen(true)}
              className="gap-1.5"
            >
              <ScrollText className="h-3.5 w-3.5" />
              {t("projects.repoCard.indexingLogs")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => void handleReindex()}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
              {t("projects.repoCard.reindex")}
            </Button>
            <a
              href={repo.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="sr-only">{t("projects.repoCard.openRepo")}</span>
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isBusy}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">{t("projects.repoCard.delete")}</span>
            </Button>
            </div>
            {syncError ? (
              <p role="alert" className="max-w-xs text-right text-xs text-destructive">
                {reindexErrorMessage(syncError, t)}
              </p>
            ) : null}
          </div>
        </div>
      </li>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          aria-describedby={undefined}
          closeLabel={t("common.close")}
          className="sm:max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>{t("projects.repoCard.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("projects.repoCard.deleteConfirmBody", { name: repo.fullName || repo.repoUrl })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
            >
              {t("projects.repoCard.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <IndexingLogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        projectId={projectId}
        repo={repo}
      />
    </>
  );
}
