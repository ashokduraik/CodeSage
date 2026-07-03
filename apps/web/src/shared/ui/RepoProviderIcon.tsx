import { Github } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { NodeApi } from "@codesage/shared-types";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];

interface Props {
  provider: RepoProvider;
  className?: string;
}

/**
 * Renders a provider brand icon for GitHub or GitLab repositories.
 *
 * @param props - Provider id and optional className for sizing.
 */
export function RepoProviderIcon({ provider, className }: Props): JSX.Element {
  if (provider === "github") {
    return <Github className={cn("h-5 w-5", className)} aria-hidden="true" />;
  }

  return (
    <svg
      className={cn("h-5 w-5", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m23.6 9.593-.033-.086L20.13 1.44a.77.77 0 0 0-.735-.514H4.605a.77.77 0 0 0-.735.514L.433 9.507l-.033.086a16.36 16.36 0 0 0 5.87 18.87l.11.074.098.066 3.857 2.9.096.073.104.06 2.7-2.07h-.052l.104-.06 3.857-2.9.11-.074A16.34 16.34 0 0 0 23.6 9.593ZM6.68 18.097l-3.64-2.75 1.115-2.92 3.525 2.68-1 3zm1.364-5.52L4.52 9.897l1.115-2.92 3.525 2.68-1 3zm7.956 5.52-3.64-2.75 1.115-2.92 3.525 2.68-1 3zm1.364-5.52-3.525-2.68 1.115-2.92 3.525 2.68-1 3zm7.956 5.52-3.64-2.75 1.115-2.92 3.525 2.68-1 3z" />
    </svg>
  );
}
