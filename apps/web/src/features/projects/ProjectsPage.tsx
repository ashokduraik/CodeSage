import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2, Plus } from "lucide-react";
import { useProjects } from "./useProjects";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { AttachRepoDialog } from "./AttachRepoDialog";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Full-page view of all connected projects.
 * Lets authenticated users create new projects and attach repositories to existing ones.
 */
export function ProjectsPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: projects, isPending, isError } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [attachProjectId, setAttachProjectId] = useState<string | null>(null);

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
              <li
                key={project.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{project.status}</p>
                </div>
                <button
                  onClick={() => setAttachProjectId(project.id)}
                  className="text-sm text-primary hover:underline"
                >
                  {t("projects.attachRepo")}
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      <CreateProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      <AttachRepoDialog
        open={attachProjectId !== null}
        projectId={attachProjectId ?? ""}
        onClose={() => setAttachProjectId(null)}
      />
    </div>
  );
}
