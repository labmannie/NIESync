"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { User, Mail, Camera, Save, MapPin, Loader2, ArrowLeft, ArrowRight, ShieldCheck, Car, Edit2, X, Phone, Plus, Eye, EyeOff, Check, Download, Trash2, Laptop, Monitor, Smartphone, LogOut, AlertTriangle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/phone";
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';

const BATCH_OPTIONS = ["ISE", "CSE", "CSE(AI/ML)", "MECHANICAL", "CIVIL", "ECE", "EEE", "OTHER"];
const YEAR_OPTIONS = ["I Year", "II Year", "III Year", "IV Year"];
const VEHICLE_PLATE_REGEX = /^[A-Z]{2}-\d{2}-[A-Z]{1,3}-\d{4}$/;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

function formatVehicleNumber(value: string) {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
  const match = cleaned.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,3})(\d{0,4})$/);

  if (!match) return "";

  return [match[1], match[2], match[3], match[4]].filter(Boolean).join("-");
}

function isVehicleAlreadyRegisteredError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("vehicle");
}

function isUsernameAlreadyTakenError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("username");
}

function formatMemberSince(createdAt?: string | null) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function getBrowserName(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  return "Browser";
}

function getOperatingSystem(userAgent: string) {
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown OS";
}

function getLocationFromTimezone(timeZone?: string) {
  if (!timeZone) return "Unknown Location";
  if (timeZone === "Asia/Kolkata") return "Bengaluru, IN";

  const zoneParts = timeZone.split("/");
  const city = zoneParts[zoneParts.length - 1]?.replace(/_/g, " ");
  const region = zoneParts[0]?.replace(/_/g, " ");
  if (!city) return "Unknown Location";
  return region ? `${city}, ${region}` : city;
}

function formatDateTime(timestamp?: string | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-sm ${className}`} aria-hidden="true" />;
}

type SessionDeviceRow = {
  id: string;
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  location_label: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

function extractSessionIdFromJwt(accessToken?: string | null) {
  if (!accessToken) return "";

  const payload = accessToken.split(".")[1];
  if (!payload) return "";

  try {
    const normalizedBase64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof window === "undefined") return "";
    const decoded = window.atob(normalizedBase64);
    const parsed = JSON.parse(decoded);
    return String(parsed?.session_id || "");
  } catch {
    return "";
  }
}

function formatSessionDeviceLabel(userAgent?: string | null) {
  const raw = String(userAgent || "");
  if (!raw) return "Unknown Device";
  const browser = getBrowserName(raw);
  const os = getOperatingSystem(raw);
  return `${browser} on ${os}`;
}

function getSessionLocationLabel(row: SessionDeviceRow) {
  const explicitLocation = String(row.location_label || "").trim();
  if (explicitLocation) return explicitLocation;
  const ip = String(row.ip_address || "").trim();
  return ip ? `IP ${ip}` : "Location unavailable";
}

function isWithinLast24Hours(timestamp?: string | null) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  const elapsed = Date.now() - date.getTime();
  return elapsed <= 24 * 60 * 60 * 1000;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [additionalVehicles, setAdditionalVehicles] = useState<Array<{ id: string; vehicle_no: string }>>([]);
  const [memberSince, setMemberSince] = useState("");
  const [email, setEmail] = useState("");
  const [activeSession, setActiveSession] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleteConsentChecked, setDeleteConsentChecked] = useState(false);
  const [sessions, setSessions] = useState<SessionDeviceRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [sessionActionId, setSessionActionId] = useState("");
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    batch: "",
    year: "",
    username: "",
    phone: "",
    role: "",
    campus: "",
    hostelName: "",
    roomNo: "",
    hasVehicle: false,
    vehicleNo: ""
  });
  const [editAdditionalVehicles, setEditAdditionalVehicles] = useState<string[]>([]);
  const [linkPassword, setLinkPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [isLinkingPassword, setIsLinkingPassword] = useState(false);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userAgent = window.navigator.userAgent || "";
    const browser = getBrowserName(userAgent);
    const os = getOperatingSystem(userAgent);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const location = getLocationFromTimezone(timezone);
    setActiveSession(`${browser} on ${os} - ${location}`);
  }, []);

  const loadSessions = async (userId: string, activeSessionId: string) => {
    setIsSessionsLoading(true);
    try {
      const { data, error: sessionsError } = await supabase
        .from("auth_session_devices")
        .select("id, session_id, user_agent, ip_address, location_label, created_at, last_seen_at, revoked_at")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(25);

      if (sessionsError) {
        if (sessionsError.code === "42P01") {
          setSessions([]);
          return;
        }
        throw sessionsError;
      }

      const nextSessions = (data || []) as SessionDeviceRow[];
      setSessions(nextSessions);

      const currentSession = nextSessions.find((item) => item.session_id === activeSessionId);
      if (currentSession) {
        const deviceLabel = formatSessionDeviceLabel(currentSession.user_agent);
        const locationLabel = getSessionLocationLabel(currentSession);
        setActiveSession(`${deviceLabel} - ${locationLabel}`);
      }
    } catch (sessionsError: any) {
      console.error("Error loading sessions:", sessionsError?.message || sessionsError);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);
      setMemberSince(formatMemberSince(user.created_at));
      setEmail(user.email || "");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const resolvedSessionId = extractSessionIdFromJwt(session?.access_token);
      setCurrentSessionId(resolvedSessionId);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      setPhoneDraft(data?.phone || "");

      const { data: extraVehicles, error: extraVehiclesError } = await supabase
        .from("profile_vehicles")
        .select("id, vehicle_no")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true });

      if (extraVehiclesError && extraVehiclesError.code !== "42P01") {
        throw extraVehiclesError;
      }

      setAdditionalVehicles(extraVehicles || []);
      await loadSessions(user.id, resolvedSessionId);
    } catch (error: any) {
      console.error("Error fetching profile:", error.message);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const startEditing = () => {
    setEditForm({
      firstName: profile?.first_name || "",
      lastName: profile?.last_name || "",
      batch: profile?.batch || "",
      year: profile?.year_of_study || "",
      username: profile?.username || "",
      phone: profile?.phone || "",
      role: profile?.role || "Day Scholar",
      campus: profile?.campus || "South Campus",
      hostelName: profile?.hostel_name || "NIE North Boys Hostel",
      roomNo: profile?.room_no || "",
      hasVehicle: profile?.has_vehicle || false,
      vehicleNo: profile?.vehicle_no || ""
    });
    setEditAdditionalVehicles(additionalVehicles.map((vehicle) => vehicle.vehicle_no));
    setIsEditing(true);
    setError("");
    setSuccess("");
  };

  const handleSendVerificationEmail = async () => {
    if (!email) {
      setError("Unable to find your email for verification.");
      return;
    }

    setIsSendingVerificationEmail(true);
    setError("");
    setSuccess("");

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile&verify_email=1`,
        },
      });

      if (otpError) throw otpError;

      setSuccess("Verification link sent. Please check your NIE email inbox.");
    } catch (err: any) {
      setError(err.message || "Failed to send verification email.");
    } finally {
      setIsSendingVerificationEmail(false);
    }
  };

  const startInlinePhoneEdit = () => {
    setPhoneDraft(profile?.phone || "");
    setIsEditingPhone(true);
    setError("");
    setSuccess("");
  };

  const cancelInlinePhoneEdit = () => {
    setPhoneDraft(profile?.phone || "");
    setIsEditingPhone(false);
  };

  const handleInlinePhoneSave = async () => {
    setIsSavingPhone(true);
    setError("");
    setSuccess("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const normalizedPhone = normalizePhoneNumber(phoneDraft);
      if (normalizedPhone && !isValidPhoneNumber(normalizedPhone)) {
        throw new Error("Please enter a valid phone number.");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ phone: normalizedPhone || null })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile((prev: any) => ({ ...prev, phone: normalizedPhone || null }));
      setEditForm((prev) => ({ ...prev, phone: normalizedPhone }));
      setPhoneDraft(normalizedPhone);
      setIsEditingPhone(false);
      setSuccess(normalizedPhone ? "Phone number updated." : "Phone number removed.");
    } catch (err: any) {
      setError(err.message || "Unable to save phone number.");
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleDownloadData = async () => {
    setIsDownloadingData(true);
    setError("");
    setSuccess("");

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be logged in to export your data.");

      const [
        { data: profileData, error: profileError },
        { data: vehiclesData, error: vehiclesError },
        { data: sessionsData, error: sessionsError },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("profile_vehicles").select("*").eq("profile_id", user.id).order("created_at", { ascending: true }),
        supabase
          .from("auth_session_devices")
          .select("id, session_id, user_agent, ip_address, location_label, created_at, last_seen_at, revoked_at")
          .eq("user_id", user.id)
          .order("last_seen_at", { ascending: false }),
      ]);

      if (profileError) throw profileError;
      if (vehiclesError && vehiclesError.code !== "42P01") throw vehiclesError;
      if (sessionsError && sessionsError.code !== "42P01") throw sessionsError;

      const payload = {
        exported_at: new Date().toISOString(),
        source: "NIE Sync",
        auth: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata,
        },
        profile: profileData,
        vehicles: vehiclesData || [],
        sessions: sessionsData || [],
      };

      const fileContent = JSON.stringify(payload, null, 2);
      const blob = new Blob([fileContent], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `niesync-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setSuccess("Your account data export is ready.");
    } catch (err: any) {
      setError(err.message || "Unable to download your data right now.");
    } finally {
      setIsDownloadingData(false);
    }
  };

  const openDeleteAccountModal = () => {
    setDeleteConfirmationText("");
    setDeleteConsentChecked(false);
    setError("");
    setIsDeleteModalOpen(true);
  };

  const closeDeleteAccountModal = () => {
    if (isDeletingAccount) return;
    setIsDeleteModalOpen(false);
  };

  const handleReauthenticateForDeletion = async () => {
    setError("");
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login?reauth=delete-account");
  };

  const handleDeleteAccount = async () => {
    const isRecentLogin = isWithinLast24Hours(authUser?.last_sign_in_at);
    if (!isRecentLogin) {
      setError("For account safety, please sign in again. Last login must be within the past 24 hours.");
      return;
    }

    if (deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }

    if (!deleteConsentChecked) {
      setError("Please confirm that you understand this action is permanent.");
      return;
    }

    setIsDeletingAccount(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/auth/callback?action=delete-account", {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete account right now.");
      }

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Session can already be invalidated by account deletion.
      }

      setIsDeleteModalOpen(false);
      router.replace("/login?account=deleted");
    } catch (err: any) {
      setError(err.message || "Unable to delete account right now.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleRemoteSessionLogout = async (targetSessionId: string) => {
    if (!authUser?.id) return;

    setSessionActionId(targetSessionId);
    setError("");
    setSuccess("");

    try {
      if (targetSessionId === currentSessionId) {
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/login?session=logged-out");
        return;
      }

      const now = new Date().toISOString();
      const { error: revokeError } = await supabase
        .from("auth_session_devices")
        .update({ revoked_at: now })
        .eq("user_id", authUser.id)
        .eq("session_id", targetSessionId);

      if (revokeError) {
        if (revokeError.code === "42P01") {
          throw new Error("Session tracking is not configured in Supabase yet.");
        }
        throw revokeError;
      }

      await loadSessions(authUser.id, currentSessionId);
      setSuccess("Session revoked. That device will be logged out on its next request.");
    } catch (sessionError: any) {
      setError(sessionError?.message || "Unable to revoke the session right now.");
    } finally {
      setSessionActionId("");
    }
  };

  const handleLogoutOtherSessions = async () => {
    if (!authUser?.id) return;

    setIsSigningOutOthers(true);
    setError("");
    setSuccess("");

    try {
      await supabase.auth.signOut({ scope: "others" });
      if (currentSessionId) {
        const { error: revokeError } = await supabase
          .from("auth_session_devices")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", authUser.id)
          .neq("session_id", currentSessionId)
          .is("revoked_at", null);

        if (revokeError && revokeError.code !== "42P01") throw revokeError;
      }
      await loadSessions(authUser.id, currentSessionId);
      setSuccess("Signed out all other active sessions.");
    } catch (sessionError: any) {
      setError(sessionError?.message || "Unable to sign out other sessions.");
    } finally {
      setIsSigningOutOthers(false);
    }
  };

  const addAnotherVehicleField = () => {
    setEditAdditionalVehicles((prev) => [...prev, ""]);
  };

  const updateAdditionalVehicleField = (index: number, value: string) => {
    setEditAdditionalVehicles((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? formatVehicleNumber(value) : item
      )
    );
  };

  const removeAdditionalVehicleField = (index: number) => {
    setEditAdditionalVehicles((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handleLinkPassword = async () => {
    if (linkPassword.length < 6) {
      setError("Password must be at least 6 characters to link password login.");
      return;
    }

    setIsLinkingPassword(true);
    setError("");
    setSuccess("");

    try {
      const { error: linkError } = await supabase.auth.updateUser({
        password: linkPassword,
      });

      if (linkError) throw linkError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ auth_provider: "both" })
          .eq("id", user.id);
      }

      setProfile((prev: any) => ({ ...prev, auth_provider: "both" }));
      setLinkPassword("");
      setSuccess("Password login linked successfully. You can now use Google or password for this same account.");
    } catch (err: any) {
      setError(err.message || "Unable to link password login right now.");
    } finally {
      setIsLinkingPassword(false);
    }
  };

  const handleSave = async () => {
    setIsSavingProfile(true);
    setError("");
    setSuccess("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const normalizedUsername = normalizeUsername(editForm.username || "").trim();
      if (normalizedUsername && !USERNAME_REGEX.test(normalizedUsername)) {
        throw new Error("Username must be 3-20 characters and use only lowercase letters, numbers, or underscore.");
      }

      if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
        throw new Error("First name and last name are required.");
      }

      const normalizedPhone = normalizePhoneNumber(editForm.phone || "");
      if (normalizedPhone && !isValidPhoneNumber(normalizedPhone)) {
        throw new Error("Please enter a valid phone number.");
      }

      if (editForm.hasVehicle && !editForm.vehicleNo) {
        throw new Error("Vehicle number is required if you have a vehicle.");
      }
      if (editForm.hasVehicle && !VEHICLE_PLATE_REGEX.test(editForm.vehicleNo)) {
        throw new Error("Use a valid plate format: KA-09-AB-1234.");
      }
      if (editForm.role === "Hostelite" && !editForm.roomNo) {
         throw new Error("Room number is required for hostelites.");
      }

      const normalizedAdditionalVehicles = editForm.hasVehicle
        ? editAdditionalVehicles
            .map((vehicleNo) => formatVehicleNumber(vehicleNo))
            .filter(Boolean)
        : [];

      const duplicateVehicleValues = new Set<string>();
      for (const vehicleNo of normalizedAdditionalVehicles) {
        if (!VEHICLE_PLATE_REGEX.test(vehicleNo)) {
          throw new Error("Each additional vehicle must follow format KA-09-AB-1234.");
        }
        if (vehicleNo === editForm.vehicleNo) {
          throw new Error("Primary and additional vehicles cannot be the same.");
        }
        if (duplicateVehicleValues.has(vehicleNo)) {
          throw new Error("Duplicate additional vehicle numbers are not allowed.");
        }
        duplicateVehicleValues.add(vehicleNo);
      }

      const updates = {
        first_name: editForm.firstName.trim(),
        last_name: editForm.lastName.trim(),
        batch: editForm.batch || null,
        year_of_study: editForm.year || null,
        username: normalizedUsername || null,
        phone: normalizedPhone || null,
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

      const { error: deleteExtraVehiclesError } = await supabase
        .from("profile_vehicles")
        .delete()
        .eq("profile_id", user.id);

      if (deleteExtraVehiclesError && deleteExtraVehiclesError.code !== "42P01") {
        throw deleteExtraVehiclesError;
      }

      if (normalizedAdditionalVehicles.length > 0) {
        const { error: insertExtraVehiclesError } = await supabase
          .from("profile_vehicles")
          .insert(
            normalizedAdditionalVehicles.map((vehicleNo) => ({
              profile_id: user.id,
              vehicle_no: vehicleNo,
            }))
          );

        if (insertExtraVehiclesError) throw insertExtraVehiclesError;
      }

      const { data: refreshedAdditionalVehicles } = await supabase
        .from("profile_vehicles")
        .select("id, vehicle_no")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true });

      setAdditionalVehicles(refreshedAdditionalVehicles || []);
      setPhoneDraft(normalizedPhone);
      setEditForm((prev) => ({ ...prev, phone: normalizedPhone }));
      setProfile({ ...profile, ...updates });
      setIsEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (err: any) {
      if (isVehicleAlreadyRegisteredError(err)) {
        setError("This vehicle is already registered to another profile.");
      } else if (isUsernameAlreadyTakenError(err)) {
        setError("This username is already taken. Please choose another username.");
      } else {
        setError(err.message);
      }
    } finally {
      setIsSavingProfile(false);
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

  if (isProfileLoading) {
    return (
      <main className="min-h-screen bg-campus-black text-white relative flex justify-center pb-20">
        <div className="absolute top-0 left-0 w-full h-[300px] overflow-hidden pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-transparent before:to-campus-black z-0">
          <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-accent-blue/10 blur-[120px] rounded-full" />
        </div>

        <div className="w-full max-w-5xl pt-28 px-4 md:px-8 lg:px-10 relative z-10">
          <div className="flex justify-between items-center mb-8">
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-9 w-28" />
          </div>

          <div className="glass-card p-6 md:p-10 rounded-sm border border-white/10 flex flex-col md:flex-row items-start gap-6 md:gap-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-blue via-cyan-400 to-transparent" />
            <SkeletonBlock className="w-32 h-32 md:w-40 md:h-40 rounded-full" />

            <div className="flex-1 w-full space-y-5">
              <div className="space-y-3">
                <SkeletonBlock className="h-12 w-full max-w-lg" />
                <SkeletonBlock className="h-8 w-44 rounded-full" />
                <SkeletonBlock className="h-4 w-40" />
              </div>
              <div className="flex flex-wrap gap-3">
                <SkeletonBlock className="h-9 w-64" />
                <SkeletonBlock className="h-9 w-40" />
                <SkeletonBlock className="h-9 w-44" />
                <SkeletonBlock className="h-9 w-36" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-sm border border-white/10 space-y-4">
              <SkeletonBlock className="h-5 w-56" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
            <div className="glass-card p-6 rounded-sm border border-white/10 space-y-4">
              <SkeletonBlock className="h-5 w-48" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-3 w-3/4" />
            </div>
          </div>

          <div className="mt-6 glass-card p-6 rounded-sm border border-white/10 space-y-4">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-12 w-full" />
            <div className="flex flex-col md:flex-row gap-3">
              <SkeletonBlock className="h-11 w-full md:w-44" />
              <SkeletonBlock className="h-11 w-full md:w-44" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const authProviders = new Set<string>();
  const metadataProviders = Array.isArray(authUser?.app_metadata?.providers)
    ? authUser.app_metadata.providers
    : [];
  metadataProviders.forEach((provider: string) => {
    if (provider) authProviders.add(String(provider).toLowerCase());
  });
  if (authUser?.app_metadata?.provider) {
    authProviders.add(String(authUser.app_metadata.provider).toLowerCase());
  }
  const authProviderFromProfile = String(profile?.auth_provider || "").toLowerCase();
  if (authProviderFromProfile === "both") {
    authProviders.add("google");
    authProviders.add("email");
  } else if (authProviderFromProfile) {
    authProviders.add(authProviderFromProfile);
  }

  const hasGoogleProvider = authProviders.has("google");
  const hasEmailProvider = authProviders.has("email");
  const isGoogleOnlyAccount = hasGoogleProvider && !hasEmailProvider;
  const isEmailVerified = Boolean(profile?.email_verified);
  const isVerifiedUser = hasGoogleProvider || isEmailVerified;
  const verificationMethodText = hasEmailProvider
    ? "Verified via NIE Sync Access Link."
    : "Verified via Google Sign-In.";
  const activeSessions = sessions.filter((item) => !item.revoked_at);
  const previousSessions = sessions.filter((item) => Boolean(item.revoked_at));
  const lastSignInAt = authUser?.last_sign_in_at || null;
  const isRecentLogin = isWithinLast24Hours(lastSignInAt);
  const canConfirmDelete =
    deleteConfirmationText.trim().toUpperCase() === "DELETE" &&
    deleteConsentChecked &&
    isRecentLogin;

  return (
    <main className="min-h-screen bg-campus-black text-white relative flex justify-center pb-20">
      
      {/* Dynamic Backgrounds */}
      <div className="absolute top-0 left-0 w-full h-[300px] overflow-hidden pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-transparent before:to-campus-black z-0">
        <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-accent-blue/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-5xl pt-28 px-4 md:px-8 lg:px-10 relative z-10">
        
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
              Advanced Edit
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
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-2 text-white bg-green-500 hover:bg-green-600 transition-colors text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm disabled:opacity-60"
                >
                  {isSavingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSavingProfile ? "Saving..." : "Save"}
                </button>
             </div>
          )}
        </div>
        
        {/* Profile Header Block */}
        <div className="glass-card p-6 md:p-10 rounded-sm border border-white/10 flex flex-col md:flex-row items-start gap-6 md:gap-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-blue via-cyan-400 to-transparent"></div>
          
          {/* Avatar Upload Hub */}
          <div className="relative group shrink-0 mx-auto md:mx-0">
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

          <div className="flex-1 w-full min-w-0">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
              <div className="text-center md:text-left min-w-0">
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-tight break-words flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <span>{profile?.first_name} <span className="text-white/40">{profile?.last_name}</span></span>
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shrink-0 ${
                      isVerifiedUser
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : "bg-accent-amber/10 text-accent-amber border-accent-amber/30"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {isVerifiedUser ? "Verified" : "Unverified"}
                  </div>
                </h1>
                <div className="mt-4 flex flex-col md:flex-row items-center md:items-start gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-text-secondary font-bold">
                      Member Since
                    </span>
                    <span className="text-xs md:text-sm font-semibold text-white">
                      {memberSince || "--"}
                    </span>
                  </div>
                  <p className="text-sm md:text-base text-white/85 font-semibold tracking-wide">
                    {profile?.role} @ NIE
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-3 w-full md:w-auto">
                {!isEditing && !hasGoogleProvider && !isEmailVerified && (
                  <button
                    type="button"
                    onClick={handleSendVerificationEmail}
                    disabled={isSendingVerificationEmail}
                    className="w-full md:w-auto bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-60"
                  >
                    {isSendingVerificationEmail ? "Sending..." : "Verify Email"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 md:gap-3 items-center justify-center md:justify-start text-[10px] md:text-xs font-bold text-text-secondary uppercase tracking-wider">
              <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                <Mail className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {email}
              </div>
              {hasGoogleProvider && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5 normal-case tracking-normal text-white">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-2 2.9l3.2 2.5c1.9-1.7 2.9-4.2 2.9-7.1 0-.7-.1-1.5-.2-2.2H12Z" />
                    <path fill="#34A853" d="M12 21.5c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2l-3.3 2.5c1.7 3.4 5.2 5.7 8.9 5.7Z" />
                    <path fill="#4A90E2" d="M6.4 13.3c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8L3 7.2C2.4 8.5 2 9.9 2 11.5c0 1.6.4 3 1 4.3l3.4-2.5Z" />
                    <path fill="#FBBC05" d="M12 5.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.6 14.7 1.5 12 1.5c-3.7 0-7.2 2.3-8.9 5.7l3.4 2.5C7.2 7.2 9.4 5.4 12 5.4Z" />
                  </svg>
                  Connected
                </div>
              )}
              {hasEmailProvider && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5 normal-case tracking-normal text-white">
                  <Mail className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent-blue" />
                  Direct Access
                </div>
              )}
              {profile?.username && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                  <span className="text-white/40">USER_</span>
                  <span className="text-white">@{profile.username}</span>
                </div>
              )}
              {profile?.user_type && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                  <span className="text-white/40">TYPE_</span>
                  <span className="text-white">{profile.user_type}</span>
                </div>
              )}
              {profile?.usn && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                  <span className="text-white/40">USN_</span>
                  <span className="text-white">{profile.usn}</span>
                </div>
              )}
              {profile?.batch && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                  <span className="text-white/40">BATCH_</span>
                  <span className="text-white">{profile.batch}</span>
                </div>
              )}
              {profile?.year_of_study && (
                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5">
                  <span className="text-white/40">YEAR_</span>
                  <span className="text-white">{profile.year_of_study}</span>
                </div>
              )}
              {!isEditing && (
                isEditingPhone ? (
                  <div className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-accent-blue/40 normal-case tracking-normal text-white min-w-[220px]">
                    <Phone className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent-blue" />
                    <PhoneInput
                      international
                      defaultCountry="IN"
                      value={phoneDraft}
                      onChange={(value) => setPhoneDraft(value || "")}
                      onBlur={() => setPhoneDraft((prev) => normalizePhoneNumber(prev))}
                      name="phone"
                      autoComplete="tel"
                      inputMode="tel"
                      className="bg-transparent text-[10px] md:text-sm flex-1 outline-none text-white placeholder:text-white/30 PhoneInputOverride"
                    />
                    <button
                      type="button"
                      onClick={handleInlinePhoneSave}
                      disabled={isSavingPhone}
                      className="p-1 rounded-sm text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                      aria-label="Save phone number"
                    >
                      {isSavingPhone ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : <Check className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={cancelInlinePhoneEdit}
                      disabled={isSavingPhone}
                      className="p-1 rounded-sm text-text-secondary hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                      aria-label="Cancel phone edit"
                    >
                      <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startInlinePhoneEdit}
                    className="flex items-center gap-2 bg-white/5 py-1.5 px-2.5 md:py-2 md:px-3 rounded-sm border border-white/5 hover:border-accent-blue/40 hover:text-white transition-colors normal-case tracking-normal"
                    aria-label="Edit phone number"
                  >
                    <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>{profile?.phone || "Add phone number"}</span>
                    <Edit2 className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-70" />
                  </button>
                )
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
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                  />
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                  />
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Username (Optional)</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm(prev => ({ ...prev, username: normalizeUsername(e.target.value).slice(0, 20) }))}
                    placeholder="your_handle"
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                  />
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                    3-20 chars: lowercase letters, numbers, underscore.
                  </p>
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Batch / Branch</label>
                  <select
                    value={editForm.batch}
                    onChange={(e) => setEditForm(prev => ({ ...prev, batch: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer hover:bg-white/5"
                  >
                    <option value="" className="bg-campus-black">Select batch</option>
                    {BATCH_OPTIONS.map((batch) => (
                      <option key={batch} value={batch} className="bg-campus-black">
                        {batch}
                      </option>
                    ))}
                  </select>
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Current Year</label>
                  <select
                    value={editForm.year}
                    onChange={(e) => setEditForm(prev => ({ ...prev, year: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white appearance-none cursor-pointer hover:bg-white/5"
                  >
                    <option value="" className="bg-campus-black">Select year</option>
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year} className="bg-campus-black">
                        {year}
                      </option>
                    ))}
                  </select>
               </div>

               <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">Phone Number</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={editForm.phone}
                    onChange={(value) => setEditForm(prev => ({...prev, phone: value || ""}))}
                    onBlur={() => setEditForm((prev) => ({ ...prev, phone: normalizePhoneNumber(prev.phone) }))}
                    name="phone"
                    autoComplete="tel"
                    inputMode="tel"
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
                    <div className="flex flex-col gap-4 mt-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">License Plate Number (Primary)</label>
                        <input
                          type="text"
                          value={editForm.vehicleNo}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              vehicleNo: formatVehicleNumber(e.target.value),
                            }))
                          }
                          placeholder="KA-09-XX-XXXX"
                          className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 text-xl font-mono text-center tracking-widest focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                        />
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                          Additional Vehicle Numbers
                        </label>
                        <button
                          type="button"
                          onClick={addAnotherVehicleField}
                          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-accent-blue hover:text-white transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Add Another
                        </button>
                      </div>

                      {editAdditionalVehicles.length === 0 && (
                        <p className="text-xs text-text-secondary border border-dashed border-white/10 rounded-sm p-3">
                          No additional vehicles added.
                        </p>
                      )}

                      {editAdditionalVehicles.map((vehicleNo, index) => (
                        <div key={`vehicle-${index}`} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={vehicleNo}
                            onChange={(e) =>
                              updateAdditionalVehicleField(index, e.target.value)
                            }
                            placeholder="KA-09-XX-XXXX"
                            className="flex-1 bg-black/40 border border-white/10 rounded-sm p-3 text-base font-mono tracking-widest focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 uppercase"
                          />
                          <button
                            type="button"
                            onClick={() => removeAdditionalVehicleField(index)}
                            className="p-2 rounded-sm border border-white/10 text-text-secondary hover:text-white hover:border-white/30 transition-colors"
                            aria-label={`Remove vehicle ${index + 1}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
               </div>

               <div className="md:col-span-2 border-t border-white/10 pt-6 mt-2 flex flex-col gap-3">
                 <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                   Email Verification Status
                 </label>
                 {isVerifiedUser ? (
                   <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-sm p-3">
                     {verificationMethodText}
                   </p>
                 ) : (
                   <>
                     <p className="text-sm text-accent-amber bg-accent-amber/10 border border-accent-amber/30 rounded-sm p-3">
                       Unverified. Please verify your email to complete trusted account status.
                     </p>
                     {hasEmailProvider && (
                       <button
                         type="button"
                         onClick={handleSendVerificationEmail}
                         disabled={isSendingVerificationEmail}
                         className="w-fit bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-60"
                       >
                         {isSendingVerificationEmail ? "Sending..." : "Send Verification Link"}
                       </button>
                     )}
                   </>
                 )}
               </div>

               {isGoogleOnlyAccount && (
                 <div className="md:col-span-2 border-t border-white/10 pt-6 mt-2 flex flex-col gap-3">
                   <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                     Link Password Login (Google-only users)
                   </label>
                   <div className="flex flex-col md:flex-row gap-3">
                     <div className="relative flex-1">
                       <input
                         type={showLinkPassword ? "text" : "password"}
                         value={linkPassword}
                         onChange={(e) => setLinkPassword(e.target.value)}
                         placeholder="Create password (min 6 chars)"
                         className="w-full bg-black/40 border border-white/10 rounded-sm p-3.5 pr-12 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20"
                       />
                       <button
                         type="button"
                         onClick={() => setShowLinkPassword((prev) => !prev)}
                         className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors"
                         aria-label={showLinkPassword ? "Hide password" : "Show password"}
                       >
                         {showLinkPassword ? (
                           <EyeOff className="w-5 h-5" />
                         ) : (
                           <Eye className="w-5 h-5" />
                         )}
                       </button>
                     </div>
                     <button
                       type="button"
                       onClick={handleLinkPassword}
                       disabled={isLinkingPassword}
                       className="bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-60"
                     >
                       {isLinkingPassword ? "Linking..." : "Link Password"}
                     </button>
                   </div>
                   <p className="text-xs text-text-secondary">
                     This links password login to the same account you already use with Google.
                   </p>
                 </div>
               )}
            </div>
          </div>
        ) : (
          <>
            <div className="glass-card p-6 rounded-sm border border-white/10 relative mt-6">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2 mb-4">
                <Laptop className="w-4 h-4" /> Active Sessions
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <p className="text-sm text-white font-semibold flex flex-col gap-1">
                    <span>Logged in from: {activeSession || "Browser on Unknown OS - Bengaluru, IN"}</span>
                    {authUser?.last_sign_in_at && (
                      <span className="text-xs text-text-secondary font-normal">
                        Last sign-in: {formatDateTime(authUser.last_sign_in_at)}
                      </span>
                    )}
                  </p>
                  <Link
                    href="/profile/sessions"
                    className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 hover:px-5 transition-all duration-300 rounded-sm text-[11px] font-bold uppercase tracking-widest group"
                  >
                    Manage Login Sessions
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>


            {/* View Mode Identity Specifics */}
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
                    {profile?.role === "Hostelite"
                      ? (profile?.hostel_name ? `${profile?.hostel_name}, Room ${profile?.room_no}` : profile?.address)
                      : (profile?.campus || profile?.address || "No campus specified")}
                  </p>
                </div>
              </div>

              <div className="glass-card p-6 rounded-sm border border-white/10 relative">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2 mb-6">
                  <Car className="w-4 h-4" /> Synced Vehicles
                </h3>

                {(profile?.has_vehicle || additionalVehicles.length > 0) ? (
                  <div className="flex flex-col justify-center h-full pb-8">
                    <span className="text-white/30 text-xs font-bold uppercase tracking-widest text-center md:text-left mb-2">Registered Plate Number(s)</span>

                    {profile?.vehicle_no && (
                      <div className="bg-black/50 border border-white/10 py-5 px-6 font-mono text-2xl tracking-[0.2em] uppercase text-center md:text-left flex items-center justify-between mb-3">
                        {profile.vehicle_no}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,1)]" />
                      </div>
                    )}

                    {additionalVehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className="bg-black/50 border border-white/10 py-3 px-5 font-mono text-lg tracking-[0.18em] uppercase text-center md:text-left mb-2"
                      >
                        {vehicle.vehicle_no}
                      </div>
                    ))}

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

            <div className="glass-card p-6 rounded-sm border border-white/10 relative mt-6">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary mb-4">
                Data Controls
              </h3>
              <p className="text-sm text-white/80 mb-5">
                Download a full copy of your data or permanently delete your NIE Sync account.
              </p>
              <p className="text-xs text-text-secondary mb-5">
                Sensitive actions require a recent login within 24 hours.
              </p>
              <div className="flex flex-col md:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleDownloadData}
                  disabled={isDownloadingData}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-60"
                >
                  {isDownloadingData ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isDownloadingData ? "Preparing..." : "Download My Data"}
                </button>
                <button
                  type="button"
                  onClick={openDeleteAccountModal}
                  disabled={isDeletingAccount}
                  className="inline-flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-300 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-60"
                >
                  {isDeletingAccount ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </button>
              </div>
              {!isRecentLogin && (
                <div className="mt-4 rounded-sm border border-accent-amber/30 bg-accent-amber/10 p-3 text-xs text-accent-amber flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Last login is older than 24 hours. Re-authenticate before deleting your account.
                </div>
              )}
            </div>
          </>
        )}

        <AnimatePresence>
          {isDeleteModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="w-full max-w-xl glass-card border border-white/10 rounded-sm p-6 md:p-7"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-wider text-white">
                      Confirm Account Deletion
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">
                      This permanently removes your NIE Sync account, profile, and linked vehicles.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={isDeletingAccount}
                    className="p-2 rounded-sm border border-white/10 text-text-secondary hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
                    aria-label="Close delete dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-5 rounded-sm border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-secondary">Security Check</p>
                  <p className="text-sm text-white mt-2">
                    Last login: {lastSignInAt ? formatDateTime(lastSignInAt) : "Unavailable"}
                  </p>
                  {isRecentLogin ? (
                    <p className="text-xs text-green-400 mt-2">
                      Eligible for deletion: signed in within the last 24 hours.
                    </p>
                  ) : (
                    <div className="mt-2">
                      <p className="text-xs text-accent-amber">
                        Re-authentication required. Sign in again before deleting your account.
                      </p>
                      <button
                        type="button"
                        onClick={handleReauthenticateForDeletion}
                        className="mt-3 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-sm text-[11px] font-bold uppercase tracking-widest"
                      >
                        <LogOut className="w-4 h-4" />
                        Re-authenticate Now
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                      Type DELETE to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmationText}
                      onChange={(event) => setDeleteConfirmationText(event.target.value)}
                      placeholder="DELETE"
                      className="w-full bg-black/40 border border-white/10 rounded-sm p-3 text-sm focus:outline-none focus:border-red-400/60 transition-colors text-white placeholder:text-white/30"
                    />
                  </div>

                  <label className="flex items-start gap-3 text-xs text-text-secondary leading-relaxed">
                    <input
                      type="checkbox"
                      checked={deleteConsentChecked}
                      onChange={(event) => setDeleteConsentChecked(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border border-white/20 bg-black/50 accent-red-500"
                    />
                    <span>I understand this action is permanent and cannot be undone.</span>
                  </label>
                </div>

                <div className="mt-6 flex flex-col-reverse md:flex-row md:justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={isDeletingAccount}
                    className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={!canConfirmDelete || isDeletingAccount}
                    className="inline-flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 px-5 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    {isDeletingAccount ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    {isDeletingAccount ? "Deleting..." : "Delete Permanently"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
