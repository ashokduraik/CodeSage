import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/shared/ui";

/** Props for {@link ChatInput}. */
export interface ChatInputProps {
  /** Called with the trimmed message text when the user submits. */
  onSend: (text: string) => void;
  /** Disables the field and button while a reply is in flight. */
  disabled?: boolean;
}

/** Message composer. Submits on Enter; Shift+Enter inserts a newline. */
export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setText("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t border-border bg-card p-4">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={t("chat.inputPlaceholder")}
          aria-label={t("chat.inputPlaceholder")}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Button type="submit" size="icon" disabled={disabled} aria-label={t("chat.send")}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
