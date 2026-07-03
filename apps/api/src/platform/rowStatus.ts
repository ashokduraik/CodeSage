/** Row visibility status — every table has a `status` column (see row-status.mdc). */
export const ROW_STATUS = {
  ACTIVE: "A",
  DELETED: "D",
} as const;

export type RowStatus = (typeof ROW_STATUS)[keyof typeof ROW_STATUS];
