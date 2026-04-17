export const NIE_EMAIL_DOMAIN = "@nie.ac.in";
export const DOMAIN_RESTRICTION_MESSAGE =
  "Use your NIE email address to continue.";
export const GROUP_EMAIL_BLOCK_MESSAGE =
  "This email address cannot be used for an individual account.";

export type AuthEmailStatus = {
  exists: boolean;
  providers: string[];
  domainAllowed: boolean;
  blocked: boolean;
  blockedReason?: string | null;
};

export function normalizeInstitutionalEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isInstitutionalEmail(email: string) {
  return normalizeInstitutionalEmail(email).endsWith(NIE_EMAIL_DOMAIN);
}

export function isAllowedAuthEmail(email: string) {
  const normalizedEmail = normalizeInstitutionalEmail(email);
  return normalizedEmail.endsWith(NIE_EMAIL_DOMAIN);
}

export async function checkAuthEmailStatus(email: string) {
  const normalizedEmail = normalizeInstitutionalEmail(email);
  const response = await fetch(
    `/auth/callback?action=check-email&email=${encodeURIComponent(normalizedEmail)}`,
    { method: "GET", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Unable to verify this email right now. Please try again.");
  }

  return (await response.json()) as AuthEmailStatus;
}
