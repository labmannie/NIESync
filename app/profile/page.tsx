"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { User, Mail, Camera, Save, MapPin, Loader2, ArrowLeft, ShieldCheck, Car } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email || "");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error: any) {
      console.error("Error fetching profile:", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError("");
      setSuccess("");
      
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      
      // Strict limit max file size to 2MB to save bandwidth/storage
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size must be strictly under 2MB.");
        return;
      }

      // Check format
      if (!file.type.startsWith("image/")) {
        setError("Only valid image files are allowed.");
        return;
      }

      setIsUploading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication failed");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to your newly created 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Request the public url path
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Save URL to the core profile table
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      setSuccess("Profile picture updated securely!");

    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-campus-black w-full flex items-center justify-center text-white/50 animate-pulse">
        <Loader2 className="w-8 h-8 animate-spin text-accent-blue" />
        <span className="ml-3 font-semibold tracking-widest uppercase text-xs">Decrypting Profile...</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-campus-black text-white relative flex justify-center pb-20">
      
      {/* Dynamic Backgrounds */}
      <div className="absolute top-0 left-0 w-full h-[300px] overflow-hidden pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-transparent before:to-campus-black z-0">
        <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-accent-blue/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-4xl pt-32 px-4 md:px-8 relative z-10">
        
        {/* Navigation Return */}
        <Link href="/lost-and-found" className="inline-flex items-center gap-2 text-text-secondary hover:text-white mb-8 transition-colors text-xs font-bold uppercase tracking-wider">
          <ArrowLeft className="w-4 h-4" />
          Gateway
        </Link>
        
        {/* Profile Header Block */}
        <div className="glass-card p-6 md:p-10 rounded-sm border border-white/10 flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-blue via-cyan-400 to-transparent"></div>
          
          {/* Avatar Upload Hub */}
          <div className="relative group shrink-0">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-white/20 bg-black/50 overflow-hidden shadow-2xl relative flex flex-col items-center justify-center">
              {profile?.avatar_url ? (
                <Image src={profile.avatar_url} alt="Profile Photo" fill className="object-cover" />
              ) : (
                <User className="w-16 h-16 text-white/20" />
              )}
              
              <label 
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-sm"
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <Camera className="w-8 h-8 text-white drop-shadow-md" />
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarUpload}
                  disabled={isUploading}
                  className="hidden" 
                />
              </label>
            </div>
            {/* Status indicator */}
            <div className="absolute bottom-2 right-2 w-4 h-4 rounded-full bg-green-500 border border-campus-black shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight flex items-center justify-center md:justify-start gap-3">
              {profile?.first_name} <span className="text-white/40">{profile?.last_name}</span>
            </h1>
            <p className="text-accent-blue font-bold tracking-widest text-sm uppercase mt-2 flex items-center justify-center md:justify-start gap-2">
              <ShieldCheck className="w-4 h-4" />
              Verified {profile?.role} @ NIE
            </p>
            
            <div className="mt-6 flex flex-wrap gap-4 items-center justify-center md:justify-start text-xs font-bold text-text-secondary uppercase tracking-wider">
              <div className="flex items-center gap-2 bg-white/5 py-2 px-3 rounded-sm border border-white/5">
                <Mail className="w-4 h-4" />
                {email}
              </div>
              <div className="flex items-center gap-2 bg-white/5 py-2 px-3 rounded-sm border border-white/5">
                <span className="text-white/40">USN_</span>
                <span className="text-white">{profile?.usn}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Messaging */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-sm text-sm flex items-start gap-2 text-center md:text-left">
              <span>{error}</span>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded-sm text-sm flex items-start gap-2 text-center md:text-left">
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Identity Specifics */}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          
          <div className="glass-card p-6 rounded-sm border border-white/10 relative">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2 mb-6">
              <MapPin className="w-4 h-4" /> Registered Residency Base
            </h3>
            
            <div className="flex flex-col gap-1">
              <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Campus Status</span>
              <span className="text-lg font-bold">{profile?.role}</span>
            </div>

            <div className="flex flex-col gap-1 mt-6">
              <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Saved Address Location</span>
              <p className="text-sm font-medium leading-relaxed max-w-sm mt-1 border-l-2 border-white/10 pl-3 py-1">
                {profile?.address}
              </p>
            </div>
          </div>

          <div className="glass-card p-6 rounded-sm border border-white/10 relative">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2 mb-6">
              <Car className="w-4 h-4" /> Synced Vehicles
            </h3>
            
            {profile?.has_vehicle ? (
              <div className="flex flex-col justify-center h-full pb-8">
                <span className="text-white/30 text-xs font-bold uppercase tracking-widest text-center md:text-left mb-2">Registered Plate Number</span>
                <div className="bg-black/50 border border-white/10 py-5 px-6 font-mono text-2xl tracking-[0.2em] uppercase text-center md:text-left flex items-center justify-between">
                  {profile.vehicle_no}
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,1)]"></div>
                </div>
                <p className="text-xs text-text-secondary mt-4 text-center md:text-left">Actively tracked by NIE Parking Patrol authorization grids.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-[150px] gap-2 p-6 border border-dashed border-white/10 rounded-sm">
                <Car className="w-6 h-6 text-white/20" />
                <span className="text-sm text-text-secondary">No registered vehicles matching this identity trace.</span>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </main>
  );
}
