import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button, Spinner } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import type { ChatSession } from "./chatTypes";
import { ChatSidebar } from "./ChatSidebar";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { NewChatDialog } from "./NewChatDialog";
import { useChatSessions } from "./useChatSessions";
import { useChatSession } from "./useChatSession";
import { useChatMessages } from "./useChatMessages";
import { useSendMessage } from "./useSendMessage";

/** Chat workspace: session list, conversation thread and composer. */
export function Chat() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: sessions, isPending } = useChatSessions();
  const { data: currentSession } = useChatSession(sessionId);
  const { data: messages } = useChatMessages(sessionId);
  const sendMessage = useSendMessage(sessionId ?? "");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text: string) => {
    sendMessage.mutate(text);
  };

  const handleNewChat = (session: ChatSession) => {
    navigate(`/chat/${session.id}`);
  };

  const filteredSessions = (sessions ?? []).filter((session) =>
    session.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (isPending) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden transition-all duration-300 md:block",
          sidebarOpen ? "w-72" : "w-0",
        )}
      >
        <ChatSidebar
          sessions={filteredSessions}
          onNewChat={() => setDialogOpen(true)}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={t("chat.toggleSidebar")}
              className="hidden h-8 w-8 md:flex"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            {currentSession ? (
              <div>
                <p className="text-sm font-medium text-foreground">{currentSession.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t(`chat.mode.${currentSession.mode}`)}
                  {currentSession.projectName ? ` · ${currentSession.projectName}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("chat.selectConversation")}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            onClick={() => setDialogOpen(true)}
          >
            {t("chat.newChat")}
          </Button>
        </div>

        {!sessionId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <MessageSquare className="h-7 w-7 text-accent-foreground" />
            </div>
            <h2 className="mb-2 font-heading text-xl font-semibold text-foreground">
              {t("chat.hero.title")}
            </h2>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">{t("chat.hero.body")}</p>
            <Button onClick={() => setDialogOpen(true)} className="rounded-lg">
              {t("chat.hero.cta")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-6">
              {(messages ?? []).length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {t("chat.firstQuestion")}
                </p>
              ) : null}
              {(messages ?? []).map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <ChatInput onSend={handleSend} disabled={sendMessage.isPending} />
          </>
        )}
      </div>

      <NewChatDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleNewChat} />
    </div>
  );
}
