"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

const DOMAIN_RESTRICTION_MESSAGE = "Access restricted to NIE students and staff only.";
const GROUP_EMAIL_BLOCK_MESSAGE =
  "Group email addresses are not allowed for individual accounts.";

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

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loginMode, setLoginMode] = useState<"password" | "magiclink">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "invalid-domain") {
      setError(DOMAIN_RESTRICTION_MESSAGE);
      setToastMessage(DOMAIN_RESTRICTION_MESSAGE);
      router.replace("/login");
    }
    if (searchParams.get("error") === "blocked-group") {
      setError(GROUP_EMAIL_BLOCK_MESSAGE);
      setToastMessage(GROUP_EMAIL_BLOCK_MESSAGE);
      router.replace("/login");
    }
    if (searchParams.get("error") === "session-revoked") {
      setError("This session was signed out from another device. Please log in again.");
      router.replace("/login");
    }
    if (searchParams.get("reauth") === "delete-account") {
      setSuccess("Please sign in again to continue with account deletion.");
      router.replace("/login");
    }
    if (searchParams.get("account") === "deleted") {
      setSuccess("Your account has been deleted successfully.");
      router.replace("/login");
    }
    if (searchParams.get("session") === "logged-out") {
      setSuccess("You have been logged out from this session.");
      router.replace("/login");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith("@nie.ac.in")) {
      setError(DOMAIN_RESTRICTION_MESSAGE);
      setToastMessage(DOMAIN_RESTRICTION_MESSAGE);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const emailStatus = await checkEmailStatus(normalizedEmail);

      if (!emailStatus.domainAllowed) {
        setError(DOMAIN_RESTRICTION_MESSAGE);
        setToastMessage(DOMAIN_RESTRICTION_MESSAGE);
        return;
      }

      if (emailStatus.blocked) {
        const blockedMessage = emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE;
        setError(blockedMessage);
        setToastMessage(blockedMessage);
        return;
      }

      if (!emailStatus.exists) {
        setError("Account not found. Please sign up first.");
        return;
      }

      setEmail(normalizedEmail);

      // ACCESS LINK FLOW
      if (loginMode === "magiclink" && !magicLinkSent) {
        const { error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: false, // Explicitly deny signup from login page
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        });

        if (error) {
          if (error.message.includes("Signups not allowed")) {
            setError("Account not found. Please request access (Sign Up) first.");
          } else {
            setError(error.message);
          }
        } else {
          setSuccess("Access Link sent! Check your institutional email inbox to securely sign in without a password.");
          setMagicLinkSent(true);
        }
        return;
      }

      // PASSWORD FLOW
      if (password.length < 6) {
        setError("Invalid credentials. Password must be at least 6 characters.");
        return;
      }

      // Attempt Sign In
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        // Identity Header check heuristic
        // Supabase returns standard "Invalid login credentials" if password fails or if it's purely an OAuth account.
        if (error.message.includes("Invalid login credentials")) {
          setError("Invalid credentials. If you previously registered using Google Workspace or an Access Link, please use that method instead.");
        } else {
          setError(error.message);
        }
        return;
      }

      // Success redirect
      router.push("/lost-and-found");
    } catch (err: any) {
      setError(err.message || "Unable to verify email right now.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account consent",
        },
      }
    });

    if (error) {
      if (error.message.toLowerCase().includes("invalid domain")) {
        setError(DOMAIN_RESTRICTION_MESSAGE);
        setToastMessage(DOMAIN_RESTRICTION_MESSAGE);
      } else {
        setError(error.message);
      }
    }
  };

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex items-center justify-center relative overflow-hidden selection:bg-accent-amber/30 p-4 pt-28">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            className="fixed top-24 right-4 z-50 bg-red-500/95 text-white text-sm px-4 py-3 rounded-sm shadow-2xl border border-red-300/40"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      
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
          <h1 className="text-3xl font-bold uppercase tracking-widest text-white mb-2">Campus Sync</h1>
          <p className="text-text-secondary text-sm font-medium tracking-wide">SECURE INSTITUTIONAL ACCESS</p>
        </motion.div>

        {/* Login Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-8 md:p-10 rounded-sm border border-white/10 shadow-2xl relative"
        >
          {/* Top border highlight */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-amber to-transparent"></div>

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            
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
                  disabled={magicLinkSent}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(event) => setEmail(event.target.value.trim().toLowerCase())}
                  placeholder="name.yr@nie.ac.in" 
                  className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20 disabled:opacity-50"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
            </div>

            {/* Dynamic Auth Method Toggles */}
            <AnimatePresence mode="wait">
              {loginMode === "password" && !magicLinkSent && (
                <motion.div 
                  key="password-mode"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2"
                >
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary flex justify-between">
                    <span>Secure Password</span>
                    <button type="button" onClick={() => { setLoginMode("magiclink"); setError(""); }} className="text-accent-amber hover:underline tracking-widest uppercase text-[10px]">
                      Use Access Link?
                    </button>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="********" 
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-12 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20"
                      autoComplete="current-password"
                      required={loginMode === "password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {loginMode === "magiclink" && !magicLinkSent && (
                <motion.div 
                  key="magiclink-request"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2"
                >
                  <div className="flex justify-end w-full">
                     <button type="button" onClick={() => { setLoginMode("password"); setError(""); }} className="text-accent-amber hover:underline tracking-widest uppercase text-[10px] font-bold">
                        Use Password Instead?
                      </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-text-secondary bg-white/5 p-3 rounded-sm border border-white/5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-accent-amber" />
                    <span className="text-xs leading-relaxed">We will send a secure NIE Sync Access Link to your institutional inbox. Click it to sign in without a password.</span>
                  </div>
                </motion.div>
              )}

              {magicLinkSent && (
                <motion.div 
                  key="magiclink-sent"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2"
                >
                  <button type="button" onClick={() => { setMagicLinkSent(false); setSuccess(""); }} className="bg-white/5 hover:bg-white/10 uppercase tracking-widest py-3 font-bold text-xs text-text-secondary rounded-sm transition-colors border border-white/10">
                    Change Email / Resend
                  </button>
                </motion.div>
              )}

            </AnimatePresence>

            {!magicLinkSent && (
              <button 
                type="submit" 
                disabled={isLoading}
                className="mt-2 bg-accent-amber text-campus-black font-bold uppercase tracking-widest text-sm py-4 clip-diagonal hover:bg-[#FFC133] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-campus-black/30 border-t-campus-black rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>{loginMode === "magiclink" ? "Send Access Link" : "Authenticate"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="h-[1px] flex-1 bg-white/10"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Or Continue With</span>
            <div className="h-[1px] flex-1 bg-white/10"></div>
          </div>

          <button 
            type="button" 
            onClick={handleGoogleAuth}
            className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold py-3.5 rounded-sm transition-colors flex items-center justify-center gap-3"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Google Workplace (@nie.ac.in)</span>
          </button>
        </motion.div>

        <p className="text-center text-text-secondary text-xs mt-8">
          Don't have an account? <Link href="/signup" className="text-accent-amber hover:underline font-bold tracking-wide">CREATE AN ACCOUNT</Link><br/><br/>
          By authenticating, you agree to the NIE Sync{" "}
          <Link href="/terms-of-service" className="text-white hover:underline">Terms of Service</Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="text-white hover:underline">Privacy Policy</Link>.
        </p>

      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-campus-black w-full flex items-center justify-center text-white/50 animate-pulse">Loading secure connection...</div>}>
      <LoginContent />
    </Suspense>
  )
}

