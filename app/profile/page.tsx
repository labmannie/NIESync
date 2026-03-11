"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { User, Mail, Camera, Save, MapPin, Loader2, ArrowLeft, ShieldCheck, Car, Edit2, X, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: "",
    role: "",
    campus: "",
    hostelName: "",
    roomNo: "",
    hasVehicle: false,
    vehicleNo: ""
  });

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

  const startEditing = () => {
    setEditForm({
      phone: profile?.phone || "",
      role: profile?.role || "Day Scholar",
      campus: profile?.campus || "South Campus",
      hostelName: profile?.hostel_name || "NIE North Boys Hostel",
      roomNo: profile?.room_no || "",
      hasVehicle: profile?.has_vehicle || false,
      vehicleNo: profile?.vehicle_no || ""
    });
    setIsEditing(true);
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editForm.hasVehicle && !editForm.vehicleNo) {
        throw new Error("Vehicle number is required if you have a vehicle.");
      }
      if (editForm.role === "Hostelite" && !editForm.roomNo) {
         throw new Error("Room number is required for hostelites.");
      }

      const updates = {
        phone: editForm.phone,
        role: editForm.role,
        campus: editForm.role === "Hostelite" ? null : editForm.campus,
        hostel_name: editForm.role === "Hostelite" ? editForm.hostelName : null,
        room_no: editForm.role === "Hostelite" ? editForm.roomNo : null,
        has_vehicle: editForm.hasVehicle,
        vehicle_no: editForm.hasVehicle ? editForm.vehicleNo : null
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, ...updates });
      setIsEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (err: any) {
      setError(err.message);
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
      
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size must be strictly under 2MB.");
        return;
      }

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

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

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

      <div className="w-full max-w-4xl pt-28 px-4 md:px-8 relative z-10">
        
        {/* Navigation Return */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/lost-and-found" className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors text-xs font-bold uppercase tracking-wider">
            <ArrowLeft className="w-4 h-4" />
            Gateway
          </Link>

          {!isEditing ? (
            <button 
              onClick={startEditing}
              className="inline-flex items-center gap-2 text-accent-blue hover:text-white transition-colors text-xs font-bold uppercase tracking-wider bg-accent-blue/10 hover:bg-accent-blue/20 px-4 py-2 rounded-sm border border-accent-blue/20"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
             <div className="flex gap-3">
               <button 
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors text-xs font-bold uppercase tracking-wider px-4 py-2"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 text-white bg-green-500 hover:bg-green-600 transition-colors text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
             </div>
          )}
        </div>
        
        {/* Profile Header Block */}
        <div className="glass-card p-6 md:p-10 rounded-sm border border-white/10 flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-blue via-cyan-400 to-transparent"></div>
          
          {/* Avatar Upload Hub */}
          <div className="relative group shrink-0">
            <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full border border-white/20 bg-black/50 overflow-hidden shadow-2xl relative flex flex-col items-center justify-center transition-all duration-300 ${!isEditing ? 'pointer-events-none' : 'group-hover:border-accent-blue scale-100 group-hover:scale-105'}`}>
              {profile?.avatar_url ? (
                <Image src={profile.avatar_url} alt="Profile Photo" fill className="object-cover" />
              ) : (
                <User className="w-16 h-16 text-white/20" />
              )}
              
              <label 
                className={`absolute inset-0 bg-black/60 opacity-0 ${isEditing ? 'group-hover:opacity-100' : ''} transition-opacity duration-300 flex flex-col items-center justify-center cursor-pointer backdrop-blur-sm`}
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <>
                    <Camera className="w-8 h-8 text-white drop-shadow-md" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white mt-2 border-b border-white/50 pb-0.5">Upload Photo</span>
                  </>
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
            {!isEditing && <div className="absolute bottom-2 right-2 w-4 h-4 rounded-full bg-green-500 border border-campus-black shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>}
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
              {(!isEditing && profile?.phone) && (
                <div className="flex items-center gap-2 bg-white/5 py-2 px-3 rounded-sm border border-white/5">
                   <Phone className="w-4 h-4" />
                   {profile?.phone}
                </div>
              )}
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

        {isEditing ? (
          /* Edit Mode Details */
          <div className="glass-card p-6 md:p-8 mt-6 rounded-sm border border-white/10 relative">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2 mb-8">
              <Edit2 className="w-5 h-5 text-accent-blue" /> Modify Profile Details
            </h3>

            <div className="grid md:grid-cols-2 gap-8">
               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Phone Number</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={editForm.phone}
                    onChange={(value) => setEditForm(prev => ({...prev, phone: value || ""}))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus-within:border-accent-blue/50 transition-colors text-white PhoneInputOverride"
                  />
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Campus Status</label>
                  <select 
                    value={editForm.role} 
                    onChange={(e) => setEditForm(prev => ({...prev, role: e.target.value}))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer hover:bg-white/5"
                  >
                    <option value="Day Scholar" className="bg-campus-black">Day Scholar</option>
                    <option value="Hostelite" className="bg-campus-black">Hostelite</option>
                    <option value="Faculty" className="bg-campus-black">Faculty</option>
                  </select>
               </div>

               {editForm.role === "Hostelite" ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Hostel Name</label>
                      <select 
                        value={editForm.hostelName} 
                        onChange={(e) => setEditForm(prev => ({...prev, hostelName: e.target.value}))} 
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer"
                      >
                        <option value="NIE North Boys Hostel" className="bg-campus-black">NIE North Boys Hostel</option>
                        <option value="NIE South Boys Hostel" className="bg-campus-black">NIE South Boys Hostel</option>
                        <option value="NIE Girls Hostel" className="bg-campus-black">NIE Girls Hostel</option>
                        <option value="Other Affiliated Hostel" className="bg-campus-black">Other Affiliated Hostel</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Room Number</label>
                      <input 
                        type="text" value={editForm.roomNo} onChange={(e) => setEditForm(prev => ({...prev, roomNo: e.target.value}))}
                        placeholder="Ex: 204-B" 
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                      />
                    </div>
                  </>
               ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Primary Campus</label>
                    <select 
                      value={editForm.campus} 
                      onChange={(e) => setEditForm(prev => ({...prev, campus: e.target.value}))} 
                      className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer"
                    >
                      <option value="South Campus" className="bg-campus-black">South Campus</option>
                      <option value="North Campus" className="bg-campus-black">North Campus</option>
                    </select>
                  </div>
               )}

               <div className="flex flex-col gap-4 md:col-span-2 border-t border-white/10 pt-6 mt-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Do you drive a vehicle to campus?</label>
                    <div className="flex gap-4">
                      {["No", "Yes"].map((opt) => (
                         <div 
                          key={opt}
                          onClick={() => setEditForm(prev => ({ ...prev, hasVehicle: opt === "Yes" }))}
                          className={`
                            cursor-pointer flex-1 border py-3 rounded-sm text-center text-sm font-bold uppercase tracking-widest transition-all duration-200
                            ${(editForm.hasVehicle && opt === "Yes") || (!editForm.hasVehicle && opt === "No")
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

                  {editForm.hasVehicle && (
                    <div className="flex flex-col gap-2 mt-4">
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">License Plate Number</label>
                      <input 
                        type="text" value={editForm.vehicleNo} onChange={(e) => setEditForm(prev => ({...prev, vehicleNo: e.target.value}))}
                        placeholder="KA-09-XX-XXXX" 
                        className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-xl font-mono text-center tracking-widest focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                      />
                    </div>
                  )}
               </div>
            </div>
          </div>
        ) : (
          /* View Mode Identity Specifics */
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
                <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Location Details</span>
                <p className="text-sm font-medium leading-relaxed max-w-sm mt-1 border-l-2 border-white/10 pl-3 py-1">
                  {profile?.role === 'Hostelite' 
                    ? (profile?.hostel_name ? `${profile?.hostel_name}, Room ${profile?.room_no}` : profile?.address)
                    : (profile?.campus || profile?.address || 'No campus specified')}
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
        )}
      </div>
    </main>
  );
}
