import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, GitBranch, Loader2 } from "lucide-react";
import { useAttachRepo } from "./useAttachRepo";
import { useProbeRepo } from "./useProbeRepo";
import { RepoTokenHelp } from "./RepoTokenHelp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { NodeApi } from "@codesage/shared-types";

type ProbeRepoResponse = NodeApi.components["schemas"]["ProbeRepoResponse"];

const STEPS = { URL: "url", TOKEN: "token", CONFIRM: "confirm" } as const;
type Step = (typeof STEPS)[keyof typeof STEPS];

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

/**
 * Multi-step modal for connecting a repository (probe → optional token → confirm).
 */
export function AttachRepoDialog({ open, projectId, onClose }: Props): JSX.Element {
  const { t } = useTranslation();
  const { mutateAsync: attachAsync, isPending: isAttaching } = useAttachRepo();
  const { mutateAsync: probeAsync, isPending: isProbing } = useProbeRepo();

  const [step, setStep] = useState<Step>(STEPS.URL);
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [probe, setProbe] = useState<ProbeRepoResponse | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(STEPS.URL);
      setRepoUrl("");
      setToken("");
      setProbe(null);
      setSelectedBranch("");
      setDescription("");
      setError("");
    }
  }, [open]);

  const runProbe = async (url: string, authToken?: string): Promise<void> => {
    setError("");
    try {
      const result = await probeAsync({
        repoUrl: url,
        ...(authToken ? { token: authToken } : {}),
      });
      if (result.authRequired) {
        setProbe(result);
        setStep(STEPS.TOKEN);
        return;
      }
      if (result.notFound) {
        setError(t("projects.attachDialog.errors.notFound"));
        setStep(STEPS.URL);
        return;
      }
      setProbe(result);
      setSelectedBranch(result.defaultBranch || result.branches[0] || "main");
      setDescription(result.description || "");
      setStep(STEPS.CONFIRM);
    } catch {
      setError(t("projects.attachDialog.errors.probeFailed"));
      setStep(STEPS.URL);
    }
  };

  const handleUrlSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    void runProbe(repoUrl.trim());
  };

  const handleTokenSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!token.trim()) {
      setError(t("projects.attachDialog.errors.tokenRequired"));
      return;
    }
    void runProbe(repoUrl.trim(), token.trim());
  };

  const handleConfirm = async (): Promise<void> => {
    if (!probe) return;
    setError("");
    try {
      await attachAsync({
        projectId,
        body: {
          repoUrl: repoUrl.trim(),
          branch: selectedBranch,
          description,
          ...(probe.baseUrl ? { baseUrl: probe.baseUrl } : {}),
          ...(probe.primaryLanguage ? { primaryLanguage: probe.primaryLanguage } : {}),
          ...(token.trim() ? { token: token.trim() } : {}),
        },
      });
      onClose();
    } catch {
      setError(t("projects.attachDialog.error"));
    }
  };

  const isBusy = isProbing || isAttaching;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("common.close")} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.attachDialog.title")}</DialogTitle>
        </DialogHeader>

        {step === STEPS.URL && (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="repo-url" className="text-sm font-medium">
                {t("projects.attachDialog.urlLabel")}
              </label>
              <input
                id="repo-url"
                type="url"
                required
                autoFocus
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {t("projects.attachDialog.urlHint")}
              </p>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isProbing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isProbing
                  ? t("projects.attachDialog.connecting")
                  : t("projects.attachDialog.connect")}
              </button>
            </div>
          </form>
        )}

        {step === STEPS.TOKEN && probe && (
          <form onSubmit={handleTokenSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("projects.attachDialog.privateHint", { name: probe.fullName })}
            </p>
            <RepoTokenHelp
              provider={probe.provider}
              baseUrl={probe.baseUrl}
              isSelfHosted={probe.provider === "gitlab" && probe.baseUrl !== "https://gitlab.com"}
            />
            <div className="space-y-1">
              <label htmlFor="repo-token" className="text-sm font-medium">
                {t("projects.attachDialog.tokenLabel")}
              </label>
              <input
                id="repo-token"
                type="password"
                autoComplete="off"
                required
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep(STEPS.URL)}
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                {t("projects.attachDialog.back")}
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isProbing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isProbing
                  ? t("projects.attachDialog.verifying")
                  : t("projects.attachDialog.continue")}
              </button>
            </div>
          </form>
        )}

        {step === STEPS.CONFIRM && probe && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="font-medium">{probe.fullName}</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("projects.attachDialog.branchLabel")}</p>
              <div className="space-y-1.5">
                {probe.branches.slice(0, 5).map((branch) => (
                  <label
                    key={branch}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      selectedBranch === branch ? "border-primary bg-accent/50" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="branch"
                      value={branch}
                      checked={selectedBranch === branch}
                      onChange={() => setSelectedBranch(branch)}
                    />
                    {branch}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="repo-description" className="text-sm font-medium">
                {t("projects.attachDialog.descriptionLabel")}
              </label>
              <textarea
                id="repo-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("projects.attachDialog.descriptionPlaceholder")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {token.trim()
                ? t("projects.attachDialog.webhookWithToken")
                : t("projects.attachDialog.webhookWithoutToken")}
            </p>

            {error && <ErrorBanner message={error} />}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleConfirm()}
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isAttaching && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isAttaching
                  ? t("projects.attachDialog.attaching")
                  : t("projects.attachDialog.submit")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
