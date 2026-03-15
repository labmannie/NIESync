"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Loader2, ArrowLeft, Laptop, Monitor, Smartphone, LogOut } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

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

function formatSessionDeviceLabel(userAgent?: string | null) {
  const raw = String(userAgent || "");
  if (!raw) return "Unknown Device";
  const browser = getBrowserName(raw);
  const os = getOperatingSystem(raw);
  return `${browser} on ${os}`;
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

function getSessionLocationLabel(row: SessionDeviceRow) {
  const explicitLocation = String(row.location_label || "").trim();
  if (explicitLocation) return explicitLocation;
  const ip = String(row.ip_address || "").trim();
  return ip ? `IP ${ip}` : "Location unavailable";
}

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

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-sm ${className}`} aria-hidden="true" />;
}

export default function SessionsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [authUser, setAuthUser] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionDeviceRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [sessionActionId, setSessionActionId] = useState("");
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchUserAndSessions();
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

      setSessions((data || []) as SessionDeviceRow[]);
    } catch (sessionsError: any) {
      console.error("Error loading sessions:", sessionsError?.message || sessionsError);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const fetchUserAndSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);

      const { data: { session } } = await supabase.auth.getSession();
      const resolvedSessionId = extractSessionIdFromJwt(session?.access_token);
      setCurrentSessionId(resolvedSessionId);

      await loadSessions(user.id, resolvedSessionId);
    } catch (error: any) {
      console.error("Error fetching dependencies:", error.message);
      setIsSessionsLoading(false);
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

  const activeSessions = sessions.filter(s => !s.revoked_at);
  const previousSessions = sessions.filter(s => s.revoked_at).slice(0, 5);

  return (
    <main className="min-h-screen w-full bg-campus-black selection:bg-accent-blue/30 selection:text-white font-sans pt-32 pb-12 md:pt-40 md:pb-24 px-4 sm:px-8">
      <div className="max-w-3xl mx-auto w-full">
        {/* Navigation & Header */}
        <div className="mb-10">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors text-sm font-bold uppercase tracking-widest group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Profile
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white mb-2">
              Login Sessions
            </h1>
            <p className="text-text-secondary max-w-xl">
              Track and manage active device sessions connected to your NIE Sync account.
            </p>
          </div>

          {(error || success) && (
            <div className={`p-4 mb-6 rounded-sm border ${error ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-green-500/10 border-green-500/30 text-green-200"}`}>
              {error || success}
            </div>
          )}

          <div className="glass-card p-6 md:p-8 rounded-sm border border-white/10 relative">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8 border-b border-white/10 pb-6">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-accent-blue" /> Authorized Access Points
                </h3>
              </div>

              <button
                type="button"
                onClick={handleLogoutOtherSessions}
                disabled={isSigningOutOthers || activeSessions.length <= 1}
                className="inline-flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 px-4 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                {isSigningOutOthers ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                Sign Out Other Devices
              </button>
            </div>

            {isSessionsLoading ? (
              <div className="space-y-4">
                <SkeletonBlock className="h-16 w-full" />
                <SkeletonBlock className="h-16 w-full" />
                <SkeletonBlock className="h-16 w-full" />
              </div>
            ) : (
              <div className="space-y-8">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-text-secondary mb-3">Current & Active Connections</p>
                  <div className="space-y-3">
                    {activeSessions.length === 0 && (
                      <p className="text-xs text-text-secondary border border-dashed border-white/10 rounded-sm p-4">
                        No active sessions tracked yet.
                      </p>
                    )}
                    {activeSessions.map((sessionRow) => {
                      const isCurrent = sessionRow.session_id === currentSessionId;
                      const deviceLabel = formatSessionDeviceLabel(sessionRow.user_agent);
                      const locationLabel = getSessionLocationLabel(sessionRow);

                      return (
                        <div key={sessionRow.id} className={`rounded-sm border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${isCurrent ? 'bg-white/5 border-accent-blue/30' : 'bg-black/30 border-white/10'}`}>
                          <div className="min-w-0">
                            <p className="text-[15px] text-white font-bold truncate flex items-center gap-2">
                              {deviceLabel.toLowerCase().includes("ios") || deviceLabel.toLowerCase().includes("android") ? (
                                <Smartphone className="w-5 h-5 text-text-secondary shrink-0" />
                              ) : (
                                <Monitor className="w-5 h-5 text-text-secondary shrink-0" />
                              )}
                              {deviceLabel}
                              {isCurrent && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-400 uppercase tracking-wider ml-1">
                                  Current Session
                                </span>
                              )}
                            </p>
                            <div className="text-xs text-text-secondary mt-1.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                              <span>{locationLabel}</span>
                              <span className="hidden sm:inline opacity-50">•</span>
                              <span>Last active {formatDateTime(sessionRow.last_seen_at)}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoteSessionLogout(sessionRow.session_id)}
                            disabled={sessionActionId === sessionRow.session_id}
                            className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 w-full md:w-auto mt-2 md:mt-0"
                          >
                            {sessionActionId === sessionRow.session_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <LogOut className="w-4 h-4" />
                            )}
                            {isCurrent ? "Log Out" : "Revoke Access"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {previousSessions.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-text-secondary mb-3">Recently Ended Sessions</p>
                    <div className="space-y-3">
                      {previousSessions.map((sessionRow) => (
                        <div key={sessionRow.id} className="rounded-sm border border-white/10 bg-black/20 p-4 opacity-70">
                          <p className="text-sm text-white/90 font-semibold truncate flex items-center gap-2">
                            {formatSessionDeviceLabel(sessionRow.user_agent).toLowerCase().includes("ios") ? (
                              <Smartphone className="w-4 h-4 text-text-secondary shrink-0" />
                            ) : (
                              <Monitor className="w-4 h-4 text-text-secondary shrink-0" />
                            )}
                            {formatSessionDeviceLabel(sessionRow.user_agent)}
                          </p>
                          <p className="text-xs text-text-secondary mt-1.5">
                            {getSessionLocationLabel(sessionRow)} - Ended {formatDateTime(sessionRow.revoked_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
