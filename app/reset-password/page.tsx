"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

import { AuthAlert } from "@/components/AuthAlert";
import { AuthField } from "@/components/AuthField";
import { AuthSection } from "@/components/AuthSection";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/utils/supabase/client";
import {
  DOMAIN_RESTRICTION_MESSAGE,
  GROUP_EMAIL_BLOCK_MESSAGE,
  checkAuthEmailStatus,
  normalizeInstitutionalEmail,
} from "@/lib/authEmail";

type ResetFieldErrors = {
  password?: string;
  confirmPassword?: string;
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ResetFieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const validateCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return false;
      }

      const normalizedEmail = normalizeInstitutionalEmail(user.email || "");
      const emailStatus = await checkAuthEmailStatus(normalizedEmail);

      if (!emailStatus.domainAllowed) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error(DOMAIN_RESTRICTION_MESSAGE);
      }

      if (emailStatus.blocked) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error(emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE);
      }

      if (!emailStatus.exists) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("No account was found for this reset link. Request a new one.");
      }

      return true;
    };

    const bootstrap = async () => {
      const errorParam = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");
      if (errorParam) {
        if (!cancelled) {
          setError(errorDescription || "This reset link is invalid or has expired. Request a new one.");
        }
        return;
      }

      try {
        const readyFromSession = await validateCurrentUser();
        if (!cancelled && readyFromSession) {
          setIsReady(true);
          return;
        }
      } catch (bootstrapError: any) {
        if (!cancelled) {
          setError(bootstrapError.message || "Unable to verify this reset link.");
        }
        return;
      }

      const hasRecoveryHash =
        typeof window !== "undefined" &&
        (window.location.hash.includes("type=recovery") || window.location.hash.includes("access_token="));

      if (!hasRecoveryHash && !cancelled) {
        setError("This reset link is invalid or has expired. Request a new one.");
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }

      try {
        const readyFromRecovery = await validateCurrentUser();
        if (!cancelled && readyFromRecovery) {
          setError("");
          setIsReady(true);
        }
      } catch (recoveryError: any) {
        if (!cancelled) {
          setError(recoveryError.message || "Unable to verify this reset link.");
        }
      }
    });

    void bootstrap();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams, supabase]);

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setFieldErrors({});

    const nextFieldErrors: ResetFieldErrors = {};

    if (password.length < 6) {
      nextFieldErrors.password = "Password must be at least 6 characters long.";
    }

    if (password !== confirmPassword) {
      nextFieldErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess("Your password has been updated. Redirecting to sign in...");

      window.setTimeout(async () => {
        await supabase.auth.signOut({ scope: "local" });
        router.push("/login?reset=success");
      }, 1800);
    } catch (submitError: any) {
      setError(submitError.message || "Unable to reset your password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      description="Set a new password for your NIE account."
      size="compact"
      heroTitle="Set a new password"
      heroDescription="Choose a new password and sign in again."
      heroHighlights={[
        {
          title: "Recovery link required",
          description: "This page works only with a valid reset link.",
        },
        {
          title: "Password check",
          description: "Make sure both password fields match.",
        },
      ]}
      footer={
        <Link href="/login" className="auth-inline-link font-bold hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleResetPassword} className="flex flex-col gap-6">
        {error ? <AuthAlert kind="error">{error}</AuthAlert> : null}
        {success ? <AuthAlert kind="success">{success}</AuthAlert> : null}
        {!isReady && !error && !success ? <AuthAlert>Checking your reset link...</AuthAlert> : null}

        {isReady && !success ? (
          <AuthSection
            title="New password"
            description="Choose and confirm your new password."
          >
            <AuthField label="New password" htmlFor="new-password" error={fieldErrors.password}>
              <div className="relative">
                <input
                  id="new-password"
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="auth-input focus-ring pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="focus-ring absolute right-4 top-1/2 -translate-y-1/2 text-white/55 transition hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </AuthField>

            <AuthField label="Confirm password" htmlFor="confirm-password" error={fieldErrors.confirmPassword}>
              <div className="relative">
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  className="auth-input focus-ring pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                  className="focus-ring absolute right-4 top-1/2 -translate-y-1/2 text-white/55 transition hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </AuthField>

            <button
              type="submit"
              disabled={isLoading}
              className="focus-ring auth-primary-button inline-flex items-center justify-center gap-2 px-5"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span>Set new password</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </AuthSection>
        ) : null}

        {!isReady && error ? (
          <Link
            href="/forgot-password"
            className="focus-ring auth-secondary-button inline-flex items-center justify-center gap-2 px-5"
          >
            <span>Request a new reset link</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="auth-shell flex items-center justify-center text-white/50">Checking reset link...</div>}
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
