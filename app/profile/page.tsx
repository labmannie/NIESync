"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Edit3,
  Loader2,
  Phone,
  Save,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { normalizePhoneNumber, validateRequiredPhoneNumber } from "@/lib/phone";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  usn: string | null;
  user_type: string | null;
  batch: string | null;
  year_of_study: string | null;
  role: string | null;
  campus: string | null;
  hostel_name: string | null;
  room_no: string | null;
  avatar_url: string | null;
};

type ProfileDraft = {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  usn: string;
  userType: string;
  batch: string;
  year: string;
  role: string;
  campus: string;
  hostelName: string;
  roomNo: string;
};

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

const BATCH_OPTIONS = ["ISE", "CSE", "CSE(AI/ML)", "MECHANICAL", "CIVIL", "ECE", "EEE", "OTHER"];
const YEAR_OPTIONS = ["I Year", "II Year", "III Year", "IV Year"];
const ROLE_OPTIONS = ["Day Scholar", "Hostelite", "Faculty"];

function formatMemberSince(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function normalizeUsername(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function resolveDisplayName(profile: ProfileRow | null) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;

  const username = String(profile?.username || "").trim();
  if (username) return `@${username}`;

  return "Profile";
}

function resolveInitials(profile: ProfileRow | null) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  if (initials) return initials;

  const username = String(profile?.username || "").trim();
  if (username) return username.slice(0, 2).toUpperCase();

  return "U";
}

function toDraft(profile: ProfileRow | null): ProfileDraft {
  return {
    firstName: String(profile?.first_name || ""),
    lastName: String(profile?.last_name || ""),
    username: String(profile?.username || ""),
    phone: String(profile?.phone || ""),
    usn: String(profile?.usn || ""),
    userType: String(profile?.user_type || "Student"),
    batch: String(profile?.batch || ""),
    year: String(profile?.year_of_study || ""),
    role: String(profile?.role || "Day Scholar"),
    campus: String(profile?.campus || "South Campus"),
    hostelName: String(profile?.hostel_name || "NIE North Boys Hostel"),
    roomNo: String(profile?.room_no || ""),
  };
}

function isUsernameAlreadyTakenError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("username");
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(toDraft(null));

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsLoading(true);
      setError("");

      try {
        const result = await supabase.auth.getSession();
        const user = result?.data?.session?.user || null;

        if (!active) return;

        if (!user) {
          window.location.href = "/login";
          return;
        }

        setUserId(user.id);
        setUserEmail(user.email || "");
        setMemberSince(formatMemberSince(user.created_at));

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, first_name, last_name, username, phone, usn, user_type, batch, year_of_study, role, campus, hostel_name, room_no, avatar_url, email_verified"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          throw profileError;
        }

        const row = (data || null) as ProfileRow | null;
        setProfile(row);
        setDraft(toDraft(row));
      } catch (bootstrapError: any) {
        if (!active) return;
        setError(bootstrapError?.message || "Unable to load profile details.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  const handleAvatarUpload = async (file: File) => {
    if (!userId) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be under 5MB.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use JPG, PNG, or WEBP image format.");
      return;
    }

    setIsUploadingAvatar(true);
    setError("");
    setSuccess("");

    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${Date.now()}-avatar.${extension}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = String(data.publicUrl || "");

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev));
      setSuccess("Profile photo updated.");
    } catch (uploadError: any) {
      setError(uploadError?.message || "Unable to upload profile photo.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const normalizedUsername = normalizeUsername(draft.username).trim();
      if (normalizedUsername && !USERNAME_REGEX.test(normalizedUsername)) {
        throw new Error("Username must be 3-20 chars and can use lowercase letters, numbers, underscore.");
      }

      const { normalizedPhone, error: phoneError } = validateRequiredPhoneNumber(draft.phone, {
        invalidMessage: "Please provide a valid phone number.",
      });
      if (phoneError) {
        throw new Error(phoneError);
      }

      const firstName = String(draft.firstName || "").trim();
      const lastName = String(draft.lastName || "").trim();
      if (!firstName || !lastName) {
        throw new Error("First name and last name are required.");
      }

      const role = String(draft.role || "Day Scholar").trim();
      const isHostelite = role === "Hostelite";

      const payload = {
        first_name: firstName,
        last_name: lastName,
        username: normalizedUsername || null,
        phone: normalizePhoneNumber(normalizedPhone),
        usn: String(draft.usn || "").trim().toUpperCase() || null,
        user_type: String(draft.userType || "Student") || null,
        batch: String(draft.batch || "").trim() || null,
        year_of_study: String(draft.year || "").trim() || null,
        role,
        campus: isHostelite ? null : String(draft.campus || "").trim() || null,
        hostel_name: isHostelite ? String(draft.hostelName || "").trim() || null : null,
        room_no: isHostelite ? String(draft.roomNo || "").trim() || null : null,
      };

      const { error: updateError } = await supabase.from("profiles").update(payload).eq("id", userId);

      if (updateError) {
        if (isUsernameAlreadyTakenError(updateError)) {
          throw new Error("This username is already taken.");
        }
        throw updateError;
      }

      setProfile((prev) => (prev ? { ...prev, ...payload } : prev));
      setDraft((prev) => ({ ...prev, username: normalizedUsername, phone: payload.phone || "" }));
      setIsEditing(false);
      setSuccess("Profile updated.");
    } catch (saveError: any) {
      setError(saveError?.message || "Unable to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const displayName = resolveDisplayName(profile);
  const profileInitials = resolveInitials(profile);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
        <div className="mx-auto w-full max-w-5xl animate-pulse space-y-5">
          <div className="h-36 rounded-3xl border border-white/10 bg-white/[0.03]" />
          <div className="h-72 rounded-3xl border border-white/10 bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.45)] md:p-7"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <label className="group relative inline-flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.05]">
                {profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt={displayName} fill className="object-cover" />
                ) : (
                  <span className="text-xl font-black uppercase text-white/90">{profileInitials}</span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {isUploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={isUploadingAvatar}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleAvatarUpload(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Profile Overview</p>
                <h1 className="mt-1 flex items-center text-2xl font-black tracking-tight md:text-4xl">
                  {displayName}
                  {userEmail.toLowerCase().endsWith("@nie.ac.in") && profile?.email_verified && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: 1, 
                        opacity: 1,
                        rotate: 360
                      }}
                      whileHover={{ scale: 1.15, filter: "drop-shadow(0 0 8px rgba(29, 155, 240, 0.6))" }}
                      transition={{ 
                        rotate: { repeat: Infinity, duration: 15, ease: "linear" },
                        scale: { type: "spring", stiffness: 260, damping: 15, delay: 0.1 }
                      }}
                      className="ml-3 inline-flex items-center justify-center text-[#1d9bf0]"
                      title="Verified Campus Member"
                    >
                      <svg viewBox="0 0 24 24" className="h-6 w-6 md:h-7 md:w-7" fill="currentColor">
                        <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.792-3.918 3.998 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.52.816 2.846 2.026 3.522-.05.31-.076.63-.076.953 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C9.182 21.585 10.49 22.5 12 22.5s2.816-.917 3.337-2.25c.416.165.866.25 1.336.25 2.21 0 3.918-1.792 3.918-3.998 0-.323-.027-.643-.076-.953 1.21-.676 2.026-2.002 2.026-3.522zm-12.062 4.417c-.36.36-.946.36-1.306 0l-3.36-3.36c-.36-.36-.36-.945 0-1.305.36-.36.945-.36 1.305 0l2.707 2.707 6.02-6.02c.36-.36.945-.36 1.305 0 .36.36.36.946 0 1.306l-6.67 6.672z"></path>
                      </svg>
                    </motion.span>
                  )}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">{userEmail || "No email found"}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-white/45">
                  Member since {memberSince || "-"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(toDraft(profile));
                      setIsEditing(false);
                      setError("");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/[0.1]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(toDraft(profile));
                    setError("");
                    setSuccess("");
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/20"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </motion.header>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </motion.div>
          ) : null}
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm text-green-200"
            >
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
            Core Profile Details
          </h2>

          {!isEditing ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Name</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "-"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Username</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {profile?.username ? `@${profile.username}` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Phone</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.phone || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">User Type</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.user_type || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">USN</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.usn || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Role</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.role || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Batch</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.batch || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Year</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.year_of_study || "-"}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 sm:col-span-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Residence</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {profile?.role === "Hostelite"
                    ? [profile?.hostel_name, profile?.room_no ? `Room ${profile.room_no}` : ""]
                        .filter(Boolean)
                        .join(", ") || "-"
                    : profile?.campus || "-"}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                First Name
                <input
                  type="text"
                  value={draft.firstName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, firstName: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                />
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                Last Name
                <input
                  type="text"
                  value={draft.lastName}
                  onChange={(event) => setDraft((prev) => ({ ...prev, lastName: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                />
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                Username
                <input
                  type="text"
                  value={draft.username}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      username: normalizeUsername(event.target.value).slice(0, 20),
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm lowercase text-white outline-none transition-colors focus:border-accent-blue/50"
                />
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </span>
                <PhoneInput
                  international
                  defaultCountry="IN"
                  value={draft.phone}
                  onChange={(value) =>
                    setDraft((prev) => ({ ...prev, phone: String(value || "") }))
                  }
                  onBlur={() =>
                    setDraft((prev) => ({ ...prev, phone: normalizePhoneNumber(prev.phone) }))
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus-within:border-accent-blue/50 PhoneInputOverride"
                />
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                User Type
                <select
                  value={draft.userType}
                  onChange={(event) => setDraft((prev) => ({ ...prev, userType: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                >
                  <option value="Student" className="bg-campus-black">Student</option>
                  <option value="Faculty" className="bg-campus-black">Faculty</option>
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                USN
                <input
                  type="text"
                  value={draft.usn}
                  onChange={(event) => setDraft((prev) => ({ ...prev, usn: event.target.value.toUpperCase() }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                />
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                Batch
                <select
                  value={draft.batch}
                  onChange={(event) => setDraft((prev) => ({ ...prev, batch: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                >
                  <option value="" className="bg-campus-black">Select batch</option>
                  {BATCH_OPTIONS.map((batch) => (
                    <option key={batch} value={batch} className="bg-campus-black">
                      {batch}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                Year
                <select
                  value={draft.year}
                  onChange={(event) => setDraft((prev) => ({ ...prev, year: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                >
                  <option value="" className="bg-campus-black">Select year</option>
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year} className="bg-campus-black">
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                Role
                <select
                  value={draft.role}
                  onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role} className="bg-campus-black">
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              {draft.role === "Hostelite" ? (
                <>
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                    Hostel
                    <input
                      type="text"
                      value={draft.hostelName}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, hostelName: event.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                    />
                  </label>

                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                    Room No
                    <input
                      type="text"
                      value={draft.roomNo}
                      onChange={(event) => setDraft((prev) => ({ ...prev, roomNo: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                    />
                  </label>
                </>
              ) : (
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary sm:col-span-2">
                  Campus
                  <select
                    value={draft.campus}
                    onChange={(event) => setDraft((prev) => ({ ...prev, campus: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                  >
                    <option value="South Campus" className="bg-campus-black">South Campus</option>
                    <option value="North Campus" className="bg-campus-black">North Campus</option>
                  </select>
                </label>
              )}

            </div>
          )}
        </section>
      </div>
    </main>
  );
}

