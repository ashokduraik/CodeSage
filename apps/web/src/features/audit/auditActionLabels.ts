import type { NodeApi } from "@codesage/shared-types";

export type AuditAction = NodeApi.components["schemas"]["AuditAction"];

/** All audit actions in display order. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "user.create",
  "user.role_change",
  "project.create",
  "project.delete",
  "repo.attach",
  "repo.detach",
  "repo.sync",
] as const;

/**
 * Maps an audit action verb to its i18n label key under `audit.actions.*`.
 *
 * @param action - Machine-readable audit action.
 */
export function auditActionLabelKey(action: AuditAction): string {
  return `audit.actions.${action.replace(/\./g, "_")}`;
}
