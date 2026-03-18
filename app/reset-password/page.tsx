"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, Shield, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Supabase automatically handles the token from the URL hash
    // when the user lands on this page from the reset email link.
    // We listen for the PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsReady(true);
      }
    });

    // Also check if user is already authenticated (e.g. navigated directly)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsReady(true);
      }
    });

    // Check for error in URL parameters
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    if (errorParam) {
      setError(errorDescription || "The password reset link is invalid or has expired. Please request a new one.");
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) throw updateError;

      setSuccess("Password has been reset successfully! Redirecting to sign in...");

      // Sign out and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut({ scope: "local" });
        router.push("/login?reset=success");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Unable to reset password. The link may have expired.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex items-center justify-center relative overflow-hidden selection:bg-accent-amber/30 p-4 pt-28">
      {/* Abstract Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl opacity-40 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent-amber/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center mb-10"
        >
          <Link href="/" className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-6 shadow-xl hover:bg-white/10 transition-colors">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="w-8 h-8 object-contain" />
          </Link>
          <h1 className="text-3xl font-bold uppercase tracking-widest text-white mb-2">Reset Password</h1>
          <p className="text-text-secondary text-sm font-medium tracking-wide text-center">Create your new secure password.</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-8 md:p-10 rounded-sm border border-white/10 shadow-2xl relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-amber to-transparent"></div>

          <form onSubmit={handleResetPassword} className="flex flex-col gap-6">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-sm text-sm flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-sm text-sm flex items-start gap-2"
                >
                  <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{success}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {!isReady && !error && !success && (
              <div className="flex items-center gap-2 text-text-secondary bg-white/5 p-4 rounded-sm border border-white/5">
                <span className="w-5 h-5 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin"></span>
                <span className="text-sm">Verifying your reset link...</span>
              </div>
            )}

            {isReady && !success && (
              <>
                {/* New Password */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-12 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-12 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Password strength indicator */}
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                        password.length >= level * 3
                          ? password.length >= 12
                            ? "bg-green-500"
                            : password.length >= 8
                            ? "bg-accent-amber"
                            : "bg-red-400"
                          : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider -mt-4">
                  {password.length === 0
                    ? "Enter a secure password"
                    : password.length < 6
                    ? "Too short"
                    : password.length < 8
                    ? "Weak"
                    : password.length < 12
                    ? "Good"
                    : "Strong"}
                </p>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 bg-accent-amber text-campus-black font-bold uppercase tracking-widest text-sm py-4 clip-diagonal hover:bg-[#FFC133] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="w-5 h-5 border-2 border-campus-black/30 border-t-campus-black rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <span>Set New Password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}

            {!isReady && error && (
              <Link
                href="/forgot-password"
                className="mt-2 bg-accent-amber text-campus-black font-bold uppercase tracking-widest text-sm py-4 clip-diagonal hover:bg-[#FFC133] transition-all duration-200 flex items-center justify-center gap-2 text-center"
              >
                <span>Request New Reset Link</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </form>
        </motion.div>

        <p className="text-center text-text-secondary text-xs mt-8">
          <Link href="/login" className="inline-flex items-center gap-1 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-campus-black w-full flex items-center justify-center text-white/50 animate-pulse">Verifying reset link...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
