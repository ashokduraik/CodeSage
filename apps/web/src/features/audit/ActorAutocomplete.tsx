import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { useUserSearch } from "./useUserSearch";
import type { NodeApi } from "@codesage/shared-types";

type UserSearchResult = NodeApi.components["schemas"]["UserSearchResult"];

/** Props for {@link ActorAutocomplete}. */
export interface ActorAutocompleteProps {
  /** Selected actor UUID. */
  value: string;
  /** Selected actor email for display. */
  displayEmail: string;
  /** Called when the admin picks or clears an actor. */
  onChange: (actorId: string, email: string) => void;
}

/**
 * Email-prefix combobox for selecting an audit log actor.
 * Debounces search input and supports keyboard navigation.
 */
export function ActorAutocomplete({ value, displayEmail, onChange }: ActorAutocompleteProps): JSX.Element {
  const { t } = useTranslation();
  const listId = useId();
  const [input, setInput] = useState(displayEmail);
  const [debounced, setDebounced] = useState(displayEmail);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: options = [], isFetching } = useUserSearch(debounced);
  const activeHighlight = Math.min(highlight, Math.max(0, options.length - 1));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(input), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (option: UserSearchResult): void => {
    onChange(option.id, option.email);
    setInput(option.email);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, options.length - 1)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    }
    if (event.key === "Enter" && open && options[activeHighlight]) {
      event.preventDefault();
      pick(options[activeHighlight]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="text"
        value={input}
        placeholder={t("audit.filters.actorPlaceholder")}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setInput(e.target.value);
          setHighlight(0);
          setOpen(true);
          if (!e.target.value) {
            onChange("", "");
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {value && input === displayEmail && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            onChange("", "");
            setInput("");
          }}
        >
          {t("audit.filters.clearActor")}
        </button>
      )}
      {open && debounced.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md"
        >
          {isFetching && options.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">{t("audit.filters.searching")}</li>
          )}
          {!isFetching && options.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">{t("audit.filters.noUsers")}</li>
          )}
          {options.map((option, index) => (
            <li key={option.id} role="option" aria-selected={activeHighlight === index}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent",
                  activeHighlight === index && "bg-accent",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                <span>{option.email}</span>
                {option.isSystem && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("audit.systemBadge")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
