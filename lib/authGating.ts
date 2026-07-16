export function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  const publicPrefixes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/about",
    "/contact",
    "/founders",
    "/faq",
    "/terms-of-service",
    "/privacy-policy",
    "/auth",
    "/resolve",
    "/_next",
    "/favicon",
    "/status",
  ];

  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
}

export type ProfileCompletenessRow = {
  user_type?: string | null;
  role?: string | null;
  usn?: string | null;
  has_vehicle?: boolean | null;
  vehicle_no?: string | null;
};

export function resolveUserType(profile: Pick<ProfileCompletenessRow, "user_type" | "role">): "Student" | "Faculty" {
  if (profile.user_type === "Faculty" || profile.user_type === "Student") return profile.user_type;
  return profile.role === "Faculty" ? "Faculty" : "Student";
}

/**
 * Mirrors the middleware's signup-completion gate: students must have a USN, and
 * anyone who indicated they have a vehicle must have at least one on file
 * (either denormalized onto the profile row, or confirmed separately via
 * `hasAnyVehicle`, e.g. a row in profile_vehicles).
 *
 * Returns true when the profile is complete (no redirect to /signup/complete
 * needed), false when it's missing required fields.
 */
export function isProfileComplete(
  profile: ProfileCompletenessRow,
  hasAnyVehicle: boolean
): boolean {
  const resolvedUserType = resolveUserType(profile);

  const studentNeedsUsn = resolvedUserType === "Student" && (!profile.usn || !String(profile.usn).trim());
  const confirmedHasVehicle = hasAnyVehicle || Boolean(profile.vehicle_no);
  const vehicleMissing = Boolean(profile.has_vehicle) && !confirmedHasVehicle;

  return !studentNeedsUsn && !vehicleMissing;
}
