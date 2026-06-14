import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAttachRepo } from "./useAttachRepo";
import type { NodeApi } from "@codesage/shared-types";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];
type RepoRole = NodeApi.components["schemas"]["RepoRole"];

interface Props {
  /** Whether the dialog is open. */
  open: boolean;
  /** Parent project UUID; the repo will be attached to this project. */
  projectId: string;
  /** Called when the dialog should close. */
  onClose: () => void;
}

/**
 * Modal dialog for attaching a repository to a project.
 * Submits the form via {@link useAttachRepo} and closes on success.
 */
export function AttachRepoDialog({ open, projectId, onClose }: Props): JSX.Element | null {
  const { t } = useTranslation();
  const { mutateAsync, isPending, isError } = useAttachRepo();

  const [repoUrl, setRepoUrl] = useState("");
  const [provider, setProvider] = useState<RepoProvider>("github");
  const [branch, setBranch] = useState("main");
  const [role, setRole] = useState<RepoRole>("other");
  const [token, setToken] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    await mutateAsync({
      projectId,
      body: {
        repoUrl: repoUrl.trim(),
        provider,
        branch: branch.trim() || "main",
        role,
        ...(token.trim() ? { token: token.trim() } : {}),
      },
    });
    setRepoUrl("");
    setToken("");
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("projects.attachDialog.title")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg space-y-4">
        <h2 className="text-lg font-semibold">{t("projects.attachDialog.title")}</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="repo-url" className="text-sm font-medium">
              {t("projects.attachDialog.urlLabel")}
            </label>
            <input
              id="repo-url"
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="repo-provider" className="text-sm font-medium">
                {t("projects.attachDialog.providerLabel")}
              </label>
              <select
                id="repo-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as RepoProvider)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="repo-role" className="text-sm font-medium">
                {t("projects.attachDialog.roleLabel")}
              </label>
              <select
                id="repo-role"
                value={role}
                onChange={(e) => setRole(e.target.value as RepoRole)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="frontend">{t("projects.attachDialog.roleFrontend")}</option>
                <option value="backend">{t("projects.attachDialog.roleBackend")}</option>
                <option value="iam">{t("projects.attachDialog.roleIam")}</option>
                <option value="other">{t("projects.attachDialog.roleOther")}</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="repo-branch" className="text-sm font-medium">
              {t("projects.attachDialog.branchLabel")}
            </label>
            <input
              id="repo-branch"
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="repo-token" className="text-sm font-medium">
              {t("projects.attachDialog.tokenLabel")}
              <span className="ml-1 text-xs text-muted-foreground">
                ({t("projects.attachDialog.tokenOptional")})
              </span>
            </label>
            <input
              id="repo-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("projects.attachDialog.tokenPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("projects.attachDialog.error")}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-accent">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? t("projects.attachDialog.attaching") : t("projects.attachDialog.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
