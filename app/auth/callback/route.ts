import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

const NIE_DOMAIN_SUFFIX = "@nie.ac.in";
const GROUP_EMAIL_BLOCK_MESSAGE =
  "Group email addresses are not allowed for individual accounts.";

const normalizeProvider = (provider: string) => {
  if (provider === "google") return "google";
  return "email";
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findBlockedEmailEntry(admin: ReturnType<typeof getAdminClient>, email: string) {
  if (!admin) return { blocked: false, blockedReason: null as string | null, unavailable: true };

  const { data, error } = await admin
    .from("blocked_signup_emails")
    .select("email, reason")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Graceful fallback while table is not yet created.
    if (error.code === "42P01") {
      return { blocked: false, blockedReason: null as string | null, unavailable: false };
    }

    return { blocked: false, blockedReason: null as string | null, unavailable: true };
  }

  if (!data) {
    return { blocked: false, blockedReason: null as string | null, unavailable: false };
  }

  return {
    blocked: true,
    blockedReason: data.reason || GROUP_EMAIL_BLOCK_MESSAGE,
    unavailable: false,
  };
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const action = searchParams.get("action");

  // Internal auth utility endpoint: /auth/callback?action=check-email&email=x@nie.ac.in
  if (action === "check-email") {
    const email = (searchParams.get("email") || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!email.endsWith(NIE_DOMAIN_SUFFIX)) {
      return NextResponse.json({
        exists: false,
        providers: [],
        domainAllowed: false,
        blocked: false,
        blockedReason: null,
      });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server is missing Supabase admin configuration." },
        { status: 500 }
      );
    }

    const blockedStatus = await findBlockedEmailEntry(admin, email);
    if (blockedStatus.unavailable) {
      return NextResponse.json(
        { error: "Unable to verify email availability." },
        { status: 500 }
      );
    }

    if (blockedStatus.blocked) {
      return NextResponse.json({
        exists: false,
        providers: [],
        domainAllowed: true,
        blocked: true,
        blockedReason: blockedStatus.blockedReason,
      });
    }

    const perPage = 200;
    const maxPages = 50;
    let foundUser: any = null;

    for (let page = 1; page <= maxPages; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        return NextResponse.json(
          { error: "Unable to verify email availability." },
          { status: 500 }
        );
      }

      const users = data?.users || [];
      foundUser =
        users.find(
          (candidate) =>
            String(candidate.email || "").trim().toLowerCase() === email
        ) || null;

      if (foundUser || users.length < perPage) {
        break;
      }
    }

    if (!foundUser) {
      return NextResponse.json({
        exists: false,
        providers: [],
        domainAllowed: true,
        blocked: false,
        blockedReason: null,
      });
    }

    const providerSet = new Set<string>();
    const metadataProviders = Array.isArray(foundUser?.app_metadata?.providers)
      ? foundUser.app_metadata.providers
      : [];

    metadataProviders.forEach((provider: string) => {
      if (provider) providerSet.add(normalizeProvider(String(provider).toLowerCase()));
    });

    if (foundUser?.app_metadata?.provider) {
      providerSet.add(
        normalizeProvider(String(foundUser.app_metadata.provider).toLowerCase())
      );
    }

    (foundUser?.identities || []).forEach((identity: any) => {
      if (identity?.provider) {
        providerSet.add(normalizeProvider(String(identity.provider).toLowerCase()));
      }
    });

    if (providerSet.size === 0) {
      providerSet.add("email");
    }

    const providers = Array.from(providerSet);

    return NextResponse.json({
      exists: true,
      providers,
      domainAllowed: true,
      blocked: false,
      blockedReason: null,
    });
  }

  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/lost-and-found";
  const shouldMarkEmailVerified = searchParams.get("verify_email") === "1";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Check if user has an existing profile
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (user) {
        const normalizedEmail = String(user.email || "").trim().toLowerCase();
        if (!normalizedEmail.endsWith(NIE_DOMAIN_SUFFIX)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/signup?error=invalid-domain`);
        }

        const admin = getAdminClient();
        const blockedStatus = await findBlockedEmailEntry(admin, normalizedEmail);
        if (blockedStatus.blocked) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/signup?error=blocked-group`);
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, user_type, role, usn, has_vehicle, vehicle_no, auth_provider, email_verified")
          .eq("id", user.id)
          .maybeSingle();
        
        if (!profile) {
          return NextResponse.redirect(`${origin}/signup/complete`);
        }

        // Keep auth provider linkage current, but only mark email_verified explicitly:
        // - true for Google users
        // - true when verification magic-link callback carries verify_email=1
        const currentProvider = normalizeProvider(
          String(user.app_metadata?.provider || "email").toLowerCase()
        );
        const storedProvider = String(profile.auth_provider || "").toLowerCase();
        const nextEmailVerified =
          Boolean(profile.email_verified) ||
          currentProvider === "google" ||
          shouldMarkEmailVerified;

        if (!storedProvider) {
          await supabase
            .from("profiles")
            .update({
              auth_provider: currentProvider,
              email_verified: nextEmailVerified,
            })
            .eq("id", user.id);
        } else if (storedProvider !== "both" && storedProvider !== currentProvider) {
          await supabase
            .from("profiles")
            .update({
              auth_provider: "both",
              email_verified: nextEmailVerified,
            })
            .eq("id", user.id);
        } else if (nextEmailVerified !== Boolean(profile.email_verified)) {
          await supabase
            .from("profiles")
            .update({ email_verified: nextEmailVerified })
            .eq("id", user.id);
        }

        const resolvedUserType =
          profile.user_type || (profile.role === "Faculty" ? "Faculty" : "Student");

        const studentNeedsUsn =
          resolvedUserType === "Student" &&
          (!profile.usn || !String(profile.usn).trim());

        let hasAnyVehicle = !!profile.vehicle_no;
        if (profile.has_vehicle && !hasAnyVehicle) {
          const { count } = await supabase
            .from("profile_vehicles")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", user.id);

          hasAnyVehicle = (count || 0) > 0;
        }

        if (studentNeedsUsn || (profile.has_vehicle && !hasAnyVehicle)) {
          return NextResponse.redirect(`${origin}/signup/complete`);
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth failed
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action !== "delete-account") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
  const isRecentLogin =
    !!lastSignInAt &&
    !Number.isNaN(lastSignInAt.getTime()) &&
    Date.now() - lastSignInAt.getTime() <= 24 * 60 * 60 * 1000;

  if (!isRecentLogin) {
    return NextResponse.json(
      {
        error:
          "Re-authentication required. Please sign in again (within 24 hours) before deleting your account.",
      },
      { status: 403 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing Supabase admin configuration." },
      { status: 500 }
    );
  }

  const { error: deleteVehicleRowsError } = await admin
    .from("profile_vehicles")
    .delete()
    .eq("profile_id", user.id);

  if (deleteVehicleRowsError && deleteVehicleRowsError.code !== "42P01") {
    return NextResponse.json(
      { error: deleteVehicleRowsError.message || "Failed to delete vehicle data." },
      { status: 500 }
    );
  }

  const { error: deleteSessionRowsError } = await admin
    .from("auth_session_devices")
    .delete()
    .eq("user_id", user.id);

  if (deleteSessionRowsError && deleteSessionRowsError.code !== "42P01") {
    return NextResponse.json(
      { error: deleteSessionRowsError.message || "Failed to delete session records." },
      { status: 500 }
    );
  }

  const { error: deleteProfileRowError } = await admin
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (deleteProfileRowError && deleteProfileRowError.code !== "42P01") {
    return NextResponse.json(
      { error: deleteProfileRowError.message || "Failed to delete profile data." },
      { status: 500 }
    );
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteAuthError) {
    return NextResponse.json(
      { error: deleteAuthError.message || "Failed to delete auth user." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
