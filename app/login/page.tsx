"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

import { AuthAlert } from "@/components/AuthAlert";
import { AuthField } from "@/components/AuthField";
import { AuthSection } from "@/components/AuthSection";
import { AuthShell } from "@/components/AuthShell";
import { GoogleMark } from "@/app/_components/GoogleMark";
import { createClient } from "@/utils/supabase/client";
import {
  DOMAIN_RESTRICTION_MESSAGE,
  GROUP_EMAIL_BLOCK_MESSAGE,
  checkAuthEmailStatus,
  isAllowedAuthEmail,
  normalizeInstitutionalEmail,
} from "@/lib/authEmail";

type LoginFieldErrors = {
  email?: string;
  password?: string;
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"password" | "magiclink">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get("error");
    const reauth = searchParams.get("reauth");
    const account = searchParams.get("account");
    const session = searchParams.get("session");
    const reset = searchParams.get("reset");

    if (urlError === "invalid-domain") {
      setError(DOMAIN_RESTRICTION_MESSAGE);
      router.replace("/login");
      return;
    }

    if (urlError === "blocked-group") {
      setError(GROUP_EMAIL_BLOCK_MESSAGE);
      router.replace("/login");
      return;
    }

    if (urlError === "session-revoked") {
      setError("This session was signed out on another device. Please sign in again.");
      router.replace("/login");
      return;
    }

    if (urlError === "auth-callback-failed") {
      setError("Sign-in could not be completed. Please try again.");
      router.replace("/login");
      return;
    }

    if (reauth === "delete-account") {
      setSuccess("Please sign in again to continue with account deletion.");
      router.replace("/login");
      return;
    }

    if (account === "deleted") {
      setSuccess("Your account has been deleted.");
      router.replace("/login");
      return;
    }

    if (session === "logged-out") {
      setSuccess("You have been signed out.");
      router.replace("/login");
      return;
    }

    if (reset === "success") {
      setSuccess("Your password was changed. Sign in with the new password.");
      router.replace("/login");
    }
  }, [router, searchParams]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
    setFieldErrors({});
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    const normalizedEmail = normalizeInstitutionalEmail(email);
    const nextFieldErrors: LoginFieldErrors = {};

    if (!isAllowedAuthEmail(normalizedEmail)) {
      nextFieldErrors.email = DOMAIN_RESTRICTION_MESSAGE;
    }

    if (mode === "password" && password.length < 6) {
      nextFieldErrors.password = "Enter the password for this account.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const emailStatus = await checkAuthEmailStatus(normalizedEmail);

      if (!emailStatus.domainAllowed) {
        setFieldErrors({ email: DOMAIN_RESTRICTION_MESSAGE });
        return;
      }

      if (emailStatus.blocked) {
        const blockedMessage = emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE;
        setFieldErrors({ email: blockedMessage });
        return;
      }

      if (!emailStatus.exists) {
        setFieldErrors({ email: "No account was found for this email. Create an account first." });
        return;
      }

      setEmail(normalizedEmail);

      if (mode === "magiclink") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/auth/callback?screen=login&next=/lost-and-found`,
          },
        });

        if (otpError) {
          if (otpError.message.includes("Signups not allowed")) {
            setFieldErrors({ email: "No account was found for this email. Create an account first." });
          } else {
            setError(otpError.message);
          }
          return;
        }

        setMagicLinkSent(true);
        setSuccess("A sign-in link has been sent to your NIE email.");
        return;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (loginError) {
        if (loginError.message.includes("Invalid login credentials")) {
          setFieldErrors({
            password:
              "Email or password is incorrect. If this account uses Google, sign in with Google instead.",
          });
        } else {
          setError(loginError.message);
        }
        return;
      }

      router.push("/lost-and-found");
    } catch (submitError: any) {
      setError(submitError.message || "Unable to sign in right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    clearMessages();
    const supabase = createClient();

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?screen=login&next=/lost-and-found`,
        queryParams: {
          prompt: "select_account consent",
        },
      },
    });

    if (googleError) {
      if (googleError.message.toLowerCase().includes("invalid domain")) {
        setFieldErrors({ email: DOMAIN_RESTRICTION_MESSAGE });
      } else {
        setError(googleError.message);
      }
    }
  };

  return (
    <AuthShell
      title="Sign in"
      description="Use your NIE email to sign in."
      heroTitle="Sign in to NIESync"
      heroDescription="Use your NIE account to continue."
      heroHighlights={[
        {
          title: "NIE accounts only",
          description: "Sign in with your `@nie.ac.in` account.",
        },
        {
          title: "Choose one method",
          description: "Use your password, email link, or Google Workspace.",
        },
      ]}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="auth-inline-link font-bold hover:underline">
            Create one
          </Link>
          <span className="mx-2 text-white/28">|</span>
          <Link href="/terms-of-service" className="hover:text-white hover:underline">
            Terms
          </Link>
          <span className="mx-2 text-white/28">|</span>
          <Link href="/privacy-policy" className="hover:text-white hover:underline">
            Privacy
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error ? <AuthAlert kind="error">{error}</AuthAlert> : null}
        {success ? <AuthAlert kind="success">{success}</AuthAlert> : null}

        <AuthSection
          title="Sign in"
          description="Choose how you want to sign in."
        >
          <AuthField
            label="NIE email"
            htmlFor="login-email"
            helper="Only `@nie.ac.in` accounts are allowed."
            error={fieldErrors.email}
          >
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={(event) => setEmail(normalizeInstitutionalEmail(event.target.value))}
              placeholder="name@nie.ac.in"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={magicLinkSent}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              className="auth-input focus-ring"
            />
          </AuthField>

          <AuthField label="Sign in method">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setMagicLinkSent(false);
                  clearMessages();
                }}
                className={`focus-ring auth-choice ${mode === "password" ? "is-active" : ""}`}
                aria-pressed={mode === "password"}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("magiclink");
                  setMagicLinkSent(false);
                  clearMessages();
                }}
                className={`focus-ring auth-choice ${mode === "magiclink" ? "is-active" : ""}`}
                aria-pressed={mode === "magiclink"}
              >
                Email link
              </button>
            </div>
          </AuthField>

          {mode === "password" ? (
            <AuthField
              label="Password"
              htmlFor="current-password"
              error={fieldErrors.password}
              labelTrailing={
                <Link href="/forgot-password" className="auth-inline-link text-sm font-semibold hover:underline">
                  Forgot password?
                </Link>
              }
            >
              <div className="relative">
                <input
                  id="current-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required={mode === "password"}
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
          ) : (
            <AuthAlert>
              We&apos;ll send a sign-in link to your NIE email.
            </AuthAlert>
          )}

          {!magicLinkSent ? (
            <button
              type="submit"
              disabled={isLoading}
              className="focus-ring auth-primary-button inline-flex items-center justify-center gap-2 px-5"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span>{mode === "password" ? "Continue" : "Send sign-in link"}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMagicLinkSent(false);
                setSuccess("");
              }}
              className="focus-ring auth-secondary-button px-5"
            >
              Use a different email
            </button>
          )}

          <div className="auth-or-divider">
            <span>Or</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            className="focus-ring auth-secondary-button inline-flex items-center justify-center gap-3 px-5"
          >
            <GoogleMark className="h-5 w-5" />
            <span>Google Workspace (@nie.ac.in)</span>
          </button>
        </AuthSection>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="auth-shell flex items-center justify-center text-white/50">Loading sign-in...</div>}
    >
      <LoginContent />
    </Suspense>
  );
}
