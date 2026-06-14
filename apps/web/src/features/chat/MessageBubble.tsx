import { useTranslation } from "react-i18next";
import { AlertCircle, Bot, FileCode, User } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { CONFIDENCE_THRESHOLD, type ChatMessage } from "@/shared/mock";

/** Props for {@link MessageBubble}. */
export interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * Renders a single chat message. Assistant replies show citations and, when
 * confidence is below the review threshold, the expert-review fallback note
 * (NFR-7: answers are grounded and never silently hallucinate).
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const lowConfidence =
    !isUser && message.confidence !== undefined && message.confidence < CONFIDENCE_THRESHOLD;
  const hasSources = !isUser && message.sources !== undefined && message.sources.length > 0;

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      ) : null}

      <div className={cn("max-w-[80%]", isUser ? "order-first" : "")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>

        {lowConfidence ? (
          <div className="mt-1.5 flex items-center gap-1.5 px-1">
            <AlertCircle className="h-3 w-3 text-amber-500" />
            <span className="text-[11px] font-medium text-amber-600">
              {t("chat.lowConfidence")}
            </span>
          </div>
        ) : null}

        {hasSources ? (
          <div className="mt-2 flex flex-wrap gap-1.5 px-1">
            {message.sources?.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] text-accent-foreground"
              >
                <FileCode className="h-2.5 w-2.5" />
                {source}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      ) : null}
    </div>
  );
}
