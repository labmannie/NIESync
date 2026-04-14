"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { MobileToast } from "@/components/MobileToast";
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
  const [mobileToast, setMobileToast] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [isLinkingPassword, setIsLinkingPassword] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isDataExportModalOpen, setIsDataExportModalOpen] = useState(false);
  const [dataExportStep, setDataExportStep] = useState<"info" | "confirmed">("info");
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
        const { user, errorMessage } = await resolveClientUser(supabase);

        if (!active) return;

        if (!user) {
          if (errorMessage) {
            setError(errorMessage);
          }
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

  useEffect(() => {
    if (!error) return;
    setMobileToast({ kind: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (!success) return;
    setMobileToast({ kind: "success", message: success });
  }, [success]);

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
    setError("");
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
    setError("");
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
    setError("");
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

  const handleOpenDataExportModal = () => {
    setDataExportStep("info");
    setIsDataExportModalOpen(true);
  };

  const handleConfirmDataExport = () => {
    setDataExportStep("confirmed");

    // Fire-and-forget: send the request in the background, user doesn't wait
    void fetch("/api/export-my-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {
      // Silent — user already sees the confirmation message
    });
  };

  const handleReauthenticateForDeletion = async () => {
    setError("");
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login?reauth=delete-account");
  };

  const handleDeleteAccount = async () => {
    setError("");
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-16 pt-32 text-white md:px-8">
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-16 pt-32 text-white md:px-8">
      <MobileToast
        kind={mobileToast?.kind || "info"}
        message={mobileToast?.message || ""}
        open={Boolean(mobileToast?.message)}
        onClose={() => setMobileToast(null)}
      />
      <div className="mx-auto w-full max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.14)_0%,rgba(255,176,0,0.1)_55%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.5)] md:p-7"
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent-blue/45 bg-accent-blue/20 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-accent-blue/30"
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
              className="mt-4 hidden rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:block"
            >
              {error}
            </motion.div>
          ) : null}
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 hidden rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm text-green-200 md:block"
            >
              {success}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-black/35 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-6">
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

          <article className="rounded-[24px] border border-white/10 bg-black/35 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-6">
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

        <section className="mt-5 rounded-[24px] border border-white/10 bg-black/35 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
            Data and Account Controls
          </h2>
          <p className="mt-3 text-sm text-white/80">
            Export your account data or permanently remove your account. Sensitive actions require recent login.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
               type="button"
               onClick={handleOpenDataExportModal}
               className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20"
             >
               <Download className="h-4 w-4" />
               Download My Data
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

      {/* ── Data Export Modal ── */}
      <AnimatePresence>
        {isDataExportModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/80 px-3 py-8 backdrop-blur-sm sm:items-center sm:px-4 sm:py-0"
            onClick={(e) => { if (e.target === e.currentTarget) setIsDataExportModalOpen(false); }}
          >
            <motion.div
              initial={{ y: 18, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#0a0a0a_0%,#111111_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.7)] sm:rounded-[22px]"
            >
              {/* Header strip */}
              <div className="relative overflow-hidden bg-gradient-to-r from-[#0a0f24] to-[#0d1430] px-4 py-4 sm:px-6 sm:py-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.2),transparent_60%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-blue/20 border border-accent-blue/30 sm:h-10 sm:w-10">
                      <Shield className="h-4 w-4 text-accent-blue sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFB000] sm:text-[10px]">NIE Sync</p>
                      <p className="truncate text-sm font-black text-white sm:text-base">Personal Data Export</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDataExportModalOpen(false)}
                    className="shrink-0 rounded-lg border border-white/15 p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="px-4 py-4 sm:px-6 sm:py-5">
                {/* Step: Info */}
                {dataExportStep === "info" ? (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/8 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400 sm:h-5 sm:w-5" />
                      <div>
                        <p className="text-xs font-bold text-amber-100 sm:text-sm">This may take a few minutes</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80 sm:text-xs">
                          We'll gather your complete profile, all parking reports with chat transcripts, and your full authentication history. This data will be compiled into <strong>3 professionally formatted PDF documents</strong> and sent directly to your registered email.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-blue/15 text-[10px] font-black text-accent-blue sm:h-7 sm:w-7 sm:text-[11px]">1</div>
                        <p className="text-[11px] text-white/80 sm:text-xs"><span className="font-bold text-white">Profile & Activity Summary</span> — Your profile, parking reports table</p>
                      </div>
                      <div className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-blue/15 text-[10px] font-black text-accent-blue sm:h-7 sm:w-7 sm:text-[11px]">2</div>
                        <p className="text-[11px] text-white/80 sm:text-xs"><span className="font-bold text-white">Chat Transcripts</span> — Every report conversation</p>
                      </div>
                      <div className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-blue/15 text-[10px] font-black text-accent-blue sm:h-7 sm:w-7 sm:text-[11px]">3</div>
                        <p className="text-[11px] text-white/80 sm:text-xs"><span className="font-bold text-white">Auth History</span> — Complete login & session records</p>
                      </div>
                    </div>

                    <p className="text-[10px] leading-relaxed text-white/50 sm:text-[11px]">
                      By proceeding, your data will be emailed to <strong className="text-white/70">{email}</strong>. Please check your inbox in a few minutes.
                    </p>

                    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setIsDataExportModalOpen(false)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] px-5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/80 transition-colors hover:bg-white/10 sm:h-auto sm:py-2.5 sm:text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDataExport}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/20 px-5 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-blue/30 sm:h-auto sm:py-2.5 sm:text-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        I Understand, Proceed
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Step: Confirmed — user can close immediately */}
                {dataExportStep === "confirmed" ? (
                  <div className="flex flex-col items-center px-2 py-5 sm:py-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 sm:h-16 sm:w-16">
                      <Mail className="h-7 w-7 text-emerald-400 sm:h-8 sm:w-8" />
                    </div>
                    <h3 className="mt-4 text-center text-sm font-black text-white sm:text-base">Request Submitted!</h3>
                    <p className="mt-2 max-w-xs text-center text-[11px] leading-relaxed text-white/60 sm:text-xs">
                      Your data is being prepared and will be sent to <strong className="text-white/80">{email}</strong> within the next few minutes. Please check your inbox (and spam folder).
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[9px] text-white/40 sm:mt-5 sm:gap-2 sm:text-[10px]">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 sm:px-2.5 sm:py-1">📋 Profile Summary</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 sm:px-2.5 sm:py-1">💬 Chat Transcripts</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 sm:px-2.5 sm:py-1">🔐 Auth History</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDataExportModalOpen(false)}
                      className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 text-[11px] font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 sm:mt-6 sm:h-auto sm:py-2.5 sm:text-xs"
                    >
                      Got it, Close
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
