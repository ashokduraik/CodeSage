import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@/shared/ui";
import type { ChatMode, ChatSession } from "@/shared/mock";
import { useProjects } from "./useProjects";
import { useCreateSession } from "./useCreateSession";

/** Props for {@link NewChatDialog}. */
export interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created session so the page can navigate to it. */
  onCreated: (session: ChatSession) => void;
}

/** Modal form to start a new conversation, optionally scoped to a project. */
export function NewChatDialog({ open, onOpenChange, onCreated }: NewChatDialogProps) {
  const { t } = useTranslation();
  const { data: projects } = useProjects();
  const createSession = useCreateSession();

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<ChatMode>("developer");
  const [projectId, setProjectId] = useState("");

  const indexedProjects = (projects ?? []).filter((project) => project.status === "indexed");

  const reset = () => {
    setTitle("");
    setMode("developer");
    setProjectId("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createSession.mutate(
      {
        title: title.trim() || t("chat.new.defaultTitle"),
        mode,
        projectId: projectId || null,
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
            <Label htmlFor="new-chat-title">{t("chat.new.titleLabel")}</Label>
            <Input
              id="new-chat-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("chat.new.titlePlaceholder")}
            />
          </div>
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
            >
              <option value="">{t("chat.new.projectNone")}</option>
              {indexedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={createSession.isPending}>
              {createSession.isPending ? t("chat.new.creating") : t("chat.new.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
