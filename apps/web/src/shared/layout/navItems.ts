import { FolderGit2, LayoutDashboard, MessageSquare, type LucideIcon } from "lucide-react";

/** A primary navigation entry. `labelKey` is resolved through i18n at render time. */
export interface NavItem {
  labelKey: string;
  icon: LucideIcon;
  path: string;
}

/**
 * Primary navigation entries. Routes are added as their pages land.
 * Knowledge, Workflows, Reviews, and Settings arrive in later phases.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: "nav.dashboard", icon: LayoutDashboard, path: "/" },
  { labelKey: "nav.projects", icon: FolderGit2, path: "/projects" },
  { labelKey: "nav.chat", icon: MessageSquare, path: "/chat" },
];

/**
 * Determines whether a nav entry is active for the current path.
 * The root path matches exactly; other paths also match their sub-routes.
 * @param itemPath - The nav entry's path.
 * @param pathname - The current location pathname.
 * @returns True when the entry should render as active.
 */
export function isNavItemActive(itemPath: string, pathname: string): boolean {
  if (pathname === itemPath) {
    return true;
  }
  return itemPath !== "/" && pathname.startsWith(itemPath);
}
