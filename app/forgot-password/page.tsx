"use client";

import { useState } from "react";
import { Mail, ArrowLeft, ArrowRight, AlertCircle, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

const DOMAIN_RESTRICTION_MESSAGE = "Access restricted to NIE students and staff only.";
const GROUP_EMAIL_BLOCK_MESSAGE = "Group email addresses are not allowed for individual accounts.";

async function checkEmailStatus(email: string) {
  const response = await fetch(
    `/auth/callback?action=check-email&email=${encodeURIComponent(email)}`,
    { method: "GET", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Unable to verify this email right now. Please try again.");
  }

  return (await response.json()) as {
    exists: boolean;
    providers: string[];
    domainAllowed: boolean;
    blocked: boolean;
    blockedReason?: string | null;
  };
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith("@nie.ac.in")) {
      setError(DOMAIN_RESTRICTION_MESSAGE);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      // Check if the email is blocked (group email) or domain not allowed
      const emailStatus = await checkEmailStatus(normalizedEmail);

      if (!emailStatus.domainAllowed) {
        setError(DOMAIN_RESTRICTION_MESSAGE);
        return;
      }

      if (emailStatus.blocked) {
        const blockedMessage = emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE;
        setError(blockedMessage);
        return;
      }

      if (!emailStatus.exists) {
        setError("No account found with this email. Please sign up first.");
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      setSuccess("Password reset link sent! Check your institutional email inbox. The link expires in 1 hour.");
    } catch (err: any) {
      setError(err.message || "Unable to send reset link right now. Please try again.");
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
          <h1 className="text-3xl font-bold uppercase tracking-widest text-white mb-2">Forgot Password</h1>
          <p className="text-text-secondary text-sm font-medium tracking-wide text-center">Enter your institutional email to receive a reset link.</p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-8 md:p-10 rounded-sm border border-white/10 shadow-2xl relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-amber to-transparent"></div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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

            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Institutional Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
                  placeholder="name.yr@nie.ac.in"
                  className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  disabled={!!success}
                />
              </div>
            </div>

            {!success && (
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 bg-accent-amber text-campus-black font-bold uppercase tracking-widest text-sm py-4 clip-diagonal hover:bg-[#FFC133] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-campus-black/30 border-t-campus-black rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>Send Reset Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {success && (
              <button
                type="button"
                onClick={() => { setSuccess(""); setEmail(""); }}
                className="bg-white/5 hover:bg-white/10 uppercase tracking-widest py-3 font-bold text-xs text-text-secondary rounded-sm transition-colors border border-white/10"
              >
                Send to a Different Email
              </button>
            )}
          </form>
        </motion.div>

        <p className="text-center text-text-secondary text-xs mt-8">
          Remember your password?{" "}
          <Link href="/login" className="text-accent-amber hover:underline font-bold tracking-wide">
            SIGN IN
          </Link>
          <br /><br />
          <Link href="/" className="inline-flex items-center gap-1 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to Home
          </Link>
        </p>
      </div>
    </main>
  );
}
