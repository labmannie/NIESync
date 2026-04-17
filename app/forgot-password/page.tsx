"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AuthAlert } from "@/components/AuthAlert";
import { AuthField } from "@/components/AuthField";
import { AuthSection } from "@/components/AuthSection";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/utils/supabase/client";
import {
  DOMAIN_RESTRICTION_MESSAGE,
  GROUP_EMAIL_BLOCK_MESSAGE,
  checkAuthEmailStatus,
  isAllowedAuthEmail,
  normalizeInstitutionalEmail,
} from "@/lib/authEmail";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const clearMessages = () => {
    setFieldError("");
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    const normalizedEmail = normalizeInstitutionalEmail(email);
    if (!isAllowedAuthEmail(normalizedEmail)) {
      setFieldError(DOMAIN_RESTRICTION_MESSAGE);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const emailStatus = await checkAuthEmailStatus(normalizedEmail);

      if (!emailStatus.domainAllowed) {
        setFieldError(DOMAIN_RESTRICTION_MESSAGE);
        return;
      }

      if (emailStatus.blocked) {
        setFieldError(emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE);
        return;
      }

      if (!emailStatus.exists) {
        setFieldError("No account was found for this email.");
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setSuccess("A password reset link has been sent to your NIE email.");
    } catch (submitError: any) {
      setError(submitError.message || "Unable to send a reset link right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot password"
      description="Enter your NIE email to reset your password."
      size="compact"
      heroTitle="Reset your password"
      heroDescription="We&apos;ll send the reset link to your NIE email."
      heroHighlights={[
        {
          title: "NIE email only",
          description: "Use the same `@nie.ac.in` email linked to your account.",
        },
        {
          title: "One reset link",
          description: "Open the email and set a new password.",
        },
      ]}
      footer={
        <>
          Remembered your password?{" "}
          <Link href="/login" className="auth-inline-link font-bold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error ? <AuthAlert kind="error">{error}</AuthAlert> : null}
        {success ? <AuthAlert kind="success">{success}</AuthAlert> : null}

        <AuthSection
          title="Reset password"
          description="Enter the email linked to your account."
        >
          <AuthField
            label="NIE email"
            htmlFor="forgot-email"
            helper="Use the institutional email linked to your account."
            error={fieldError}
          >
            <input
              id="forgot-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={(event) => setEmail(normalizeInstitutionalEmail(event.target.value))}
              placeholder="name@nie.ac.in"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={Boolean(success)}
              aria-invalid={Boolean(fieldError)}
              className="auth-input focus-ring"
            />
          </AuthField>

          {!success ? (
            <button
              type="submit"
              disabled={isLoading}
              className="focus-ring auth-primary-button inline-flex items-center justify-center gap-2 px-5"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEmail("");
                setSuccess("");
              }}
              className="focus-ring auth-secondary-button px-5"
            >
              Use a different email
            </button>
          )}
        </AuthSection>
      </form>
    </AuthShell>
  );
}
