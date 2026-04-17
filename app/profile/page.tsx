"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveClientUser } from "@/utils/supabase/authClient";
import { MobileToast } from "@/components/MobileToast";
import ImageCropper from "@/components/ImageCropper";
import { normalizePhoneNumber, validateRequiredPhoneNumber } from "@/lib/phone";
import PhoneInput from "react-phone-number-input";

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
  email_verified: boolean | null;
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

function mapProfileUpdateError(error: any) {
  if (isUsernameAlreadyTakenError(error)) {
    return "This username is already taken.";
  }

  const message = String(error?.message || "");
  const normalized = `${error?.code || ""} ${message}`.toLowerCase();

  if (normalized.includes("once every 30 days")) {
    return "Username can be changed only once every 30 days.";
  }
  if (normalized.includes("3 times in 365 days") || normalized.includes("at most 3 times")) {
    return "Username can be changed only 3 times in a 365-day period.";
  }
  if (normalized.includes("usn cannot be changed")) {
    return "USN is locked after initial profile setup and cannot be changed.";
  }
  if (normalized.includes("user type cannot be changed")) {
    return "User type is locked after initial profile setup and cannot be changed.";
  }

  return message || "Unable to save profile.";
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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mobileToast, setMobileToast] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsLoading(true);
      setError("");

      try {
        const { user, errorMessage } = await resolveClientUser(supabase);

        if (!active) return;

        if (!user) {
          if (errorMessage) {
            setError(errorMessage);
          }
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

  useEffect(() => {
    if (!error) return;
    setMobileToast({ kind: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (!success) return;
    setMobileToast({ kind: "success", message: success });
  }, [success]);

  const handleFileSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be under 5MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use JPG, PNG, or WEBP image format.");
      return;
    }
    setCropFile(file);
    setShowCropper(true);
  };

  const handleCroppedUpload = async (blob: Blob) => {
    const file = new File([blob], "avatar.png", { type: "image/png" });
    setShowCropper(false);
    setCropFile(null);
    await handleAvatarUpload(file);
  };
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

      const role = profile?.user_type === "Faculty" ? "Faculty" : String(draft.role || "Day Scholar").trim();
      const isHostelite = role === "Hostelite";

      const payload = {
        first_name: firstName,
        last_name: lastName,
        username: normalizedUsername || null,
        phone: normalizePhoneNumber(normalizedPhone),
        batch: String(draft.batch || "").trim() || null,
        year_of_study: String(draft.year || "").trim() || null,
        role,
        campus: isHostelite ? null : String(draft.campus || "").trim() || null,
        hostel_name: isHostelite ? String(draft.hostelName || "").trim() || null : null,
        room_no: isHostelite ? String(draft.roomNo || "").trim() || null : null,
      };

      const { error: updateError } = await supabase.from("profiles").update(payload).eq("id", userId);

      if (updateError) {
        throw new Error(mapProfileUpdateError(updateError));
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-16 pt-32 text-white md:px-8">
        <div className="mx-auto w-full max-w-5xl animate-pulse space-y-5">
          <div className="h-36 rounded-3xl border border-white/10 bg-white/[0.03]" />
          <div className="h-72 rounded-3xl border border-white/10 bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-16 pt-32 text-white md:px-8">
      {showCropper && cropFile ? (
        <ImageCropper
          file={cropFile}
          onCrop={(blob) => void handleCroppedUpload(blob)}
          onCancel={() => {
            setShowCropper(false);
            setCropFile(null);
          }}
          isUploading={isUploadingAvatar}
        />
      ) : null}
      <MobileToast
        kind={mobileToast?.kind || "info"}
        message={mobileToast?.message || ""}
        open={Boolean(mobileToast?.message)}
        onClose={() => setMobileToast(null)}
      />
      <div className="mx-auto w-full max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.14)_0%,rgba(255,176,0,0.1)_55%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.5)] md:p-7"
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
                      handleFileSelect(file);
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
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25 }}
                      className="relative ml-3 inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/12 shadow-[0_0_18px_rgba(29,155,240,0.35)]"
                      title="Verified Campus Member"
                    >
                      <img
                        src="/blue_tick.gif"
                        alt=""
                        className="h-full w-full object-contain"
                        loading="eager"
                        decoding="sync"
                        aria-hidden="true"
                      />
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
              className="mt-4 hidden rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:block"
            >
              {error}
            </motion.div>
          ) : null}
          {success ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 hidden items-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm text-green-200 md:inline-flex"
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
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Role</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.role || "-"}</p>
              </div>
              {profile?.user_type === "Student" ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">USN</p>
                    <p className="mt-1 text-sm font-semibold text-white">{profile?.usn || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Batch</p>
                    <p className="mt-1 text-sm font-semibold text-white">{profile?.batch || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Year</p>
                    <p className="mt-1 text-sm font-semibold text-white">{profile?.year_of_study || "-"}</p>
                  </div>
                </>
              ) : null}
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
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
                  Username changes are limited to once every 30 days and max 3 per 365 days.
                </p>
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

              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">User Type</p>
                <p className="mt-1 text-sm font-semibold text-white">{profile?.user_type || "-"}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                  Locked after signup
                </p>
              </div>

              {profile?.user_type === "Student" ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">USN</p>
                    <p className="mt-1 text-sm font-semibold text-white">{profile?.usn || "-"}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                      Locked after initial setup
                    </p>
                  </div>

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
                </>
              ) : null}

              {profile?.user_type === "Faculty" ? (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Role</p>
                  <p className="mt-1 text-sm font-semibold text-white">Faculty</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
                    Locked
                  </p>
                </div>
              ) : (
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                  Role
                  <select
                    value={draft.role}
                    onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white outline-none transition-colors focus:border-accent-blue/50"
                  >
                    {["Day Scholar", "Hostelite"].map((role) => (
                      <option key={role} value={role} className="bg-campus-black">
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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

