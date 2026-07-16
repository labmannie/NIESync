export const CLAIM_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export function isValidClaimStatus(status: unknown): status is ClaimStatus {
  return typeof status === "string" && (CLAIM_STATUSES as readonly string[]).includes(status);
}

/**
 * You can't claim your own Lost & Found post.
 */
export function canSubmitClaim(item: { reporter_id: string | null }, userId: string): boolean {
  if (!userId) return false;
  return item.reporter_id !== userId;
}

/**
 * Only the person who reported the item can accept/reject claims made against it.
 */
export function canUpdateClaimStatus(
  claim: { lost_and_found_reports?: { reporter_id: string | null } | null },
  userId: string
): boolean {
  if (!userId) return false;
  return claim.lost_and_found_reports?.reporter_id === userId;
}
