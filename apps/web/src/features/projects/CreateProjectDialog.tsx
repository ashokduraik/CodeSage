import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCreateProject } from "./useCreateProject";

interface Props {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
}

/**
 * Modal dialog for creating a new project.
 * Submits the form via {@link useCreateProject} and closes on success.
 */
export function CreateProjectDialog({ open, onClose }: Props): JSX.Element | null {
  const { t } = useTranslation();
  const { mutateAsync, isPending, isError } = useCreateProject();
  const [name, setName] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;
    await mutateAsync({ name: name.trim() });
    setName("");
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("projects.createDialog.title")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg space-y-4">
        <h2 className="text-lg font-semibold">{t("projects.createDialog.title")}</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="project-name" className="text-sm font-medium">
              {t("projects.createDialog.nameLabel")}
            </label>
            <input
              id="project-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.createDialog.namePlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("projects.createDialog.error")}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-accent">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? t("projects.createDialog.creating") : t("projects.createDialog.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
