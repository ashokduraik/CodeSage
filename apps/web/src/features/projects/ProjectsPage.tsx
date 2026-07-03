import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2, Plus, Trash2 } from "lucide-react";
import { useProjects } from "./useProjects";
import { useDeleteProject } from "./useDeleteProject";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { AttachRepoDialog } from "./AttachRepoDialog";
import { ProjectRepoList } from "./ProjectRepoList";
import { Spinner } from "@/shared/ui/spinner";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

/**
 * Full-page view of all connected projects.
 * Lets authenticated users create new projects and attach repositories to existing ones.
 */
export function ProjectsPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: projects, isPending, isError } = useProjects();
  const { mutateAsync: deleteProjectAsync, isPending: isDeleting } = useDeleteProject();
  const [showCreate, setShowCreate] = useState(false);
  const [attachProjectId, setAttachProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteProject = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await deleteProjectAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteError(t("projects.deleteProject.error"));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("projects.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("projects.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("projects.newProject")}
        </button>
      </div>

      {isPending && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("projects.loadError")}
        </p>
      )}

      {!isPending && !isError && projects && (
        projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <FolderGit2 className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm">{t("projects.noProjects")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{project.status}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => setAttachProjectId(project.id)}
                      className="text-sm text-primary hover:underline"
                    >
                      {t("projects.attachRepo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{t("projects.deleteProject.action")}</span>
                    </button>
                  </div>
                </div>
                <ProjectRepoList projectId={project.id} />
              </li>
            ))}
          </ul>
        )
      )}

      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />

      <AttachRepoDialog
        open={attachProjectId !== null}
        projectId={attachProjectId ?? ""}
        onClose={() => setAttachProjectId(null)}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent closeLabel={t("common.close")} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("projects.deleteProject.confirmTitle")}</DialogTitle>
          </DialogHeader>
          {deleteTarget ? (
            <p className="text-sm text-muted-foreground">
              {t("projects.deleteProject.confirmBody", { name: deleteTarget.name })}
            </p>
          ) : null}
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleDeleteProject()}
            >
              {t("projects.deleteProject.action")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
