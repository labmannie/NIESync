"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, ChevronRight, ChevronLeft, Check, AlertCircle, Info, Car, Home as HomeIcon, User, Mail, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

const TOTAL_STEPS = 4;

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [signupMode, setSignupMode] = useState<"password" | "magiclink">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "invalid-domain") {
      setError("Access Denied: Please use your @nie.ac.in institutional email.");
      router.replace("/signup");
    }
  }, [searchParams, router]);

  // Form State
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    usn: "",
    phone: "",
    role: "Day Scholar", // Day Scholar, Hostelite, Faculty
    campus: "South Campus",
    hostelName: "NIE North Boys Hostel",
    roomNo: "",
    hasVehicle: "No",
    vehicleNo: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError("");
  };

  const nextStep = async () => {
    // Validation per step
    if (step === 1) {
      if (!formData.email.endsWith("@nie.ac.in")) {
        setError("Only @nie.ac.in institutional emails are authorized.");
        return;
      }

      if (signupMode === "password") {
        if (formData.password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
      } else {
        // MAGIC LINK SIGNUP FLOW
        setIsLoading(true);
        setError("");
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOtp({
          email: formData.email,
          options: {
            shouldCreateUser: true, // Allow user creation for Signup
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        });

        if (error) {
          setError(error.message);
        } else {
          setMagicLinkSent(true);
        }
        setIsLoading(false);
        return;
      }
    }
    
    if (step === 2) {
      if (!formData.firstName || !formData.lastName || !formData.usn || !formData.phone) {
        setError("Please fill all required fields.");
        return;
      }
      if (formData.phone.length < 10) {
        setError("Please enter a valid full phone number.");
        return;
      }
    }

    if (step === 3) {
      if (formData.role === "Hostelite") {
        if (!formData.roomNo) {
          setError("Please provide your hostel room number.");
          return;
        }
      } else {
        if (!formData.campus) {
          setError("Please select your primary campus.");
          return;
        }
      }
    }

    setError("");
    setDirection(1);
    setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const prevStep = () => {
    setError("");
    setDirection(-1);
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.hasVehicle === "Yes" && !formData.vehicleNo) {
      setError("Please provide your vehicle number.");
      return;
    }

    setIsLoading(true);
    setError("");

    const supabase = createClient();
    
    // Step 1: Create Supabase Auth User
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Failed to create account. Please try again.");
      setIsLoading(false);
      return;
    }

    // Step 2: Insert into customized public.profiles table
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: authData.user.id,
        first_name: formData.firstName,
        last_name: formData.lastName,
        usn: formData.usn,
        phone: formData.phone,
        role: formData.role,
        campus: formData.role === 'Hostelite' ? null : formData.campus,
        hostel_name: formData.role === 'Hostelite' ? formData.hostelName : null,
        room_no: formData.role === 'Hostelite' ? formData.roomNo : null,
        has_vehicle: formData.hasVehicle === 'Yes',
        vehicle_no: formData.hasVehicle === 'Yes' ? formData.vehicleNo : null,
        auth_provider: 'email'
      }
    ]);

    if (profileError) {
      // If profile creation fails, we might still have created the auth user.
      // Ideally rollback or inform.
      setError("Auth succeeded but Profile creation failed: " + profileError.message);
      setIsLoading(false);
      return;
    }

    // Fully successful registration
    setIsLoading(false);
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

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4, ease: "easeOut" as any }
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.3, ease: "easeIn" as any }
    })
  };

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex flex-col items-center justify-center relative overflow-hidden selection:bg-accent-blue/30 p-4 pt-28">
      
      {/* Abstract Backgrounds */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-5xl opacity-30 pointer-events-none">
        <div className="absolute top-10 left-10 w-96 h-96 bg-accent-blue/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#8B5CF6]/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        
        {/* Header */}
        <div className="flex flex-col items-center justify-center mb-8">
          <Link href="/" className="w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-4 shadow-xl hover:bg-white/10 transition-colors">
            <Image src="/logo.png" alt="Logo" width={32} height={32} className="w-6 h-6 object-contain" />
          </Link>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-white">Initialize Profile</h1>
          <p className="text-text-secondary text-xs font-bold tracking-[0.2em] mt-2">STEP {step} OF {TOTAL_STEPS}</p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-white/5 h-1.5 mb-10 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-accent-blue to-cyan-400"
            initial={{ width: "25%" }}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </div>

        {/* Card */}
        <div className="glass-card p-6 md:p-10 rounded-sm border border-white/10 shadow-2xl relative min-h-[420px] flex flex-col">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-blue to-transparent" />
          
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-sm text-sm flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 relative">
            <AnimatePresence custom={direction} mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-6"
                >
                  <div className="mb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-white flex items-center gap-2">
                      <Lock className="w-5 h-5 text-accent-blue" />
                      Account Setup
                    </h2>
                    <p className="text-sm text-text-secondary mt-1">We require a verified institutional email.</p>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Institutional Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                      <input 
                        type="email" 
                        name="email"
                        value={formData.email}
                        disabled={magicLinkSent}
                        onChange={handleChange}
                        placeholder="name.yr@nie.ac.in" 
                        className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 disabled:opacity-50"
                        autoFocus
                      />
                    </div>
                  </div>

                  {!magicLinkSent && (
                    <AnimatePresence mode="wait">
                      {signupMode === "password" && (
                        <motion.div 
                          key="password-mode"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex flex-col gap-2"
                        >
                          <label className="text-xs font-bold uppercase tracking-wider text-text-secondary flex justify-between">
                            <span>Secure Password</span>
                            <button type="button" onClick={() => { setSignupMode("magiclink"); setError(""); }} className="text-accent-amber hover:underline tracking-widest uppercase text-[10px]">
                              Use Magic Link?
                            </button>
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                            <input 
                              type="password" 
                              name="password"
                              value={formData.password}
                              onChange={handleChange}
                              placeholder="••••••••" 
                              className="w-full bg-black/40 border border-white/10 rounded-sm py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                              required={signupMode === "password"}
                            />
                          </div>
                        </motion.div>
                      )}

                      {signupMode === "magiclink" && (
                        <motion.div 
                          key="magiclink-request"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex flex-col gap-2"
                        >
                          <div className="flex justify-end w-full">
                            <button type="button" onClick={() => { setSignupMode("password"); setError(""); }} className="text-accent-amber hover:underline tracking-widest uppercase text-[10px] font-bold">
                                Use Password Instead?
                              </button>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-text-secondary bg-white/5 p-3 rounded-sm border border-white/5">
                            <AlertCircle className="w-4 h-4 shrink-0 text-accent-amber" />
                            <span className="text-xs leading-relaxed">We will dispatch a secure Magic Link to your institutional inbox. Click it to authenticate instantly without a password.</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {magicLinkSent && (
                    <motion.div 
                      key="magiclink-sent"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-start gap-2 text-green-400 bg-green-500/10 p-4 rounded-sm border border-green-500/30">
                        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                        <span className="text-sm font-semibold leading-relaxed">Magic Link Dispatched!<br />Please check your institutional email inbox to smoothly continue your identity registration.</span>
                      </div>
                      <button type="button" onClick={() => { setMagicLinkSent(false); setError(""); }} className="bg-white/5 hover:bg-white/10 uppercase tracking-widest py-3 mt-4 font-bold text-xs text-text-secondary rounded-sm transition-colors border border-white/10">
                        Change Email / Resend
                      </button>
                    </motion.div>
                  )}

                  {!magicLinkSent && (
                    <>
                      <div className="my-2 flex items-center gap-4">
                        <div className="h-[1px] flex-1 bg-white/10"></div>
                        <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Or Register With</span>
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
                    </>
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-5"
                >
                  <div className="mb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-accent-blue" />
                      Identity
                    </h2>
                    <p className="text-sm text-text-secondary mt-1">Tell us who you are.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">First Name</label>
                      <input 
                        type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="John" 
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Last Name</label>
                      <input 
                        type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Doe" 
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">University Seat Number (USN)</label>
                    <input 
                      type="text" name="usn" value={formData.usn} onChange={handleChange} placeholder="4NI20CS000" 
                      className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                    />
                    <p className="text-[10px] text-accent-amber mt-1 flex items-center gap-1 font-bold uppercase tracking-wider"><AlertCircle className="w-3 h-3" /> USN cannot be changed once entered. Please verify carefully.</p>
                  </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Phone Number</label>
                      <PhoneInput
                        international
                        defaultCountry="IN"
                        value={formData.phone}
                        onChange={(value) => {
                          setFormData(prev => ({...prev, phone: value || ""}));
                          if(error) setError("");
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus-within:border-accent-blue/50 transition-colors text-white PhoneInputOverride"
                      />
                    </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-6"
                >
                  <div className="mb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-white flex items-center gap-2">
                      <HomeIcon className="w-5 h-5 text-accent-blue" />
                      Residency
                    </h2>
                    <p className="text-sm text-text-secondary mt-1">Required for lost item retrieval radius metrics.</p>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Campus Status</label>
                    <div className="grid grid-cols-3 gap-3 mt-1">
                      {["Day Scholar", "Hostelite", "Faculty"].map((role) => (
                        <div 
                          key={role}
                          onClick={() => setFormData(prev => ({ ...prev, role }))}
                          className={`
                            cursor-pointer border py-3 px-2 rounded-sm text-center text-xs font-bold uppercase tracking-widest transition-all duration-200
                            ${formData.role === role 
                              ? "bg-accent-blue/20 border-accent-blue text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]" 
                              : "bg-black/40 border-white/10 text-text-secondary hover:border-white/30"
                            }
                          `}
                        >
                          {role}
                        </div>
                      ))}
                    </div>
                  </div>

                  {formData.role === "Hostelite" ? (
                    <div className="flex flex-col gap-4 mt-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Hostel Name</label>
                        <select 
                          name="hostelName" value={formData.hostelName} onChange={handleChange} 
                          className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="NIE North Boys Hostel" className="bg-campus-black">NIE North Boys Hostel</option>
                          <option value="NIE South Boys Hostel" className="bg-campus-black">NIE South Boys Hostel</option>
                          <option value="NIE Girls Hostel" className="bg-campus-black">NIE Girls Hostel (Yandahalli)</option>
                          <option value="Other Affiliated Hostel" className="bg-campus-black">Other Affiliated Hostel</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Room Number</label>
                        <input 
                          type="text" name="roomNo" value={formData.roomNo} onChange={handleChange} 
                          placeholder="Ex: 204-B" 
                          className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 mt-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Primary Campus</label>
                        <select 
                          name="campus" value={formData.campus} onChange={handleChange} 
                          className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="South Campus" className="bg-campus-black">South Campus</option>
                          <option value="North Campus" className="bg-campus-black">North Campus</option>
                        </select>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="step4"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-6"
                >
                  <div className="mb-2">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-white flex items-center gap-2">
                      <Car className="w-5 h-5 text-accent-blue" />
                      Vehicle Registry
                    </h2>
                    <p className="text-sm text-text-secondary mt-1">Vital for Parking Patrol authorization.</p>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Do you drive a vehicle to campus?</label>
                    <div className="flex gap-4 mt-1">
                      {["No", "Yes"].map((opt) => (
                        <div 
                          key={opt}
                          onClick={() => setFormData(prev => ({ ...prev, hasVehicle: opt }))}
                          className={`
                            cursor-pointer flex-1 border py-4 rounded-sm text-center text-sm font-bold uppercase tracking-widest transition-all duration-200
                            ${formData.hasVehicle === opt 
                              ? "bg-accent-blue/20 border-accent-blue text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]" 
                              : "bg-black/40 border-white/10 text-text-secondary hover:border-white/30"
                            }
                          `}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {formData.hasVehicle === "Yes" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2 mt-2"
                      >
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">License Plate Number</label>
                        <input 
                          type="text" name="vehicleNo" value={formData.vehicleNo} onChange={handleChange} 
                          placeholder="KA-09-XX-XXXX" 
                          className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-xl font-mono text-center tracking-widest focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                          autoFocus
                        />
                        <div className="flex items-center gap-2 mt-2 text-text-secondary bg-white/5 p-3 rounded-sm">
                          <Info className="w-4 h-4 shrink-0" />
                          <span className="text-xs leading-relaxed">By registering this vehicle, you permit the NIE Sync Parking Patrol system to verify your parking authorization organically.</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-10 pt-6 border-t border-white/10">
            {step > 1 ? (
              <button 
                onClick={prevStep}
                className="flex items-center gap-2 text-text-secondary hover:text-white font-bold uppercase tracking-wider text-xs px-4 py-2 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Return
              </button>
            ) : (
              <div /> // Placeholder for space-between
            )}

            {step < TOTAL_STEPS && !magicLinkSent && (
              <button 
                onClick={nextStep}
                disabled={isLoading}
                className="bg-white text-campus-black font-black uppercase tracking-widest text-xs px-8 py-3.5 clip-diagonal hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                {isLoading && step === 1 ? (
                  <span className="w-4 h-4 border-2 border-campus-black/30 border-t-campus-black rounded-full animate-spin"></span>
                ) : (
                  <>
                    {step === 1 && signupMode === "magiclink" ? "Dispatch Link" : "Proceed"}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {step === TOTAL_STEPS && !magicLinkSent && (
              <button 
                onClick={handleComplete}
                disabled={isLoading}
                className="bg-accent-blue text-white font-black uppercase tracking-widest text-xs px-8 py-3.5 clip-diagonal hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:opacity-70 disabled:hover:bg-accent-blue"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    Finalize Registry
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        
        <p className="text-center text-text-secondary text-xs mt-8">
          Already verified? <Link href="/login" className="text-white hover:underline font-bold tracking-wide">ACCESS PORTAL</Link>
        </p>

      </div>
    </main>
  );
}

export default function Signup() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-campus-black w-full flex items-center justify-center text-white/50 animate-pulse">Loading secure connection...</div>}>
      <SignupContent />
    </Suspense>
  )
}
