import { describe, it, expect } from "vitest";
import { ROW_STATUS } from "./rowStatus";

describe("ROW_STATUS", () => {
  it("defines Active and Deleted row visibility codes", () => {
    expect(ROW_STATUS.ACTIVE).toBe("A");
    expect(ROW_STATUS.DELETED).toBe("D");
  });
});
