import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
} from "@/shared/ui";
import type { ChatMode, ChatSession } from "./chatTypes";
import { useProjects } from "./useProjects";
import { useCreateSession } from "./useCreateSession";

/** Props for {@link NewChatDialog}. */
export interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created session so the page can navigate to it. */
  onCreated: (session: ChatSession) => void;
}

/** Modal form to start a new conversation scoped to a project. */
export function NewChatDialog({ open, onOpenChange, onCreated }: NewChatDialogProps) {
  const { t } = useTranslation();
  const { data: projects, isPending: projectsLoading } = useProjects();
  const createSession = useCreateSession();

  const [mode, setMode] = useState<ChatMode>("developer");
  const [projectId, setProjectId] = useState("");

  const projectList = projects ?? [];
  const selectedProject = projectList.find((project) => project.id === projectId);

  const reset = () => {
    setMode("developer");
    setProjectId("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }
    createSession.mutate(
      {
        mode,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
      },
      {
        onSuccess: (session) => {
          onCreated(session);
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("chat.new.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-chat-mode">{t("chat.new.modeLabel")}</Label>
            <Select
              id="new-chat-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as ChatMode)}
            >
              <option value="developer">{t("chat.new.modeDeveloper")}</option>
              <option value="end_user">{t("chat.new.modeEndUser")}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-chat-project">{t("chat.new.projectLabel")}</Label>
            <Select
              id="new-chat-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={projectsLoading || projectList.length === 0}
            >
              <option value="">
                {projectsLoading
                  ? t("chat.new.projectLoading")
                  : projectList.length === 0
                    ? t("chat.new.projectEmpty")
                    : t("chat.new.projectPlaceholder")}
              </option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.status !== "indexed" ? ` (${project.status})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createSession.isPending || !selectedProject}
            >
              {createSession.isPending ? t("chat.new.creating") : t("chat.new.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
