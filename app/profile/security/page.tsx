"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMark } from "@/app/_components/GoogleMark";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_verified: boolean | null;
  auth_provider: string | null;
};

function isWithinLast24Hours(timestamp?: string | null) {
  if (!timestamp) return false;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= 24 * 60 * 60 * 1000;
}

function formatDateTime(timestamp?: string | null) {
  if (!timestamp) return "Unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfileSecurityPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isLoading, setIsLoading] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [isLinkingPassword, setIsLinkingPassword] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleteConsentChecked, setDeleteConsentChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsLoading(true);
      setError("");

      try {
        const result = await supabase.auth.getSession();
        const user = result?.data?.session?.user || null;

        if (!active) return;

        if (!user) {
          window.location.href = "/login";
          return;
        }

        setAuthUser(user);
        setEmail(user.email || "");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email_verified, auth_provider")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;
        if (profileError) throw profileError;
        setProfile((profileData || null) as ProfileRow | null);
      } catch (bootstrapError: any) {
        if (!active) return;
        setError(bootstrapError?.message || "Unable to load security settings.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const authProviders = new Set<string>();
  const metadataProviders = Array.isArray(authUser?.app_metadata?.providers)
    ? authUser.app_metadata.providers
    : [];
  metadataProviders.forEach((provider: string) => {
    if (provider) authProviders.add(String(provider).toLowerCase());
  });
  if (authUser?.app_metadata?.provider) {
    authProviders.add(String(authUser.app_metadata.provider).toLowerCase());
  }

  const authProviderFromProfile = String(profile?.auth_provider || "").toLowerCase();
  if (authProviderFromProfile === "both") {
    authProviders.add("google");
    authProviders.add("email");
  } else if (authProviderFromProfile) {
    authProviders.add(authProviderFromProfile);
  }

  const hasGoogleProvider = authProviders.has("google");
  const hasEmailProvider = authProviders.has("email");
  const isGoogleOnlyAccount = hasGoogleProvider && !hasEmailProvider;
  const isEmailVerified = Boolean(profile?.email_verified);
  const isVerifiedUser = hasGoogleProvider || isEmailVerified;
  const verificationMethodText = hasEmailProvider
    ? "Verified via NIE Sync access link."
    : "Verified via Google Sign-In.";
  const isRecentLogin = isWithinLast24Hours(authUser?.last_sign_in_at);
  const canConfirmDelete =
    deleteConfirmationText.trim().toUpperCase() === "DELETE" &&
    deleteConsentChecked &&
    isRecentLogin;

  const handleSendVerificationEmail = async () => {
    if (!email) {
      setError("Unable to find your email for verification.");
      return;
    }

    setIsSendingVerificationEmail(true);
    setError("");
    setSuccess("");

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile/security&verify_email=1`,
        },
      });

      if (otpError) throw otpError;
      setSuccess("Verification link sent. Please check your NIE email inbox.");
    } catch (err: any) {
      setError(err.message || "Failed to send verification email.");
    } finally {
      setIsSendingVerificationEmail(false);
    }
  };

  const handleLinkPassword = async () => {
    if (linkPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLinkingPassword(true);
    setError("");
    setSuccess("");

    try {
      const { error: linkError } = await supabase.auth.updateUser({
        password: linkPassword,
      });
      if (linkError) throw linkError;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("profiles").update({ auth_provider: "both" }).eq("id", user.id);
      }

      setProfile((prev) => (prev ? { ...prev, auth_provider: "both" } : prev));
      setLinkPassword("");
      setSuccess("Password login linked successfully.");
    } catch (err: any) {
      setError(err.message || "Unable to link password login right now.");
    } finally {
      setIsLinkingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    setError("");
    setSuccess("");

    try {
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account consent",
            hd: "nie.ac.in",
          },
        },
      });

      if (linkError) throw linkError;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      if (err?.message?.includes("404") || err?.status === 404) {
        setError(
          "Identity linking is not enabled. Enable manual linking in Supabase Authentication Providers."
        );
      } else {
        setError(err.message || "Unable to link Google account.");
      }
      setIsLinkingGoogle(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("Unable to find your email.");
      return;
    }
    setIsSendingResetEmail(true);
    setError("");
    setSuccess("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSuccess("Password reset link sent to your institutional email.");
    } catch (err: any) {
      setError(err.message || "Unable to send password reset link.");
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleDownloadData = async () => {
    setIsDownloadingData(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be logged in to export your data.");

      const [
        { data: profileData, error: profileError },
        { data: vehiclesData, error: vehiclesError },
        { data: sessionsData, error: sessionsError },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("profile_vehicles").select("*").eq("profile_id", user.id).order("created_at", { ascending: true }),
        supabase
          .from("auth_session_devices")
          .select("id, session_id, user_agent, ip_address, location_label, created_at, last_seen_at, revoked_at")
          .eq("user_id", user.id)
          .order("last_seen_at", { ascending: false }),
      ]);

      if (profileError) throw profileError;
      if (vehiclesError && vehiclesError.code !== "42P01") throw vehiclesError;
      if (sessionsError && sessionsError.code !== "42P01") throw sessionsError;

      const payload = {
        exported_at: new Date().toISOString(),
        source: "NIE Sync",
        auth: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata,
        },
        profile: profileData,
        vehicles: vehiclesData || [],
        sessions: sessionsData || [],
      };

      const fileContent = JSON.stringify(payload, null, 2);
      const blob = new Blob([fileContent], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `niesync-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setSuccess("Your account data export is ready.");
    } catch (err: any) {
      setError(err.message || "Unable to download your data right now.");
    } finally {
      setIsDownloadingData(false);
    }
  };

  const handleReauthenticateForDeletion = async () => {
    setError("");
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login?reauth=delete-account");
  };

  const handleDeleteAccount = async () => {
    if (!isRecentLogin) {
      setError("For account safety, sign in again. Last login must be within 24 hours.");
      return;
    }

    if (deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }

    if (!deleteConsentChecked) {
      setError("Please confirm that you understand this action is permanent.");
      return;
    }

    setIsDeletingAccount(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/auth/callback?action=delete-account", {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete account right now.");
      }

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Session may already be invalidated.
      }

      setIsDeleteModalOpen(false);
      router.replace("/login?account=deleted");
    } catch (err: any) {
      setError(err.message || "Unable to delete account right now.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
        <div className="mx-auto w-full max-w-5xl space-y-5 animate-pulse">
          <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-64 rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="h-64 rounded-3xl border border-white/10 bg-white/[0.03]" />
          </div>
          <div className="h-56 rounded-3xl border border-white/10 bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.45)] md:p-7"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
                Account Settings
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-4xl">
                Security, Access and Privacy
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-text-secondary md:text-base">
                Manage login methods, security verification, and sensitive account controls from one place.
              </p>
            </div>
            <Link
              href="/profile/sessions"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors hover:bg-white/20"
            >
              View Auth History
            </Link>
          </div>
        </motion.header>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </motion.div>
          ) : null}
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm text-green-200"
            >
              {success}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
              Verification and Providers
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <span className="text-white/70">Status</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                    isVerifiedUser
                      ? "border border-green-500/35 bg-green-500/15 text-green-200"
                      : "border border-amber-400/35 bg-amber-500/15 text-amber-100"
                  }`}
                >
                  {isVerifiedUser ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {isVerifiedUser ? "Verified" : "Pending"}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-white/90">
                {isVerifiedUser ? verificationMethodText : "Unverified account. Verify email to complete trusted status."}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-white/90">
                  <Mail className="h-3.5 w-3.5" />
                  {email}
                </span>
                {hasGoogleProvider ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-white/90">
                    <GoogleMark className="h-3.5 w-3.5" />
                    Google linked
                  </span>
                ) : null}
              </div>
            </div>

            {!isVerifiedUser && hasEmailProvider ? (
              <button
                type="button"
                onClick={handleSendVerificationEmail}
                disabled={isSendingVerificationEmail}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
              >
                {isSendingVerificationEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {isSendingVerificationEmail ? "Sending..." : "Send Verification Link"}
              </button>
            ) : null}
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
              Login Methods
            </h2>
            <div className="mt-4 space-y-4">
              {isGoogleOnlyAccount ? (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                    Link Password Login
                  </p>
                  <div className="relative mt-2">
                    <input
                      type={showLinkPassword ? "text" : "password"}
                      value={linkPassword}
                      onChange={(event) => setLinkPassword(event.target.value)}
                      placeholder="Create password (min 6 chars)"
                      className="w-full rounded-xl border border-white/10 bg-black/35 p-3 pr-10 text-sm outline-none transition-colors focus:border-accent-blue/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLinkPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                    >
                      {showLinkPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleLinkPassword}
                    disabled={isLinkingPassword}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    {isLinkingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    {isLinkingPassword ? "Linking..." : "Link Password"}
                  </button>
                </div>
              ) : null}

              {hasEmailProvider && !hasGoogleProvider ? (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">Link Google Account</p>
                  <p className="mt-1 text-sm text-white/75">
                    Connect your NIE Google Workspace for one-click sign-in.
                  </p>
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    {isLinkingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark className="h-4 w-4" />}
                    {isLinkingGoogle ? "Connecting..." : "Link Google"}
                  </button>
                </div>
              ) : null}

              {(hasEmailProvider || authProviderFromProfile === "both") ? (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isSendingResetEmail}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
                >
                  {isSendingResetEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {isSendingResetEmail ? "Sending..." : "Send Password Reset Link"}
                </button>
              ) : null}
            </div>
          </article>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
            Data and Account Controls
          </h2>
          <p className="mt-3 text-sm text-white/80">
            Export your account data or permanently remove your account. Sensitive actions require recent login.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleDownloadData}
              disabled={isDownloadingData}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              {isDownloadingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloadingData ? "Preparing..." : "Download My Data"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmationText("");
                setDeleteConsentChecked(false);
                setIsDeleteModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/45 bg-red-500/15 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-red-200 transition-colors hover:bg-red-500/25"
            >
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
          {!isRecentLogin ? (
            <div className="mt-4 inline-flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Last login is older than 24 hours. Re-authentication is required before deletion.
            </div>
          ) : null}
        </section>
      </div>

      <AnimatePresence>
        {isDeleteModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              className="mx-auto mt-20 w-full max-w-xl rounded-2xl border border-white/10 bg-[#101010] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-[0.06em]">Confirm Account Deletion</h3>
                  <p className="mt-2 text-sm text-white/75">
                    This permanently removes your NIE Sync account, profile data, and linked vehicles.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDeletingAccount) setIsDeleteModalOpen(false);
                  }}
                  className="rounded-lg border border-white/15 p-1.5 text-white/70 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-text-secondary">Security Check</p>
                <p className="mt-1 text-sm text-white">Last login: {formatDateTime(authUser?.last_sign_in_at)}</p>
                {!isRecentLogin ? (
                  <button
                    type="button"
                    onClick={handleReauthenticateForDeletion}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Re-authenticate
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
                    Type DELETE to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(event) => setDeleteConfirmationText(event.target.value)}
                    placeholder="DELETE"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm outline-none focus:border-red-400/60"
                  />
                </div>
                <label className="flex items-start gap-2 text-xs text-white/75">
                  <input
                    type="checkbox"
                    checked={deleteConsentChecked}
                    onChange={(event) => setDeleteConsentChecked(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-red-500"
                  />
                  I understand this action is permanent and cannot be undone.
                </label>
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!isDeletingAccount) setIsDeleteModalOpen(false);
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={!canConfirmDelete || isDeletingAccount}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/20 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-100 disabled:opacity-55"
                >
                  {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isDeletingAccount ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
