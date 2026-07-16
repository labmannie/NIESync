import { describe, it, expect } from "vitest";
import { canSubmitClaim, canUpdateClaimStatus, isValidClaimStatus } from "../lib/claimsPermissions";

describe("isValidClaimStatus", () => {
  it("accepts the known statuses", () => {
    expect(isValidClaimStatus("pending")).toBe(true);
    expect(isValidClaimStatus("accepted")).toBe(true);
    expect(isValidClaimStatus("rejected")).toBe(true);
  });

  it("rejects arbitrary strings (this is the gap that let a reporter PATCH any status)", () => {
    expect(isValidClaimStatus("resolved")).toBe(false);
    expect(isValidClaimStatus("DROP TABLE")).toBe(false);
    expect(isValidClaimStatus("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidClaimStatus(null)).toBe(false);
    expect(isValidClaimStatus(undefined)).toBe(false);
    expect(isValidClaimStatus(42)).toBe(false);
  });
});

describe("canSubmitClaim", () => {
  it("allows claiming someone else's item", () => {
    expect(canSubmitClaim({ reporter_id: "reporter-1" }, "claimer-1")).toBe(true);
  });

  it("blocks claiming your own item", () => {
    expect(canSubmitClaim({ reporter_id: "same-user" }, "same-user")).toBe(false);
  });

  it("blocks when there's no authenticated user id", () => {
    expect(canSubmitClaim({ reporter_id: "reporter-1" }, "")).toBe(false);
  });
});

describe("canUpdateClaimStatus", () => {
  it("allows the item's reporter to update a claim's status", () => {
    expect(
      canUpdateClaimStatus({ lost_and_found_reports: { reporter_id: "reporter-1" } }, "reporter-1")
    ).toBe(true);
  });

  it("blocks the claimer (or anyone else) from updating status", () => {
    expect(
      canUpdateClaimStatus({ lost_and_found_reports: { reporter_id: "reporter-1" } }, "claimer-1")
    ).toBe(false);
  });

  it("blocks when the joined report is missing", () => {
    expect(canUpdateClaimStatus({ lost_and_found_reports: null }, "reporter-1")).toBe(false);
  });
});
