"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Mail, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [loginMode, setLoginMode] = useState<"password" | "magiclink">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "invalid-domain") {
      setError("Access Denied: Please use your @nie.ac.in institutional email.");
      router.replace("/login");
    }
  }, [searchParams, router]);

  const checkProviderBeforeLogin = async (supabase: any) => {
    // Attempt to lookup the profile's auth_provider without needing RLS bypass if email is matched
    // Requires a secure RPC or we can just attempt login and catch the specific Error.
    // Easiest method within pure client constraints: Attempt auth, intercept "Invalid login credentials".
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    // Simulate domain restriction natively
    if (!email.endsWith("@nie.ac.in")) {
      setError("Access Denied: Only @nie.ac.in institutional emails are authorized.");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    
    // MAGIC LINK FLOW (Send Magic Link)
    if (loginMode === "magiclink" && !magicLinkSent) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
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
        setSuccess("Magic Link dispatched! Check your institutional email inbox to instantly authenticate safely without a password.");
        setMagicLinkSent(true);
      }
      setIsLoading(false);
      return;
    }

    // PASSWORD FLOW
    if (password.length < 6) {
      setError("Invalid credentials. Password must be at least 6 characters.");
      setIsLoading(false);
      return;
    }

    // Attempt Sign In
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Identity Header check heuristic 
      // Supabase returns standard "Invalid login credentials" if pasword fails or if it's purely an OAuth account.
      // We will provide a smart hint to the user if this error occurs.
      if (error.message.includes("Invalid login credentials")) {
        setError("Invalid credentials. If you previously registered using Google Workspace or Magic Link, please use those respective options instead.");
      } else {
        setError(error.message);
      }
      
      setIsLoading(false);
      return;
    }

    // Success redirect
    router.push("/lost-and-found");
  };

  const handleGoogleAuth = async () => {
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (error) {
      setError(error.message);
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
                  placeholder="name.yr@nie.ac.in" 
                  className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20 disabled:opacity-50"
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
                      Use Magic Link?
                    </button>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-amber/50 transition-colors text-white placeholder:text-white/20"
                      required={loginMode === "password"}
                    />
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
                    <span className="text-xs leading-relaxed">We will dispatch a secure Magic Link to your institutional inbox. Click it to log in without a password.</span>
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
                    <span>{loginMode === "magiclink" ? "Dispatch Magic Link" : "Authenticate"}</span>
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
          By authenticating, you agree to the Campus Sync <a href="#" className="text-white hover:underline">Terms of Service</a> and <a href="#" className="text-white hover:underline">Privacy Policy</a>.
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
