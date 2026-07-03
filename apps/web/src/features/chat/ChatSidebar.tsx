import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare, Plus, Search } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib";
import type { ChatSession } from "./chatTypes";

/** Props for {@link ChatSidebar}. */
export interface ChatSidebarProps {
  sessions: ChatSession[];
  onNewChat: () => void;
  search: string;
  onSearchChange: (value: string) => void;
}

/** Conversation list with new-chat action and search filter. */
export function ChatSidebar({ sessions, onNewChat, search, onSearchChange }: ChatSidebarProps) {
  const { t, i18n } = useTranslation();
  const { sessionId } = useParams();

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-card">
      <div className="space-y-3 border-b border-border p-4">
        <Button onClick={onNewChat} className="w-full rounded-lg" size="sm">
          <Plus className="mr-2 h-4 w-4" /> {t("chat.newChat")}
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            aria-label={t("chat.searchPlaceholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">{t("chat.noConversations")}</p>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              to={`/chat/${session.id}`}
              className={cn(
                "block border-b border-border px-4 py-3 transition-colors hover:bg-muted/50",
                sessionId === session.id ? "bg-accent" : "",
              )}
            >
              <div className="flex items-start gap-2.5">
                <MessageSquare
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    session.mode === "developer" ? "text-violet-500" : "text-blue-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(`chat.mode.${session.mode}`)} · {session.projectName ?? t("chat.general")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {session.lastMessageAt
                      ? formatRelativeTime(session.lastMessageAt, { locale: i18n.language })
                      : "—"}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
