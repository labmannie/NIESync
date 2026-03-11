"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, Check, AlertCircle, Info, Car, Home as HomeIcon, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

const TOTAL_STEPS = 3;

export default function CompleteProfile() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form State - Excluding email/password since Google Auth provided it
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    usn: "",
    phone: "",
    role: "Day Scholar",
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

  const nextStep = () => {
    if (step === 1) {
      if (!formData.firstName || !formData.lastName || !formData.usn || !formData.phone) {
        setError("Please fill all required fields.");
        return;
      }
      if (formData.phone.length < 10) {
        setError("Please enter a valid full phone number.");
        return;
      }
    }

    if (step === 2) {
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
    
    // Get existing session user from Google Auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Authentication verification failed. Please login again.");
      setIsLoading(false);
      return;
    }

    // Insert into customized public.profiles table
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: user.id,
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
        auth_provider: 'google'
      }
    ]);

    if (profileError) {
      setError("Failed saving profile details: " + profileError.message);
      setIsLoading(false);
      return;
    }

    // Fully successful registration
    setIsLoading(false);
    router.push("/lost-and-found");
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
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-white text-center">Complete Your Profile</h1>
          <p className="text-text-secondary text-xs font-bold tracking-[0.2em] mt-2">STEP {step} OF {TOTAL_STEPS}</p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-white/5 h-1.5 mb-10 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-accent-blue to-cyan-400"
            initial={{ width: "33%" }}
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

              {step === 2 && (
                <motion.div
                  key="step2"
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
              <div /> 
            )}

            {step < TOTAL_STEPS ? (
              <button 
                onClick={nextStep}
                className="bg-white text-campus-black font-black uppercase tracking-widest text-xs px-8 py-3.5 clip-diagonal hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                Proceed
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={handleComplete}
                disabled={isLoading}
                className="bg-accent-blue text-white font-black uppercase tracking-widest text-xs px-8 py-3.5 clip-diagonal hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] disabled:opacity-70 disabled:hover:bg-accent-blue"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    Save Profile
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        
      </div>
    </main>
  );
}
